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
import hashlib
import json
import math
import os
import httpx
from dotenv import load_dotenv
from app.core.config import ENV_FILE
from pathlib import Path
import subprocess
import sys
import tempfile

from app.services.editor_analysis_transcribe import transcribe_source
from app.services.harshverse.creative_caption_bridge import (
    build_caption_overlays, write_caption_track,
)
from app.services.harshverse.render_adapter import _duration, _probe, render as render_harshverse
from app.services.harshverse.local_motion_plate import render_motion_plate, build_motion_render_composition
from app.services.harshverse.warm_style import make_buddy_sticker, STYLE_ID as WARM_STYLE
from app.services.harshverse.warm_sfx import synthesize_warm_sfx
from app.services.harshverse.color_grade import resolve_color_grade, presenter_grade_filter
from app.services.harshverse.layered_type import choose_speech_keyword, render_editorial_intro
from app.services.harshverse.person_matte import build_person_matte
from app.services.harshverse.editorial_effects import camera_moves_from_composition, render_camera_effects
from app.services.harshverse.video_fades import video_fade_filter, render_video_fades
from app.services.harshverse.voice_enhance import voice_enhance_filter
from app.services.harshverse.composition_adapter import AnimationPlate, PreparedVisual, compile_harshverse_draft
from app.services.video_analysis_service import build_video_analysis_report
from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import (
    SceneBeat, ScenePlanV2, fallback_scene_plan, generate_openai_scene_plan, validate_scene_plan,
)
from app.services.video_creative_director_v21 import compile_composition_v21


def _ffmpeg_filter_path(path: Path) -> str:
    """Escape a local path for an FFmpeg subtitles filter argument."""
    # FFmpeg first parses filter expressions then the filter argument. Use
    # ordinary filenames and escape reserved separators in both levels.
    value = str(path.resolve())
    return value.replace("\\", r"\\").replace(":", r"\:").replace("'", r"\'").replace(",", r"\,").replace("[", r"\[").replace("]", r"\]")


def _burn_captions(source: Path, captions: Path, output: Path, *,
                   width: int = 720, height: int = 1280,
                   buddy_path: Path | None = None,
                   buddy_windows: tuple[tuple[float, float], ...] = (),
                   sfx_path: Path | None = None,
                   finish_audio: bool = False,
                   voice_enhance: str = "off",
                   original_audio_source: Path | None = None) -> None:
    """Final image/caption and optional ORIGINAL warm SFX mix.

    Original speech stays the first audio input. No cuts, ducking, timing
    changes, added voice, or third-party sample assets are introduced.
    """
    if not captions.is_file():
        raise FileNotFoundError("Timed caption track was not generated.")
    filter_expr = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1,"
        f"subtitles=filename='{_ffmpeg_filter_path(captions)}'"
    )
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
               "-i", str(source)]
    use_original_audio = (
        original_audio_source is not None
        and Path(original_audio_source).resolve() != Path(source).resolve()
    )
    next_input = 1
    audio_index = 0
    if use_original_audio:
        original_audio_source = Path(original_audio_source)
        if not original_audio_source.is_file():
            raise FileNotFoundError("Original narration source does not exist")
        command.extend(["-i", str(original_audio_source)])
        audio_index = next_input
        next_input += 1
    use_buddy = bool(buddy_path and buddy_windows)
    if use_buddy:
        if not buddy_path.is_file():
            raise FileNotFoundError("Warm buddy sticker is missing")
        buddy_input_index = next_input
        command.extend(["-loop", "1", "-framerate", "30", "-i", str(buddy_path)])
        next_input += 1
    if sfx_path is not None:
        if not sfx_path.is_file():
            raise FileNotFoundError("Original warm SFX bed is missing")
        sfx_input_index = next_input
        command.extend(["-i", str(sfx_path)])
        next_input += 1

    filters: list[str] = []
    if use_buddy:
        intervals = [
            f"between(t\\,{start:.3f}\\,{end:.3f})"
            for start, end in buddy_windows if end > start + .05
        ]
        if not intervals:
            raise ValueError("No valid buddy cameo window")
        filters.extend([
            f"[0:v]{filter_expr}[cap]",
            f"[cap][{buddy_input_index}:v]overlay=x=W-w-36:y=150:enable='{'+'.join(intervals)}':"
            "shortest=1:format=auto,format=yuv420p[vout]",
        ])
    else:
        filters.append(f"[0:v]{filter_expr},format=yuv420p[vout]")

    clean_filter = voice_enhance_filter(voice_enhance)
    dialogue = f"[{audio_index}:a:0]"
    if clean_filter:
        filters.append(f"{dialogue}{clean_filter}[voice]")
        dialogue = "[voice]"

    if sfx_path is not None:
        # Enhancement is applied to original dialogue *before* the SFX
        # are mixed; noise reduction never damages synthesized transitions.
        filters.append(
            f"{dialogue}[{sfx_input_index}:a:0]"
            "amix=inputs=2:duration=first:dropout_transition=0:"
            "normalize=0[mixed]"
        )
        mixed = "[mixed]"
    else:
        mixed = dialogue

    if finish_audio:
        filters.append(f"{mixed}loudnorm=I=-17:TP=-1.5:LRA=11[aout]")
        audio_map = "[aout]"
    else:
        # Raw source selectors are not filter labels. A plain classic
        # render must map 0:a:0 (or the original camera audio input),
        # not [0:a:0], which FFmpeg interprets as a missing output pad.
        audio_map = (f"{audio_index}:a:0"
                     if sfx_path is None and not clean_filter else mixed)

    command += [
        "-filter_complex", ";".join(filters),
        "-map", "[vout]", "-map", audio_map,
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", str(output),
    ]
    subprocess.run(command, check=True, timeout=300)


def _apply_presenter_grade(source: Path, destination: Path, grade: str) -> None:
    """Grade only the original camera video; preserve source audio/timing.

    Rendering occurs before any plates, buddy or captions exist. A separate
    temporary input keeps the immutable user recording untouched.
    """
    filter_chain = presenter_grade_filter(grade)
    if not filter_chain:
        raise ValueError("Grade output should not be generated when disabled")
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-map", "0:v:0", "-map", "0:a:0",
        "-vf", filter_chain,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
        str(destination),
    ], check=True, timeout=300)
    if not destination.is_file() or destination.stat().st_size == 0:
        raise RuntimeError("Presenter grade was not rendered")
    original_duration = _duration(_probe(source))
    graded_duration = _duration(_probe(destination))
    if abs(original_duration - graded_duration) > .10:
        raise RuntimeError("Presenter grade changed video duration")


def build_motion_smoke_scene_plan(context):
    """Explicit diagnostic fixture from real phrase IDs, not an AI decision.

    Exposes the end-to-end motion FFmpeg path when an AI editorial plan does
    not request a graphic. This mode is never used in normal Auto Edit.
    """
    phrases = context.phrases
    if len(phrases) < 3:
        raise ValueError("Motion smoke test requires at least three timed speech phrases")
    middle = len(phrases) // 2
    def beat(first, last, mode, template, intent):
        return SceneBeat(
            first_phrase_id=phrases[first].id,
            last_phrase_id=phrases[last].id,
            visual_mode=mode,
            motion_template=template,
            creative_intent=intent,
            emphasis_phrase_id=None,
            zoom_scale=None,
            broll_query=None,
            sound_cue="none",
        )
    plan = ScenePlanV2(
        creative_thesis="Diagnostic only: verify phrase-timed procedural graphics, not automatic editorial choices.",
        scenes=[
            beat(0, middle - 1, "talking_head", "none", "Keep original presenter visible before diagnostic graphic."),
            beat(middle, middle, "graphic_overlay", "keyword_card", "Show the exact spoken phrase in the procedural graphic renderer."),
            beat(middle + 1, len(phrases) - 1, "talking_head", "none", "Return to presenter without changing spoken audio."),
        ],
        warnings=["Diagnostic motion smoke mode: graphic was explicitly selected for FFmpeg validation, not by AI."],
    )
    return validate_scene_plan(context, plan.model_dump(mode="json"))


def _load_scene_plan_baseline_transcript(
    scene_plan_path: Path, source: Path, duration: float,
) -> dict | None:
    """Reuse the immutable transcript which the supplied edit plan used.

    Re-running STT while reusing a scene plan can silently bind phrase_001
    to different words/times. This makes overlays visibly jump out of order
    despite unchanged source audio. Local sibling artifacts are accepted only
    when the original source/duration match; mismatches fail closed.
    """
    scene_plan_path = Path(scene_plan_path).expanduser().resolve()
    folder = scene_plan_path.parent
    analysis_path = folder / "visual_analysis_v2.json"
    report_path = folder / "local_preview_report.json"
    if not analysis_path.is_file() and not report_path.is_file():
        return None
    if not analysis_path.is_file() or not report_path.is_file():
        raise ValueError(
            "Incomplete scene-plan baseline: both visual_analysis_v2.json "
            "and local_preview_report.json are needed for safe timing reuse."
        )
    baseline = json.loads(report_path.read_text(encoding="utf-8"))
    if not isinstance(baseline, dict):
        raise ValueError("Invalid saved scene-plan baseline report")
    saved_source = baseline.get("source")
    saved_duration = baseline.get("duration_seconds")
    if (not isinstance(saved_source, str)
            or Path(saved_source).expanduser().resolve() != source.resolve()
            or not isinstance(saved_duration, (int, float))
            or abs(saved_duration - duration) > .10):
        raise ValueError(
            "Saved scene plan belongs to a different source or duration; "
            "refusing to reuse mismatched timestamps."
        )
    evidence = json.loads(analysis_path.read_text(encoding="utf-8"))
    speech = evidence.get("speech") if isinstance(evidence, dict) else None
    media = evidence.get("media") if isinstance(evidence, dict) else None
    if not isinstance(speech, dict) or not isinstance(media, dict):
        raise ValueError("Saved visual analysis lacks speech/media evidence")
    if abs(float(media.get("duration_seconds", -1)) - duration) > .10:
        raise ValueError("Saved analysis duration differs from source")
    words = speech.get("words")
    if not isinstance(words, list) or not words:
        raise ValueError("Saved visual analysis has no timestamped spoken words")
    extracted = []
    previous = -1.0
    for word in words:
        if not isinstance(word, dict):
            raise ValueError("Invalid saved word timestamp")
        text_value = word.get("text")
        start, end = word.get("start"), word.get("end")
        if (not isinstance(text_value, str) or not text_value.strip()
                or not isinstance(start, (int, float))
                or not isinstance(end, (int, float))
                or not math.isfinite(start) or not math.isfinite(end)
                or start < 0 or end <= start or end > duration + .1
                or start < previous - .025):
            raise ValueError("Saved words must have ordered source timestamps")
        extracted.append({"text": text_value, "start": start, "end": end})
        previous = start
    return {"language": speech.get("language"), "words": extracted}


def _assert_scene_plan_phrase_alignment(
    scene_plan_path: Path, context: CreativeContext,
) -> None:
    """Reject stale phrase IDs that match syntactically but not semantically."""
    previous = Path(scene_plan_path).expanduser().resolve().parent / "creative_context.json"
    if not previous.is_file():
        return
    record = json.loads(previous.read_text(encoding="utf-8"))
    phrases = record.get("phrases") if isinstance(record, dict) else None
    if not isinstance(phrases, list):
        raise ValueError("Saved scene-plan context is invalid")
    current = [
        (p.id, p.text, round(p.start, 2), round(p.end, 2))
        for p in context.phrases
    ]
    baseline = [
        (p.get("id"), p.get("text"), round(float(p.get("start")), 2),
         round(float(p.get("end")), 2))
        for p in phrases
    ]
    if current != baseline:
        raise ValueError(
            "Scene-plan phrase timings/content changed since its original "
            "analysis. Use the matching baseline transcript instead of "
            "re-running STT or approving visually desynchronized effects."
        )


async def build_local_creative_preview(
    source: Path, output_dir: Path, *,
    style: str = "elegant",
    transcript_path: Path | None = None,
    scene_plan_path: Path | None = None,
    api_key: str | None = None,
    model: str = "gpt-4o-mini",
    overwrite: bool = False,
    smoke_motion: bool = False,
    visual_style: str = "classic",
    color_grade: str = "auto",
    editorial_intro: bool = False,
    person_matte_model: Path | None = None,
    voice_enhance: str = "off",
    motion_engine: str = "illustrated",
    blender_bin: Path | None = None,
    blender_quality: str = "preview",
    visual_fade_seconds: float = 0.0,
) -> dict:
    """Produce a visual-analysis-backed caption preview; preserve source timing.

    If a scene JSON file is supplied it must validate against the real
    source phrases. If no OpenAI key is configured, the existing V2 fallback
    director is used, and the output's provenance explicitly says so.
    """
    source, output_dir = Path(source).expanduser().resolve(), Path(output_dir).expanduser().resolve()
    if visual_style not in ("classic", WARM_STYLE):
        raise ValueError("Unsupported HarshVerse visual pack")
    selected_grade = resolve_color_grade(visual_style, color_grade)
    voice_enhance_filter(voice_enhance)  # validate even if no SFX
    if not (0 <= visual_fade_seconds <= 1.5):
        raise ValueError("Visual fade must be between 0 and 1.5 seconds")
    if motion_engine not in ("illustrated", "blender3d"):
        raise ValueError("Unknown HarshVerse motion engine")
    if motion_engine == "blender3d" and visual_style != WARM_STYLE:
        raise ValueError("Blender3D requires warm style")
    if editorial_intro and visual_style != WARM_STYLE:
        raise ValueError("Editorial intro currently requires harshverse_warm style")
    if person_matte_model is not None and not editorial_intro:
        raise ValueError("Person matte model requires --editorial-intro")
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
    if visual_fade_seconds:
        video_fade_filter(duration=duration,fade_seconds=visual_fade_seconds)
    if duration > 60 or duration <= 0:
        raise ValueError("Local HarshVerse V1 requires a video between 0 and 60 seconds.")

    if transcript_path is not None:
        transcript = json.loads(Path(transcript_path).expanduser().read_text(encoding="utf-8"))
        if not isinstance(transcript, dict) or not isinstance(transcript.get("words"), list):
            raise ValueError("Transcript JSON must have a words array.")
        transcription_mode = "provided_word_timestamps"
    elif scene_plan_path is not None:
        transcript = _load_scene_plan_baseline_transcript(
            Path(scene_plan_path), source, duration,
        )
        if transcript is None:
            transcript = await transcribe_source(source)
            transcription_mode = "existing_local_stt_no_plan_baseline"
        else:
            transcription_mode = "scene_plan_baseline_word_timestamps"
    else:
        transcript = await transcribe_source(source)
        transcription_mode = "existing_local_stt"

    report = build_video_analysis_report(source, "local-harshverse-preview", transcript=transcript, style=style)
    if report.media.aspect_ratio != "9:16":
        raise ValueError("Local creative preview currently requires a 9:16 presenter; source was not modified.")
    context = build_creative_context(report)
    if scene_plan_path is not None:
        _assert_scene_plan_phrase_alignment(Path(scene_plan_path), context)
    if not context.phrases:
        raise ValueError("Visual Analysis V2 produced no speech phrases. Cannot generate truthful kinetic captions.")

    if smoke_motion and scene_plan_path is not None:
        raise ValueError("Use either --smoke-motion or --scene-plan, not both")
    if smoke_motion:
        scene = build_motion_smoke_scene_plan(context)
        director_mode = "diagnostic_motion_smoke_not_ai"
    elif scene_plan_path is not None:
        raw_plan = json.loads(Path(scene_plan_path).expanduser().read_text(encoding="utf-8"))
        scene = validate_scene_plan(context, raw_plan)
        director_mode = "provided_validated_v2_plan"
    elif api_key:
        scene = await generate_openai_scene_plan(context, api_key=api_key, model=model,
                                                local_graphics_only=True)
        director_mode = "creative_director_v2_openai"
    else:
        scene = fallback_scene_plan(context)
        director_mode = "existing_deterministic_fallback"

    composition = compile_composition_v21(context, scene)
    if visual_style == "classic":
        overlays, caption_warnings = build_caption_overlays(report, context, composition)
    else:
        overlays, caption_warnings = build_caption_overlays(report, context, composition, visual_style=visual_style)
    if not overlays:
        raise ValueError("No source-timed caption overlays could be generated.")

    rendered_sfx_count = 0
    rendered_buddy_cameos = 0
    editorial_title_mode = "off"
    editorial_keyword = None
    rendered_camera_beat_ids: tuple[str, ...] = ()
    with tempfile.TemporaryDirectory(prefix="rangmanch-creative-local-") as temporary:
        captions_path = Path(temporary) / "captions.ass"
        captions = write_caption_track(
            captions_path, overlays, visual_style=visual_style
        )
        graded_presenter = source
        if selected_grade != "off":
            graded_presenter = Path(temporary) / "presenter_graded.mp4"
            _apply_presenter_grade(source, graded_presenter, selected_grade)
        zooms = camera_moves_from_composition(composition)
        if zooms:
            # Source-bound camera effects run before matte, 3D/2.5D
            # graphics and captions. The final mixer always reads untouched
            # narration directly from the original source.
            centers_x = [
                sample.box.x + sample.box.width / 2
                for sample in report.visual.face_samples
            ]
            centers_y = [
                sample.box.y + sample.box.height / 2
                for sample in report.visual.face_samples
            ]
            zoom_output = Path(temporary) / "presenter_camera_effects.mp4"
            camera = render_camera_effects(
                graded_presenter, zoom_output, zooms, duration=duration,
                face_center_x=(sorted(centers_x)[len(centers_x)//2]
                               if centers_x else .5),
                face_center_y=(sorted(centers_y)[len(centers_y)//2]
                               if centers_y else .4),
            )
            graded_presenter = camera.path
            rendered_camera_beat_ids = camera.rendered_beat_ids
        if editorial_intro:
            keyword = choose_speech_keyword([word.text for word in report.speech.words])
            # Sparse face boxes are NOT a person silhouette. Without a
            # segmentation model, report foreground-only typography.
            matte = None
            if person_matte_model is not None:
                matte = Path(temporary) / "person_matte.mkv"
                build_person_matte(
                    graded_presenter, Path(person_matte_model), matte, fps=30,
                )
            layered = Path(temporary) / "presenter_with_editorial_typography.mp4"
            title_result = render_editorial_intro(
                graded_presenter, layered,
                headline=keyword, duration=duration, matte=matte,
            )
            graded_presenter = layered
            editorial_title_mode = title_result.mode
            editorial_keyword = title_result.headline
        # The V2.1 composition is a review-only specification. This initial
        # integration does not fabricate or auto-render B-roll/graphic plates.
        # HarshVerse's original video remains uninterrupted, with new timed
        # captions burned directly onto the original frames.
        render_source = graded_presenter
        motion_result = None
        render_plan, _, skipped_motions = build_motion_render_composition(composition, context)
        motion_path = Path(temporary) / "director_motion_plate.mp4"
        if visual_style == "classic":
            motion_result = render_motion_plate(composition, context, motion_path)
        else:
            if motion_engine == "illustrated":
                motion_result = render_motion_plate(
                    composition, context, motion_path, visual_style=visual_style,
                )
            else:
                motion_result = render_motion_plate(
                    composition, context, motion_path, visual_style=visual_style,
                    motion_engine=motion_engine,
                    blender_bin=blender_bin, blender_quality=blender_quality,
                )
        if motion_result is not None:
            plate_hash = hashlib.sha256(motion_path.read_bytes()).hexdigest()
            plate_duration = _duration(_probe(motion_path))
            plate = AnimationPlate(asset_id="local-procedural:" + plate_hash[:24],
                                   duration=plate_duration, sha256=plate_hash)
            prepared = [PreparedVisual(beat_id=b.id, asset_offset=b.start)
                        for b in render_plan.beats if b.kind == "motion_graphic"]
            if motion_engine == "blender3d":
                draft = compile_harshverse_draft(
                    render_plan, plate=plate, prepared_visuals=prepared,
                    merge_adjacent_motion=True,
                )
            else:
                draft = compile_harshverse_draft(render_plan, plate=plate,
                                                 prepared_visuals=prepared)
            composited = Path(temporary) / "harshverse_with_motion.mp4"
            if visual_style == "classic":
                render_harshverse(draft.scene_plan, graded_presenter, motion_path, composited)
            else:
                centers = [
                    sample.box.y + sample.box.height / 2
                    for sample in report.visual.face_samples
                ]
                face_center = sorted(centers)[len(centers) // 2] if centers else 0.5
                render_harshverse(
                    draft.scene_plan, graded_presenter, motion_path, composited,
                    visual_style=visual_style, face_center_y=face_center,
                )
            render_source = composited
        staged = Path(temporary) / "captioned.mp4"
        if visual_style == "classic":
            _burn_captions(render_source, captions_path, staged,
                           voice_enhance=voice_enhance, finish_audio=voice_enhance != "off",
                           original_audio_source=source)
        else:
            buddy = make_buddy_sticker(Path(temporary) / "harshverse_buddy.png")
            graphic_windows = [
                (b.start, b.end) for b in composition.beats
                if b.kind == "motion_graphic"
            ]
            # Buddy only appears in presenter shots, and is already part
            # of original illustrated panels when graphics are active.
            # Keep short recurring cameos rather than covering the speaker.
            cameo_candidates = [(0.25, min(duration, 1.65)),
                                (max(0.0, duration - 1.65), max(0.0, duration - 0.25))]
            cameo_windows = tuple(
                (start, end) for start, end in cameo_candidates
                if end - start >= .3
                and not any(start < g_end and end > g_start
                            for g_start, g_end in graphic_windows)
            )
            original_sfx = (
                [(0.30, "typewriter")] if editorial_intro else []
            ) + [
                (b.start, "faahh" if b.template == "human_vs_ai"
                 else "pop" if b.template == "keyword_card" else "whoosh")
                for b in composition.beats if b.kind == "motion_graphic"
            ]
            sfx_path = None
            if original_sfx:
                sfx_path, rendered_sfx_count = synthesize_warm_sfx(
                    Path(temporary) / "original_warm_sfx.wav",
                    duration, original_sfx,
                )
            rendered_buddy_cameos = len(cameo_windows)
            _burn_captions(render_source, captions_path, staged,
                           buddy_path=buddy, buddy_windows=cameo_windows,
                           sfx_path=sfx_path, finish_audio=True,
                           voice_enhance=voice_enhance,
                           original_audio_source=source)
        if not staged.is_file() or staged.stat().st_size == 0:
            raise RuntimeError("The captioned preview was not generated.")
        if visual_fade_seconds:
            faded = Path(temporary) / "visual_fades.mp4"
            render_video_fades(staged, faded, duration=duration,
                               fade_seconds=visual_fade_seconds)
            staged = faded
        staged.replace(output)

    warnings = list(report.warnings) + list(composition.warnings) + caption_warnings
    rendered = list(motion_result.rendered_beat_ids) if motion_result else []
    deferred = [b.id for b in composition.beats if b.kind in {
        "broll_intent", "sound_intent",
        "emoji_intent", "lut_intent", "music_intent",
    }]
    deferred.extend(
        b.id for b in composition.beats
        if b.kind == "zoom" and b.id not in rendered_camera_beat_ids
    )
    deferred.extend(skipped_motions)
    if deferred:
        warnings.append("Unresolved or unsupported V2.1 intents remain unrendered; review composition JSON.")
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
        "visual_style": visual_style,
        "motion_engine": motion_engine,
        "blender_quality": blender_quality if motion_engine == "blender3d" else None,
        "presenter_color_grade": selected_grade,
        "voice_enhance": voice_enhance,
        "editorial_title_mode": editorial_title_mode,
        "editorial_keyword": editorial_keyword,
        "engine": "Visual Analysis V2 + Creative Director V2/V2.1",
        "captions": captions.caption_count,
        "highlighted_words": captions.word_count,
        "rendered_original_sfx_cues": rendered_sfx_count,
        "rendered_buddy_cameos": rendered_buddy_cameos,
        "rendered_motion_beat_ids": rendered,
        "rendered_camera_beat_ids": list(rendered_camera_beat_ids),
        "rendered_visual_fade_seconds": visual_fade_seconds,
        "deferred_beat_ids": deferred,
        "warnings": list(dict.fromkeys(warnings)),
    }
    (output_dir / artifacts["report"]).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result


def load_local_environment() -> str | None:
    """Load the API's canonical .env without overwriting shell variables.

    Values must never be printed or persisted in generated creative artifacts.
    This also allows the existing STT/YuNet env configuration to be used in
    standalone backend scripts, as in the running FastAPI app.
    """
    load_dotenv(dotenv_path=ENV_FILE, override=False)
    yunet = os.getenv("RANGMANCH_YUNET_MODEL_PATH", "").strip()
    if yunet:
        model_path = Path(yunet).expanduser()
        if not model_path.is_absolute() and not model_path.is_file():
            candidate = ENV_FILE.parent / model_path
            if candidate.is_file():
                os.environ["RANGMANCH_YUNET_MODEL_PATH"] = str(candidate.resolve())
    return os.getenv("OPENAI_API_KEY", "").strip() or None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run RangManch's existing Visual Engine + Creative Director locally.")
    parser.add_argument("--presenter", type=Path, default=Path.home() / "Downloads/Test_Talking_Head_Harsh.mp4")
    parser.add_argument("--output-dir", type=Path, default=Path.home() / "Downloads/HarshVerse-Creative")
    parser.add_argument("--style", choices=("elegant", "energetic", "cinematic"), default="energetic")
    parser.add_argument("--transcript", type=Path, help="Existing STT transcript JSON with real word timestamps.")
    parser.add_argument("--scene-plan", type=Path, help="Existing validated Creative Director V2 plan JSON.")
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument("--visual-style", choices=("classic", WARM_STYLE), default="classic",
                        help="Renderer style pack; harshverse_warm uses original illustrations and buddy.")
    parser.add_argument("--color-grade", choices=("auto", "off", "warm_editorial"), default="auto",
                        help="Presenter-only color grade; auto uses warm_editorial for harshverse_warm.")
    parser.add_argument("--voice-enhance", choices=("off", "natural", "studio"), default="off",
                        help="Original narration cleanup before SFX; off preserves prior behavior.")
    parser.add_argument("--visual-fade-seconds", type=float, default=0.0,
                        help="Optional complete visual fade at start/end; leaves narration untouched.")
    parser.add_argument("--motion-engine", choices=("illustrated", "blender3d"),
                        default="illustrated",
                        help="Choose procedural 2.5D illustrations or independent Blender 3D scenes.")
    parser.add_argument("--blender-bin", type=Path,
                        help="Optional path to Blender executable for blender3d.")
    parser.add_argument("--3d-quality", choices=("preview", "final"),
                        default="preview", dest="blender_quality",
                        help="Blender render resolution/frame quality; preview is less expensive.")
    parser.add_argument("--editorial-intro", action="store_true",
                        help="Add warm typography intro with optional true person depth occlusion.")
    parser.add_argument("--person-matte-model", type=Path,
                        help="Optional local MediaPipe selfie segmenter .tflite; required for text BEHIND subject.")
    parser.add_argument("--smoke-motion", action="store_true",
                        help="Explicit diagnostic: exercise one V2.1 graphic beat independent of AI selection.")
    parser.add_argument("--require-openai", action="store_true",
                        help="Do not silently choose deterministic planning when OpenAI is unconfigured.")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    api_key = load_local_environment()
    if args.require_openai and args.smoke_motion:
        parser.error("--require-openai cannot be combined with --smoke-motion")
    if args.require_openai and args.scene_plan is None and not api_key:
        print(f"OpenAI Creative Director is required but OPENAI_API_KEY was not found in the shell or {ENV_FILE}.", file=sys.stderr)
        return 2
    try:
        result = asyncio.run(build_local_creative_preview(
            args.presenter, args.output_dir, style=args.style,
            transcript_path=args.transcript, scene_plan_path=args.scene_plan,
            api_key=api_key, model=args.model,
            overwrite=args.overwrite, smoke_motion=args.smoke_motion,
            visual_style=args.visual_style, color_grade=args.color_grade,
            editorial_intro=args.editorial_intro, person_matte_model=args.person_matte_model,
            voice_enhance=args.voice_enhance,
            motion_engine=args.motion_engine, blender_bin=args.blender_bin,
            blender_quality=args.blender_quality,
            visual_fade_seconds=args.visual_fade_seconds,
        ))
    except httpx.HTTPStatusError as exc:
        print(f"OpenAI Creative Director request failed (HTTP {exc.response.status_code}). Check API access, model or credits.", file=sys.stderr)
        return 1
    except httpx.RequestError:
        print("OpenAI Creative Director request failed due to a network error.", file=sys.stderr)
        return 1
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"Local creative preview failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
