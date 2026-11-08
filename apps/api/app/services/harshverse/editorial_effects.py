"""Deterministic, source-faithful foundational video effects.

This module executes only camera moves backed by validated V2.1 *zoom*
beats. The existing edit-plan/compiler remains authoritative; no new
creative planner, guessed timestamps, source cuts, or unlicensed B-roll.

For a continuous talking-head source, a smooth punch-in/out changes picture
without changing audio, duration, caption timestamps or speaker identity.
All effects are review-only. This is the first capability in the future
general-purpose effect catalog, not a replacement editing engine.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import subprocess

from app.services.video_creative_director_v21 import CompositionPlanV21


@dataclass(frozen=True)
class CameraMove:
    beat_id: str
    start: float
    end: float
    peak_scale: float


@dataclass(frozen=True)
class CameraEffectsResult:
    path: Path
    rendered_beat_ids: tuple[str, ...]
    fps: int
    duration_seconds: float


def camera_moves_from_composition(
    composition: CompositionPlanV21,
    *,
    min_duration: float = .32,
) -> tuple[CameraMove, ...]:
    """Fail-closed validation for editorial camera zooms.

    Never render a requested zoom without the two validator-generated
    keyframes or outside the source timeline. Zoom stays subtle (<=1.15).
    """
    if (
        composition.version != "2.1"
        or not composition.source_audio_uninterrupted
        or not composition.base_video_uninterrupted
        or not composition.needs_review
        or composition.ready_to_render
        or composition.aspect_ratio != "9:16"
        or not 0 < composition.duration_seconds <= 60
    ):
        raise ValueError("Camera effects require a validated review-only composition")
    if not (0.20 <= min_duration <= 1.0):
        raise ValueError("Invalid minimum camera-move duration")
    moves: list[CameraMove] = []
    for beat in composition.beats:
        if beat.kind != "zoom":
            continue
        if beat.template != "subtle_camera_push" or len(beat.keyframes) < 2:
            raise ValueError(f"Unsupported or incomplete zoom beat: {beat.id}")
        if not (
            math.isfinite(beat.start) and math.isfinite(beat.end)
            and 0 <= beat.start < beat.end <= composition.duration_seconds + .001
        ):
            raise ValueError(f"Invalid zoom timing: {beat.id}")
        if beat.end - beat.start < min_duration:
            continue  # too little visual time to justify a camera move
        first, last = beat.keyframes[0], beat.keyframes[-1]
        if abs(first.at) > .05 or abs(last.at - (beat.end-beat.start)) > .06:
            raise ValueError(f"Zoom keyframes are not scene-relative: {beat.id}")
        scale = max(frame.scale for frame in beat.keyframes)
        if not 1.001 <= scale <= 1.15:
            continue  # 1x means no visible change
        moves.append(CameraMove(
            beat_id=beat.id, start=beat.start, end=beat.end,
            peak_scale=round(scale, 5),
        ))
    moves.sort(key=lambda m: m.start)
    for previous, current in zip(moves, moves[1:]):
        if current.start < previous.end - .001:
            raise ValueError("Overlapping zoom requests require human review")
    if len(moves) > 12:
        raise ValueError("Too many camera moves in one short")
    return tuple(moves)


def camera_effect_filter(
    moves: tuple[CameraMove, ...],
    *,
    width: int = 720,
    height: int = 1280,
    fps: int = 30,
    face_center_x: float = .5,
    face_center_y: float = .4,
) -> str:
    """FFmpeg zoompan with a continuous smooth rise-and-return envelope.

    Every frame outside zoom beats is 1x (unchanged). Focus is anchored
    near detected face position, but never relies on a face box as a matte.
    zoompan d=1 ensures exactly one output frame per input video frame.
    """
    if fps not in (24, 30, 60) or width < 320 or height < 568 or width % 2 or height % 2:
        raise ValueError("Invalid camera render format")
    if not all(math.isfinite(v) and 0 <= v <= 1 for v in (face_center_x, face_center_y)):
        raise ValueError("Invalid face-center coordinates")
    if any(not math.isfinite(v) or v <= 0 for m in moves for v in
           (m.end - m.start, m.peak_scale)):
        raise ValueError("Invalid zoom envelope")
    terms: list[str] = []
    for move in moves:
        first = max(0, round(move.start * fps))
        last = max(first + 1, round(move.end * fps))
        delta = last - first
        amplitude = move.peak_scale - 1
        # Sinusoidal in/out yields zero zoom at both boundaries and a
        # gentle peak at the center, with no hard pop at scene changes.
        terms.append(
            f"if(between(on,{first},{last}),"
            f"{amplitude:.6f}*sin(PI*(on-{first})/{delta}),0)"
        )
    z = "1" + "".join("+" + part for part in terms)
    fx = max(.02, min(.98, face_center_x))
    fy = max(.02, min(.98, face_center_y))
    return (
        f"fps={fps},"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1,"
        f"zoompan=z='{z}':"
        f"x='max(0,min(iw-iw/zoom,iw*{fx:.5f}-iw/zoom/2))':"
        f"y='max(0,min(ih-ih/zoom,ih*{fy:.5f}-ih/zoom/2))':"
        f"d=1:s={width}x{height}:fps={fps},"
        f"format=yuv420p"
    )


def render_camera_effects(
    source: Path,
    output: Path,
    moves: tuple[CameraMove, ...],
    *,
    duration: float,
    fps: int = 30,
    face_center_x: float = .5,
    face_center_y: float = .4,
    ffmpeg: str = "ffmpeg",
) -> CameraEffectsResult:
    """Render a temporary, frame-aligned camera track with unchanged audio.

    A later HarshVerse pass composites graphics/captions and takes narration
    again from the original camera file, avoiding accumulated audio loss.
    """
    source, output = Path(source), Path(output)
    if not source.is_file():
        raise FileNotFoundError("Presenter source for camera effects is missing")
    if not moves:
        raise ValueError("No authorized camera effects to render")
    if not math.isfinite(duration) or not 0 < duration <= 60:
        raise ValueError("Invalid source duration")
    if any(m.end > duration + .01 for m in moves):
        raise ValueError("Zoom exceeds original recording duration")
    expression = camera_effect_filter(
        moves, fps=fps,
        face_center_x=face_center_x, face_center_y=face_center_y,
    )
    output.parent.mkdir(parents=True,exist_ok=True)
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-map", "0:v:0", "-map", "0:a:0",
        "-vf", expression,
        "-t", f"{duration:.6f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-r", str(fps),
        "-c:a", "copy", "-movflags", "+faststart", str(output),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                check=False, timeout=300)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Foundational camera-effects render timed out") from exc
    if result.returncode:
        raise RuntimeError(f"Camera effects failed: {result.stderr[-1000:]}")
    if not output.is_file() or not output.stat().st_size:
        raise RuntimeError("Camera-effects video was not produced")
    return CameraEffectsResult(
        path=output,
        rendered_beat_ids=tuple(move.beat_id for move in moves),
        fps=fps,
        duration_seconds=duration,
    )
