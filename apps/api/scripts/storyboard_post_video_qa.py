from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.db.repositories.storyboard_repository import StoryboardRepository
from app.services.fal_video_service import FalVideoService
from app.services.fal_image_service import FalImageService
from app.services.video_pipeline import VideoPipelineService
from app.services.avatar_product_tts_catalog import (
    list_storyboard_tts_catalog,
    resolve_storyboard_gemini_language,
)


def _print(title: str, data: Any) -> None:
    print(f"\n=== {title} ===")
    if isinstance(data, (dict, list)):
        print(json.dumps(data, indent=2, default=str))
    else:
        print(data)


def _collect_text(args: argparse.Namespace) -> str:
    parts: list[str] = []
    if args.text:
        parts.append(str(args.text).strip())
    if args.line:
        parts.extend([str(item).strip() for item in args.line if str(item).strip()])
    return " ".join([p for p in parts if p]).strip()


def _normalize_language(value: str) -> str:
    return resolve_storyboard_gemini_language(value)


def _validate_voice(value: str) -> str:
    catalog = list_storyboard_tts_catalog()
    valid = {str(item.get("provider_voice_name")) for item in catalog.get("voices", [])}
    if value not in valid:
        raise ValueError(f"Invalid voice '{value}'. Allowed: {', '.join(sorted(valid))}")
    return value


def is_gs_uri(value: str) -> bool:
    return isinstance(value, str) and value.startswith("gs://")


def resolve_media_input(pipeline: VideoPipelineService, value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Empty media input")
    _print("qa_media_resolve_started", {"input": raw})
    if is_gs_uri(raw):
        _print("qa_media_gs_uri_detected", {"input": raw})
    local_candidate = Path(raw)
    if local_candidate.exists():
        resolved_local = str(local_candidate.resolve())
        _print("qa_media_download_completed", {"input": raw, "local_path": resolved_local})
        return resolved_local
    _print("qa_media_download_started", {"input": raw})
    resolved = pipeline.ensure_local_media_path(raw)
    if not resolved:
        _print("qa_media_resolve_failed", {"input": raw})
        raise ValueError(f"Could not resolve media input: {raw}")
    _print("qa_media_download_completed", {"input": raw, "local_path": str(resolved)})
    return str(resolved)


def run_stitch_only(args: argparse.Namespace) -> dict[str, Any]:
    if not args.scene_video_url:
        raise ValueError("stitch_only requires at least one --scene-video-url")
    pipeline = VideoPipelineService()
    _print("stitch_input", {"project_id": args.project_id, "scene_video_count": len(args.scene_video_url)})
    resolved_scene_videos: list[dict[str, str]] = []
    resolved_video_paths: list[str] = []
    for item in list(args.scene_video_url):
        resolved = resolve_media_input(pipeline, item)
        resolved_scene_videos.append({"input": item, "resolved_path": resolved})
        resolved_video_paths.append(resolved)
    _print("resolved_scene_videos", resolved_scene_videos)
    final_path = pipeline.stitch_videos(
        video_urls=resolved_video_paths,
        project_id=args.project_id or "qa",
        transition_type=args.transition_type,
        transition_duration=float(args.transition_duration),
    )
    inspected = pipeline.inspect_media(final_path)
    return {
        "mode": "stitch_only",
        "scene_video_urls": resolved_video_paths,
        "transition_type": args.transition_type,
        "transition_duration": float(args.transition_duration),
        "final_video_path": final_path,
        "final_has_audio": bool(inspected.get("has_audio")),
        "final_duration_seconds": float(inspected.get("duration_seconds") or 0.0),
    }


def _inspect_media_details(pipeline: VideoPipelineService, media_input: str) -> dict[str, Any]:
    resolved_path = resolve_media_input(pipeline, media_input)
    inspected = pipeline.inspect_media(resolved_path)
    return {
        "input": media_input,
        "resolved_path": resolved_path,
        "duration_seconds": float(inspected.get("duration_seconds") or 0.0),
        "has_video": bool(inspected.get("has_video")),
        "has_audio": bool(inspected.get("has_audio")),
        "video_codec": inspected.get("video_codec"),
        "audio_codec": inspected.get("audio_codec"),
        "width": inspected.get("width"),
        "height": inspected.get("height"),
        "fps": inspected.get("fps"),
        "file_size_bytes": int(inspected.get("file_size_bytes") or 0),
    }


def run_inspect_media(args: argparse.Namespace) -> dict[str, Any]:
    if not args.inspect_media:
        raise ValueError("--inspect-media is required for inspect_media mode")
    pipeline = VideoPipelineService()
    payload = _inspect_media_details(pipeline, args.inspect_media)
    payload["mode"] = "inspect_media"
    _print("qa_media_inspection", payload)
    return payload


def run_generate_storyboard_image(args: argparse.Namespace) -> dict[str, Any]:
    if not args.prompt:
        raise ValueError("--prompt is required for generate_storyboard_image")
    if args.image_model != "storyboard_flux_subject":
        raise ValueError("QA generate_storyboard_image currently supports --image-model storyboard_flux_subject only")
    if not args.subject_image_url:
        raise ValueError("--subject-image-url is required for storyboard_flux_subject")

    subject = str(args.subject_image_url).strip()
    if is_gs_uri(subject):
        raise ValueError("generate_storyboard_image requires a public/signed URL for --subject-image-url; gs:// is not directly accessible to Fal.")

    fal = FalImageService()
    result = fal.generate_flux_subject_image(
        prompt=str(args.prompt),
        subject_image_url=subject,
        image_size={"width": int(args.width), "height": int(args.height)},
        num_inference_steps=int(args.num_inference_steps),
        guidance_scale=float(args.guidance_scale),
        output_format=str(args.output_format),
        metadata={"qa_mode": "generate_storyboard_image", "project_id": args.project_id},
    )
    return {
        "mode": "generate_storyboard_image",
        "image_model": args.image_model,
        "subject_image_url": args.subject_image_url,
        "resolved_subject_image_url": subject,
        "prompt": args.prompt,
        "result": result,
    }


def run_stitch_with_audio(args: argparse.Namespace) -> dict[str, Any]:
    if not args.scene_video_url:
        raise ValueError("stitch_with_audio requires at least one --scene-video-url")
    if not args.audio_url:
        raise ValueError("stitch_with_audio requires --audio-url")
    pipeline = VideoPipelineService()
    _print("stitch_with_audio_input", {
        "project_id": args.project_id,
        "scene_video_count": len(args.scene_video_url),
        "audio_url": args.audio_url,
    })
    resolved_scene_videos: list[dict[str, str]] = []
    resolved_video_paths: list[str] = []
    for item in list(args.scene_video_url):
        resolved = resolve_media_input(pipeline, item)
        resolved_scene_videos.append({"input": item, "resolved_path": resolved})
        resolved_video_paths.append(resolved)
    _print("resolved_scene_videos", resolved_scene_videos)
    resolved_audio = resolve_media_input(pipeline, str(args.audio_url))
    _print("resolved_audio", {"input": str(args.audio_url), "resolved_path": resolved_audio})

    stitched_video = pipeline.stitch_videos(
        video_urls=resolved_video_paths,
        project_id=args.project_id or "qa",
        transition_type=args.transition_type,
        transition_duration=float(args.transition_duration),
    )
    muxed_output = pipeline.renders_dir / f"storyboard-{args.project_id or 'qa'}-qa-muxed.mp4"
    final_video = pipeline.mux_audio_to_video(
        video_path=stitched_video,
        audio_path=resolved_audio,
        output_path=str(muxed_output),
        trim_audio_to_video=True,
    )
    details = _inspect_media_details(pipeline, final_video)
    return {
        "mode": "stitch_with_audio",
        "scene_video_urls": resolved_video_paths,
        "audio_url": resolved_audio,
        "transition_type": args.transition_type,
        "transition_duration": float(args.transition_duration),
        "stitched_video_path": stitched_video,
        "final_video_path": final_video,
        "final_inspection": details,
    }


def run_restitch_project(args: argparse.Namespace) -> dict[str, Any]:
    if not args.project_id:
        raise ValueError("restitch_project requires --project-id")
    db = StoryboardRepository()
    project = db.get_project(args.project_id)
    if not project:
        raise ValueError(f"Project not found: {args.project_id}")
    scenes = sorted(db.list_scenes(args.project_id), key=lambda s: int(getattr(s, "scene_number", 0) or 0))
    if not scenes:
        raise ValueError(f"No scenes found for project {args.project_id}")

    ordered_inputs: list[dict[str, Any]] = []
    source_urls: list[str] = []
    for scene in scenes:
        final_scene_video_url = str(getattr(scene, "final_scene_video_url", "") or "").strip()
        lipsync_video_url = str(getattr(scene, "lipsync_video_url", "") or "").strip()
        scene_video_url = str(getattr(scene, "scene_video_url", "") or "").strip()
        selected_url = final_scene_video_url or lipsync_video_url or scene_video_url
        source_field = (
            "final_scene_video_url"
            if final_scene_video_url
            else "lipsync_video_url"
            if lipsync_video_url
            else "scene_video_url"
            if scene_video_url
            else None
        )
        ordered_inputs.append(
            {
                "scene_id": str(getattr(scene, "id", "") or ""),
                "scene_number": int(getattr(scene, "scene_number", 0) or 0),
                "source_field": source_field,
                "url": selected_url,
            }
        )
        if selected_url:
            source_urls.append(selected_url)

    if not source_urls:
        raise ValueError(f"No stitchable scene videos found for project {args.project_id}")

    _print("restitch_project_inputs", ordered_inputs)
    pipeline = VideoPipelineService()
    resolved_inputs: list[dict[str, str]] = []
    resolved_paths: list[str] = []
    for item in ordered_inputs:
        raw_url = str(item.get("url") or "").strip()
        if not raw_url:
            continue
        resolved = resolve_media_input(pipeline, raw_url)
        resolved_inputs.append(
            {
                "scene_id": str(item.get("scene_id") or ""),
                "scene_number": int(item.get("scene_number") or 0),
                "source_field": str(item.get("source_field") or ""),
                "input_url": raw_url,
                "resolved_path": resolved,
            }
        )
        resolved_paths.append(resolved)
    _print("restitch_project_resolved_inputs", resolved_inputs)

    final_path = pipeline.stitch_videos(
        video_urls=resolved_paths,
        project_id=args.project_id,
        transition_type=args.transition_type,
        transition_duration=float(args.transition_duration),
    )
    inspected = pipeline.inspect_media(final_path)
    write_summary: dict[str, Any] = {"write_project": False}
    if args.write_project:
        db.update_project(
            args.project_id,
            final_video_url=final_path,
            production_status="production_completed",
            workflow_state="production_completed",
            production_substage="package_ready",
            stitching_status="completed",
            package_status="package_ready",
            qc_status="qc_ready",
            production_qa_tools_used=True,
        )
        write_summary = {"write_project": True, "project_id": args.project_id, "final_video_url": final_path}
    return {
        "mode": "restitch_project",
        "project_id": args.project_id,
        "ordered_input_urls": ordered_inputs,
        "resolved_inputs": resolved_inputs,
        "final_video_path": final_path,
        "has_video": bool(inspected.get("has_video")),
        "has_audio": bool(inspected.get("has_audio")),
        "duration_seconds": float(inspected.get("duration_seconds") or 0.0),
        "write_summary": write_summary,
    }


def run_tts_only(args: argparse.Namespace) -> dict[str, Any]:
    text = _collect_text(args)
    if not text:
        raise ValueError("tts_only requires --text or at least one --line")
    fal = FalVideoService()
    normalized_language = _normalize_language(args.language_code)
    voice_name = _validate_voice(args.voice_name)
    _print(
        "tts_input",
        {
            "voice_name": args.voice_name,
            "language_code": normalized_language,
            "text_length": len(text),
        },
    )
    _print(
        "tts_service",
        {
            "class": fal.__class__.__name__,
            "module": fal.__class__.__module__,
        },
    )
    _print("tts_request_started", {"at": time.strftime("%Y-%m-%d %H:%M:%S")})
    started_at = time.time()
    audio_url, metadata = fal.generate_gemini_flash_tts(
        text=text,
        voice=voice_name,
        language_code=normalized_language,
        style_instructions="QA storyboard post-video TTS only",
    )
    elapsed = round(time.time() - started_at, 2)
    _print(
        "tts_request_completed",
        {"elapsed_seconds": elapsed},
    )
    _print(
        "tts_result_keys",
        sorted(list((metadata or {}).keys())),
    )
    _print(
        "tts_output",
        {
            "audio_url": audio_url,
            "local_audio_path": (metadata or {}).get("local_audio_path"),
        },
    )
    return {
        "mode": "tts_only",
        "voice": voice_name,
        "language_code": normalized_language,
        "audio_url": audio_url,
        "metadata": metadata,
    }


def run_lipsync_one(args: argparse.Namespace) -> dict[str, Any]:
    if not args.scene_video_url or len(args.scene_video_url) != 1:
        raise ValueError("lipsync_one requires exactly one --scene-video-url")
    fal = FalVideoService()
    normalized_language = _normalize_language(args.language_code)
    voice_name = _validate_voice(args.voice_name)
    audio_url = str(args.audio_url or "").strip()
    if not audio_url:
        text = _collect_text(args)
        if not text:
            raise ValueError("lipsync_one requires --audio-url or --text/--line")
        audio_url, _ = fal.generate_gemini_flash_tts(
            text=text,
            voice=voice_name,
            language_code=normalized_language,
            style_instructions="QA storyboard lipsync one scene",
        )
    lipsync_video_url, metadata = fal.generate_sync_lipsync_v2(
        video_url=args.scene_video_url[0],
        audio_url=audio_url,
    )
    return {
        "mode": "lipsync_one",
        "scene_video_url": args.scene_video_url[0],
        "audio_url": audio_url,
        "lipsync_video_url": lipsync_video_url,
        "metadata": metadata,
    }


def run_full_existing_videos(args: argparse.Namespace) -> dict[str, Any]:
    if not args.scene_video_url:
        raise ValueError("full_existing_videos requires at least one --scene-video-url")

    settings = get_settings()
    fal = FalVideoService()
    pipeline = VideoPipelineService()
    normalized_language = _normalize_language(args.language_code)
    voice_name = _validate_voice(args.voice_name)

    scene_urls = list(args.scene_video_url)
    lines = [str(item).strip() for item in (args.line or []) if str(item).strip()]
    if not lines:
        lines = [f"Scene {idx + 1} QA narration." for idx in range(len(scene_urls))]
    if len(lines) < len(scene_urls):
        lines.extend([lines[-1]] * (len(scene_urls) - len(lines)))

    tts_outputs: list[dict[str, Any]] = []
    lipsynced_urls: list[str] = []

    for idx, scene_url in enumerate(scene_urls):
        scene_line = lines[idx]
        audio_url, audio_meta = fal.generate_gemini_flash_tts(
            text=scene_line,
            voice=voice_name,
            language_code=normalized_language,
            style_instructions=f"QA full existing videos scene {idx + 1}",
        )
        tts_outputs.append({"scene_index": idx, "line": scene_line, "audio_url": audio_url, "audio_meta": audio_meta})

        lipsync_video_url, lipsync_meta = fal.generate_sync_lipsync_v2(video_url=scene_url, audio_url=audio_url)
        lipsynced_urls.append(lipsync_video_url)
        tts_outputs[-1]["lipsync_video_url"] = lipsync_video_url
        tts_outputs[-1]["lipsync_meta"] = lipsync_meta

    final_path = pipeline.stitch_videos(
        video_urls=lipsynced_urls,
        project_id=args.project_id or "qa",
        transition_type=args.transition_type,
        transition_duration=float(args.transition_duration),
    )

    write_summary: dict[str, Any] = {"write_project": False}
    if args.write_project and args.project_id:
        db = StoryboardRepository()
        project = db.get_project(args.project_id)
        if not project:
            raise ValueError(f"Project {args.project_id} not found")
        scenes = sorted(db.list_scenes(args.project_id), key=lambda s: int(s.scene_number or 0))
        for idx, scene in enumerate(scenes[: len(lipsynced_urls)]):
            db.update_scene(
                args.project_id,
                scene.id,
                scene_video_url=scene_urls[idx],
                scene_video_status="completed",
                lipsync_video_url=lipsynced_urls[idx],
                lipsync_status="completed",
                final_scene_video_url=lipsynced_urls[idx],
            )
        db.update_project(
            args.project_id,
            final_video_url=final_path,
            production_status="production_completed",
            workflow_state="production_completed",
            production_substage="package_ready",
            tts_status="completed",
            lipsync_status="completed",
            package_status="package_ready",
            qc_status="qc_ready",
            production_qa_tools_used=True,
            production_qa_tools_enabled=bool(settings.storyboard_qa_tools_enabled),
        )
        write_summary = {"write_project": True, "project_id": args.project_id, "scene_updates": min(len(scenes), len(lipsynced_urls))}

    return {
        "mode": "full_existing_videos",
        "scene_video_urls": scene_urls,
        "transition_type": args.transition_type,
        "transition_duration": float(args.transition_duration),
        "tts_and_lipsync": tts_outputs,
        "stitched_final_video_path": final_path,
        "write_summary": write_summary,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Storyboard post-video QA harness (no Kling regeneration).\n\n"
            "Examples:\n"
            "1) Inspect uploaded video:\n"
            "PYTHONPATH=. ./venv/bin/python scripts/storyboard_post_video_qa.py --mode inspect_media --inspect-media \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1001.mp4\"\n\n"
            "2) Inspect uploaded audio:\n"
            "PYTHONPATH=. ./venv/bin/python scripts/storyboard_post_video_qa.py --mode inspect_media --inspect-media \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1001_1002_audio.mp3\"\n\n"
            "3) Stitch uploaded videos:\n"
            "PYTHONPATH=. ./venv/bin/python scripts/storyboard_post_video_qa.py --mode stitch_only --project-id qa-firebase-test --transition-type crossfade --transition-duration 0.3 --scene-video-url \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1001.mp4\" --scene-video-url \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1002.mp4\"\n\n"
            "4) Stitch uploaded videos + mux uploaded audio:\n"
            "PYTHONPATH=. ./venv/bin/python scripts/storyboard_post_video_qa.py --mode stitch_with_audio --project-id qa-firebase-test --transition-type crossfade --transition-duration 0.3 --scene-video-url \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1001.mp4\" --scene-video-url \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1002.mp4\" --audio-url \"gs://rangmanch-ai-backend.firebasestorage.app/test/test1001_1002_audio.mp3\"\n\n"
            "5) Re-stitch existing project scenes only (no generation):\n"
            "PYTHONPATH=. ./venv/bin/python scripts/storyboard_post_video_qa.py --mode restitch_project --project-id 14d6dbd3-4960-4f69-a7b0-7f020eb04f7e --transition-type crossfade --transition-duration 0.3\n\n"
            "6) Generate one low-cost storyboard frame with Flux Subject:\n"
            "PYTHONPATH=. ./venv/bin/python scripts/storyboard_post_video_qa.py --mode generate_storyboard_image --image-model storyboard_flux_subject --subject-image-url \"https://example.com/avatar.jpg\" --prompt \"Cinematic vertical storyboard frame of the same person holding the product\" --width 512 --height 896"
        ),
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--mode", choices=["stitch_only", "stitch_with_audio", "restitch_project", "tts_only", "lipsync_one", "full_existing_videos", "inspect_media", "generate_storyboard_image"])
    parser.add_argument("--list-tts-options", action="store_true")
    parser.add_argument("--project-id", dest="project_id")
    parser.add_argument("--scene-id", dest="scene_id")
    parser.add_argument("--scene-video-url", action="append", default=[])
    parser.add_argument("--audio-url")
    parser.add_argument("--voice-name", default="Kore")
    parser.add_argument("--language-code", default="English (India)")
    parser.add_argument("--text")
    parser.add_argument("--line", action="append", default=[])
    parser.add_argument("--write-project", action="store_true")
    parser.add_argument("--transition-type", default="crossfade", choices=["none", "crossfade", "fade_black"])
    parser.add_argument("--transition-duration", type=float, default=0.3)
    parser.add_argument("--inspect-media")
    parser.add_argument("--image-model", default="storyboard_flux_subject")
    parser.add_argument("--subject-image-url")
    parser.add_argument("--prompt")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=896)
    parser.add_argument("--num-inference-steps", type=int, default=6)
    parser.add_argument("--guidance-scale", type=float, default=3.0)
    parser.add_argument("--output-format", default="jpeg")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    settings = get_settings()
    _print("qa_config", {"storyboard_qa_tools_enabled": bool(settings.storyboard_qa_tools_enabled), "mode": args.mode})
    _print("qa_credit_note", "QA mode does not deduct app user credits unless --write-project is passed.")
    if args.list_tts_options:
        catalog = list_storyboard_tts_catalog()
        _print("tts_languages", catalog.get("languages", []))
        _print("tts_voices", catalog.get("voices", []))
        return 0
    if not args.mode:
        parser.error("--mode is required unless --list-tts-options is used")

    try:
      if args.mode == "stitch_only":
          result = run_stitch_only(args)
      elif args.mode == "stitch_with_audio":
          result = run_stitch_with_audio(args)
      elif args.mode == "restitch_project":
          result = run_restitch_project(args)
      elif args.mode == "tts_only":
          try:
              result = run_tts_only(args)
          except Exception as exc:
              provider_body: str | None = None
              response_obj = getattr(exc, "response", None)
              if response_obj is not None:
                  try:
                      provider_body = str(getattr(response_obj, "text", None) or "")
                  except Exception:
                      provider_body = None
              if not provider_body:
                  exc_message = str(exc)
                  if "fal " in exc_message:
                      provider_body = exc_message
              _print("tts_failure", {"error": str(exc), "provider_error_body": provider_body})
              _print("tts_traceback", traceback.format_exc())
              return 1
      elif args.mode == "lipsync_one":
          result = run_lipsync_one(args)
      elif args.mode == "full_existing_videos":
          result = run_full_existing_videos(args)
      elif args.mode == "inspect_media":
          result = run_inspect_media(args)
      elif args.mode == "generate_storyboard_image":
          result = run_generate_storyboard_image(args)
      else:
          raise ValueError(f"Unsupported mode: {args.mode}")
      _print("qa_result", result)
      return 0
    except Exception as exc:
      _print("qa_error", {"error": str(exc), "mode": args.mode})
      return 1


if __name__ == "__main__":
    sys.exit(main())
