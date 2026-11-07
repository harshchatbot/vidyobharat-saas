"""Local, backend-only integration of existing RangManch visual and creative engines.

Pipeline:
  editor_analysis_transcribe.transcribe_source
    -> video_analysis_service.build_video_analysis_report (Visual Analysis V2)
    -> video_creative_context.build_creative_context
    -> video_creative_director_v2.generate_openai_scene_plan / fallback_scene_plan
    -> video_creative_director_v21.compile_composition_v21
    -> HarshVerse scene renderer if a verified animation plate is provided
    -> creative_caption_bridge (existing timeline editor ASS highlight renderer)
    -> FFmpeg captions -> MP4

This does not enable public API routes, alter the frontend, or bypass licensing.
Motion graphics and B-roll require verified media and still remain review-only.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from app.services.editor_analysis_transcribe import transcribe_source
from app.services.harshverse.creative_caption_bridge import (
    build_caption_overlays, write_caption_track,
)
from app.services.harshverse.render_adapter import _duration, _probe
from app.services.video_analysis_service import build_video_analysis_report
from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import (
    fallback_scene_plan, generate_openai_scene_plan, validate_scene_plan,
)
from app.services.video_creative_director_v21 import compile_composition_v21


def _ffmpeg_filter_path(path: Path) -> str:
    """Escape a local path for an FFmpeg subtitles filter argument."""
    # FFmpeg first parses filter expressions then the filter argument. Use
    # ordinary filenames and escape reserved separators in both levels.
    value = str(path.resolve())
    return value.replace("\\", r"\\").replace(":", r"\:").replace("'", r"\'").replace(",", r"\,").replace("[", r"\[").replace("]", r"\]")


def _burn_captions(source: Path, captions: Path, output: Path, *,
                   width: int = 720, height: int = 1280) -> None:
    if not captions.is_file():
        raise FileNotFoundError("Timed caption track was not generated.")
    filter_expr = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1,"
        f"subtitles=filename='{_ffmpeg_filter_path(captions)}'"
    )
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-vf", filter_expr, "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output),
    ], check=True, timeout=300)


async def build_local_creative_preview(
    source: Path, output_dir: Path, *,
    style: str = "elegant",
    transcript_path: Path | None = None,
    scene_plan_path: Path | None = None,
    api_key: str | None = None,
    model: str = "gpt-4o-mini",
    overwrite: bool = False,
) -> dict:
    """Produce a visual-analysis-backed caption preview; preserve source timing.

    If a scene JSON file is supplied it must validate against the real
    source phrases. If no OpenAI key is configured, the existing V2 fallback
    director is used, and the output's provenance explicitly says so.
    """
    source, output_dir = Path(source).expanduser().resolve(), Path(output_dir).expanduser().resolve()
    if style not in ("elegant", "energetic", "cinematic"):
        raise ValueError("Unsupported editing style")
    if not source.is_file():
        raise FileNotFoundError(f"Presenter video not found: {source}")
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "harshverse_creative_preview.mp4"
    if output.exists() and not overwrite:
        raise FileExistsError(f"{output} already exists; use --overwrite if intentional.")
    if output == source:
        raise ValueError("Output may not overwrite source video.")
    media = _probe(source)
    if not any(s.get("codec_type") == "audio" for s in media.get("streams", [])):
        raise ValueError("Presenter recording must include source narration.")
    if not any(s.get("codec_type") == "video" for s in media.get("streams", [])):
        raise ValueError("Presenter must contain video.")
    duration = _duration(media)
    if duration > 60 or duration <= 0:
        raise ValueError("Local HarshVerse V1 requires a video between 0 and 60 seconds.")

    if transcript_path is not None:
        transcript = json.loads(Path(transcript_path).expanduser().read_text(encoding="utf-8"))
        if not isinstance(transcript, dict) or not isinstance(transcript.get("words"), list):
            raise ValueError("Transcript JSON must have a words array.")
        transcription_mode = "provided_word_timestamps"
    else:
        transcript = await transcribe_source(source)
        transcription_mode = "existing_local_stt"

    report = build_video_analysis_report(source, "local-harshverse-preview", transcript=transcript, style=style)
    if report.media.aspect_ratio != "9:16":
        raise ValueError("Local creative preview currently requires a 9:16 presenter; source was not modified.")
    context = build_creative_context(report)
    if not context.phrases:
        raise ValueError("Visual Analysis V2 produced no speech phrases. Cannot generate truthful kinetic captions.")

    if scene_plan_path is not None:
        raw_plan = json.loads(Path(scene_plan_path).expanduser().read_text(encoding="utf-8"))
        scene = validate_scene_plan(context, raw_plan)
        director_mode = "provided_validated_v2_plan"
    elif api_key:
        scene = await generate_openai_scene_plan(context, api_key=api_key, model=model)
        director_mode = "creative_director_v2_openai"
    else:
        scene = fallback_scene_plan(context)
        director_mode = "existing_deterministic_fallback"

    composition = compile_composition_v21(context, scene)
    overlays, caption_warnings = build_caption_overlays(report, context, composition)
    if not overlays:
        raise ValueError("No source-timed caption overlays could be generated.")

    with tempfile.TemporaryDirectory(prefix="rangmanch-creative-local-") as temporary:
        captions_path = Path(temporary) / "captions.ass"
        captions = write_caption_track(captions_path, overlays)
        # The V2.1 composition is a review-only specification. This initial
        # integration does not fabricate or auto-render B-roll/graphic plates.
        # HarshVerse's original video remains uninterrupted, with new timed
        # captions burned directly onto the original frames.
        staged = Path(temporary) / "captioned.mp4"
        _burn_captions(source, captions_path, staged)
        if not staged.is_file() or staged.stat().st_size == 0:
            raise RuntimeError("The captioned preview was not generated.")
        staged.replace(output)

    warnings = list(report.warnings) + list(composition.warnings) + caption_warnings
    deferred = [b.id for b in composition.beats if b.kind in {
        "motion_graphic", "broll_intent", "zoom", "sound_intent",
        "emoji_intent", "lut_intent", "music_intent",
    }]
    if deferred:
        warnings.append("Motion/asset intent beats remain unrendered until verified animation media is prepared.")
    artifacts = {
        "analysis": "visual_analysis_v2.json",
        "context": "creative_context.json",
        "scene_plan": "creative_director_v2.json",
        "composition": "creative_director_v21.json",
        "report": "local_preview_report.json",
    }
    (output_dir / artifacts["analysis"]).write_text(report.model_dump_json(indent=2), encoding="utf-8")
    (output_dir / artifacts["context"]).write_text(context.model_dump_json(indent=2), encoding="utf-8")
    (output_dir / artifacts["scene_plan"]).write_text(scene.model_dump_json(indent=2), encoding="utf-8")
    (output_dir / artifacts["composition"]).write_text(composition.model_dump_json(indent=2), encoding="utf-8")
    result = {
        "status": "preview_requires_review",
        "preview": str(output),
        "source": str(source),
        "duration_seconds": duration,
        "transcription_mode": transcription_mode,
        "director_mode": director_mode,
        "engine": "Visual Analysis V2 + Creative Director V2/V2.1",
        "captions": captions.caption_count,
        "highlighted_words": captions.word_count,
        "deferred_beat_ids": deferred,
        "warnings": list(dict.fromkeys(warnings)),
    }
    (output_dir / artifacts["report"]).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run RangManch's existing Visual Engine + Creative Director locally.")
    parser.add_argument("--presenter", type=Path, default=Path.home() / "Downloads/Test_Talking_Head_Harsh.mp4")
    parser.add_argument("--output-dir", type=Path, default=Path.home() / "Downloads/HarshVerse-Creative")
    parser.add_argument("--style", choices=("elegant", "energetic", "cinematic"), default="energetic")
    parser.add_argument("--transcript", type=Path, help="Existing STT transcript JSON with real word timestamps.")
    parser.add_argument("--scene-plan", type=Path, help="Existing validated Creative Director V2 plan JSON.")
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = asyncio.run(build_local_creative_preview(
            args.presenter, args.output_dir, style=args.style,
            transcript_path=args.transcript, scene_plan_path=args.scene_plan,
            api_key=os.getenv("OPENAI_API_KEY"), model=args.model,
            overwrite=args.overwrite,
        ))
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"Local creative preview failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
