"""Local procedural plate renderer for *existing* Creative Director V2.1 motion beats.

This is an execution adapter, NOT a new creative planner. It consumes the
model-validated, phrase-timed V2.1 motion_graphic instructions, and renders only
original geometric templates/faithful source words. No stock footage, network
requests, model-generated images, fake licensing claims, or timeline mutations.

The entire plate is a private 720x640 intermediate sized exactly for the
upper HarshVerse split-screen panel, so labels are not center-cropped.
HarshVerse uses it only when a validated presenter_split scene has a matching
prepared motion beat.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import re
import subprocess

from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v21 import CompositionBeat, CompositionPlanV21

_TEMPLATES = frozenset({"keyword_card", "data_flow", "human_vs_ai", "source_stack"})
_SAFE_LABELS = {
    "keyword_card": "KEY IDEA",
    "data_flow": "HOW IT WORKS",
    "human_vs_ai": "HUMAN + AI",
    "source_stack": "THE LAYERS",
}
_MAX_GRAPHICS = 24


@dataclass(frozen=True)
class MotionPlateResult:
    path: Path
    rendered_beat_ids: tuple[str, ...]
    skipped_beat_ids: tuple[str, ...]


def _ass_time(seconds: float) -> str:
    ticks = max(0, int(round(seconds * 100)))
    hours, ticks = divmod(ticks, 360000)
    minutes, ticks = divmod(ticks, 6000)
    secs, cs = divmod(ticks, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{cs:02d}"


def _ass_safe(text: str) -> str:
    """Never permit source text to inject ASS style or script commands."""
    return re.sub(r"\s+", " ", text).strip().translate(str.maketrans({
        "{": "｛", "}": "｝", "\\": "＼", "\r": " ", "\n": " ",
    }))


def _filter_path(path: Path) -> str:
    value = str(path.resolve())
    return (value.replace("\\", "\\\\").replace(":", r"\:")
            .replace("'", r"\'").replace(",", r"\,")
            .replace("[", r"\[").replace("]", r"\]"))


def _motion_beats(
    composition: CompositionPlanV21,
    context: CreativeContext,
    *,
    fps: int,
) -> tuple[list[CompositionBeat], list[str]]:
    """Validate V2.1 source references; skip sub-frame beats, never invent text."""
    if not (composition.version == "2.1" and composition.needs_review
            and not composition.ready_to_render
            and composition.source_audio_uninterrupted
            and composition.base_video_uninterrupted
            and composition.aspect_ratio == "9:16"
            and 0 < composition.duration_seconds <= 60):
        raise ValueError("Expected a review-only 9:16 V2.1 composition")
    if fps not in (24, 30, 60):
        raise ValueError("Invalid motion-plate frame rate")
    phrases = {phrase.id: phrase for phrase in context.phrases}
    beats = [beat for beat in composition.beats if beat.kind == "motion_graphic"]
    if len(beats) > _MAX_GRAPHICS:
        raise ValueError("Too many motion graphic beats")
    valid: list[CompositionBeat] = []
    skipped: list[str] = []
    previous_end = 0.0
    seen: set[str] = set()
    for beat in sorted(beats, key=lambda b: (b.start, b.end)):
        if beat.id in seen:
            raise ValueError("Duplicate graphic beat ID")
        seen.add(beat.id)
        phrase = phrases.get(beat.text_from_phrase_id or "")
        if (beat.template not in _TEMPLATES or beat.layout != "face_safe_graphic"
                or phrase is None or phrase.id not in beat.phrase_ids
                or not phrase.text.strip()
                or not all(math.isfinite(v) for v in (beat.start, beat.end))
                or beat.start < previous_end - 0.001
                or beat.start < 0 or beat.end > composition.duration_seconds + 0.001
                or abs(phrase.start - beat.start) > .055
                or abs(phrase.end - beat.end) > .055):
            raise ValueError(f"Motion graphic beat lacks validated phrase timing: {beat.id}")
        previous_end = beat.end
        if beat.end - beat.start < (1 / fps) - 0.001:
            skipped.append(beat.id)
            continue
        valid.append(beat)
    return valid, skipped


def build_motion_render_composition(
    composition: CompositionPlanV21,
    context: CreativeContext,
    *,
    fps: int = 30,
) -> tuple[CompositionPlanV21, list[CompositionBeat], tuple[str, ...]]:
    """Derive a frame-aligned render-only copy.

    Original source-timed composition is preserved in saved JSON.
    Unresolved B-roll remains deferred, not passed as a fake animation asset.
    """
    source_beats = [b for b in composition.beats if b.kind == "source"]
    if len(source_beats) != 1:
        raise ValueError("Missing continuous source beat")
    valid, skipped = _motion_beats(composition, context, fps=fps)
    cursor = 0.0
    frame = 1 / fps
    snapped: list[CompositionBeat] = []
    for beat in valid:
        start = max(cursor, math.floor(beat.start * fps + 1e-6) / fps)
        end = min(composition.duration_seconds, math.ceil(beat.end * fps - 1e-6) / fps)
        if 0 < start - cursor < frame - 1e-5:
            start = cursor
        if end <= start + frame - 1e-5:
            skipped.append(beat.id)
            continue
        if composition.duration_seconds - end < frame - 1e-5:
            end = composition.duration_seconds
        snapped.append(beat.model_copy(update={
            "start": round(start, 6), "end": round(end, 6),
        }))
        cursor = end
    # Every non-graphic beat remains an intent. Only the **unresolved** B-roll
    # beats are removed from the render-only copy: this adapter cannot legally
    # materialize B-roll, even if the editor has a separate approved registry.
    filtered = [b for b in composition.beats if b.kind != "motion_graphic"
                and b.kind != "broll_intent"]
    render_only = composition.model_copy(deep=True)
    render_only.beats = filtered + snapped
    return render_only, snapped, tuple(skipped)


def _heading_and_shapes(beat: CompositionBeat) -> list[str]:
    """Render distinct simple shapes for each existing director template."""
    begin, end = f"{beat.start:.3f}", f"{beat.end:.3f}"
    enable = f"gte(t\\,{begin})*lt(t\\,{end})"
    def box(x: int, y: int, w: int, h: int, color: str) -> str:
        return (f"drawbox=x={x}:y={y}:w={w}:h={h}:color={color}:"
                f"t=fill:enable='{enable}'")
    filters = [
        box(38, 105, 644, 480, "0x162D46@0.93"),
        box(38, 105, 9, 480, "0x52DAEA@0.96"),
        box(58, 565, 604, 2, "0x52DAEA@0.42"),
    ]
    if beat.template == "keyword_card":
        filters += [box(92, 150, 536, 9, "0xF9C74F@0.96")]
    elif beat.template == "data_flow":
        filters += [
            box(105, 170, 145, 48, "0x256E89@0.91"),
            box(287, 170, 145, 48, "0x256E89@0.91"),
            box(469, 170, 145, 48, "0x256E89@0.91"),
            box(251, 188, 36, 6, "0x53DDEB@0.96"),
            box(433, 188, 36, 6, "0x53DDEB@0.96"),
        ]
    elif beat.template == "human_vs_ai":
        filters += [
            box(100, 156, 237, 91, "0x214E7C@0.94"),
            box(382, 156, 237, 91, "0x326A65@0.94"),
            box(345, 156, 27, 91, "0xF9C74F@0.93"),
        ]
    elif beat.template == "source_stack":
        filters += [
            box(116, 142, 480, 27, "0x244F76@0.91"),
            box(135, 185, 442, 27, "0x317F8E@0.91"),
            box(154, 229, 404, 27, "0xF9C74F@0.72"),
        ]
    return filters


def render_motion_plate(
    composition: CompositionPlanV21,
    context: CreativeContext,
    path: Path,
    *,
    fps: int = 30,
    ffmpeg: str = "ffmpeg",
    visual_style: str = "classic",
) -> MotionPlateResult | None:
    """Render only original local graphic templates; does not approve export."""
    _, beats, skipped = build_motion_render_composition(composition, context, fps=fps)
    if not beats:
        return None
    if visual_style not in ("classic", "harshverse_warm"):
        raise ValueError("Unknown HarshVerse visual style pack")
    if visual_style == "harshverse_warm":
        return _render_warm_plate(composition, beats, skipped, path, fps=fps, ffmpeg=ffmpeg)
    phrases = {p.id: p for p in context.phrases}
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    subtitles = path.with_suffix(".ass")
    header = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 2\n"
        "PlayResX: 720\nPlayResY: 640\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Default,Arial,54,&H00FFFFFF,&H00FFFFFF,&H00162D46&,"
        "&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,40,40,40,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, "
        "MarginL, MarginR, MarginV, Effect, Text\n"
    )
    events: list[str] = []
    filters = ["drawgrid=w=90:h=90:t=1:c=0x38BDF8@0.10"]
    for beat in beats:
        filters += _heading_and_shapes(beat)
        start, end = _ass_time(beat.start), _ass_time(beat.end)
        phrase = phrases[beat.text_from_phrase_id]
        content = _ass_safe(phrase.text)
        # Every displayed claim comes from original recorded speech.
        if not content:
            continue
        if len(content) > 110:
            raise ValueError("Motion graphic source phrase exceeds safe text length")
        label = _SAFE_LABELS[beat.template]
        events.append(
            f"Dialogue: 0,{start},{end},Default,,0,0,0,,"
            r"{\an5\pos(360,84)\fs28\c&H00DAF8&\fad(100,130)}"
            + label
        )
        events.append(
            f"Dialogue: 1,{start},{end},Default,,0,0,0,,"
            r"{\an5\pos(360,359)\fs54\blur1\fad(100,130)"
            r"\fscx91\fscy91\t(0,190,\fscx100\fscy100)}"
            + content
        )
    subtitles.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    filters.append(f"subtitles=filename='{_filter_path(subtitles)}'")
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i",
        f"color=c=0x0B1727:s=720x640:r={fps}",
        "-t", f"{composition.duration_seconds:.3f}",
        "-vf", ",".join(filters),
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, timeout=240)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError("Local FFmpeg motion-plate render failed; verify drawbox/libass availability") from exc
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError("Local motion plate was not produced")
    return MotionPlateResult(
        path=path,
        rendered_beat_ids=tuple(beat.id for beat in beats),
        skipped_beat_ids=skipped,
    )



def _render_warm_plate(
    composition: CompositionPlanV21,
    beats: list[CompositionBeat],
    skipped: list[str],
    path: Path,
    *,
    fps: int,
    ffmpeg: str,
) -> MotionPlateResult:
    """Use original 2.5D style art, never duplicate the spoken phrase as art text.

    FFmpeg animates the whole illustrated plate with a restrained slide entrance;
    captions are rendered in a dedicated safe strip by the existing caption
    bridge, not painted twice inside illustrations.
    """
    from app.services.harshverse.warm_style import make_explainer_panel

    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Rather than sliding one finished slide over the speaker, construct
    # each illustration in ordered visual steps: first object, next object,
    # final connection. Each stage is a reusable original art frame.
    stages: list[tuple[CompositionBeat, int, float, float, Path]] = []
    for i, beat in enumerate(beats):
        interval = beat.end - beat.start
        reveal_gap = min(.29, max(.055, interval * .20))
        for step in (1, 2, 3):
            stage_start = beat.start + (step - 1) * reveal_gap
            stage_end = (beat.start + step * reveal_gap
                         if step < 3 else beat.end)
            if stage_end <= stage_start + .015:
                continue
            panel = path.with_name(f"{path.stem}_warm_{i:02d}_step{step}.png")
            make_explainer_panel(
                panel, template=beat.template, ordinal=i + 1,
                reveal_step=step,
            )
            stages.append((beat,step,stage_start,stage_end,panel))

    inputs: list[str] = [
        "-f", "lavfi", "-i", f"color=c=0xF8F3E9:s=720x640:r={fps}"
    ]
    filters: list[str] = []
    current = "[0:v]"
    for index, (beat, step, start, end, panel) in enumerate(stages, 1):
        inputs.extend(["-loop", "1", "-framerate", str(fps), "-i", str(panel)])
        tag = f"[warm{index}]"
        enable = f"gte(t\\,{start:.3f})*lt(t\\,{end:.3f})"
        # Brief kinetic slide; objects appear at distinct beat-relative
        # times, not from a generic effect spam template.
        arrive = min(start + .15, end)
        motion = (
            f"if(lt(t\\,{arrive:.3f})\\,"
            f"max(0\\,({arrive:.3f}-t)*500)\\,0)"
        )
        filters.append(
            f"{current}[{index}:v]overlay=x='{motion}':y=0:enable='{enable}':"
            f"shortest=1:eof_action=repeat{tag}"
        )
        current = tag
    filters.append(f"{current}format=yuv420p[vout]")
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        *inputs, "-filter_complex", ";".join(filters),
        "-map", "[vout]", "-an",
        "-t", f"{composition.duration_seconds:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, timeout=300)
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="replace")[-800:] if exc.stderr else ""
        raise RuntimeError(f"Warm motion plate FFmpeg failed: {detail}") from exc
    if not path.is_file() or not path.stat().st_size:
        raise RuntimeError("Warm illustrated motion plate missing")
    return MotionPlateResult(
        path=path, rendered_beat_ids=tuple(beat.id for beat in beats),
        skipped_beat_ids=tuple(skipped),
    )
