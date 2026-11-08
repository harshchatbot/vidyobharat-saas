"""Optional original Blender 3D motion-plate renderer for HarshVerse.

The validated V2.1 edit plan remains the ONLY timing/content source. A private
Blender subprocess renders warm 3D objects and the recurring square buddy; no
network, external 3D models, model weights or stock clips.

This optional path deliberately fails with a setup message when Blender is
unavailable instead of pretending the 2.5D fallback is 3D. It renders ONLY
the 720x640 upper graphic plate. The existing HarshVerse adapter owns the
presenter, captions, foreground titles, continuity and final sound.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any

from app.services.video_creative_director_v21 import CompositionBeat, CompositionPlanV21

_TEMPLATES = frozenset({"keyword_card", "data_flow", "human_vs_ai", "source_stack"})
_RENDER_QUALITY = {"preview": (540, 480, 24, 16), "final": (720, 640, 30, 32)}


@dataclass(frozen=True)
class BlenderMotionResult:
    path: Path
    render_engine: str
    rendered_beat_ids: tuple[str, ...]
    grouped_sequences: int


def blender_executable(explicit: str | Path | None = None) -> Path:
    candidates = [
        explicit,
        os.getenv("RANGMANCH_BLENDER_BIN"),
        shutil.which("blender"),
        "/Applications/Blender.app/Contents/MacOS/Blender",
    ]
    for entry in candidates:
        if entry and Path(entry).is_file() and os.access(entry, os.X_OK):
            return Path(entry).resolve()
    raise RuntimeError(
        "Blender executable not found. Install the official Blender app, "
        "or set RANGMANCH_BLENDER_BIN to its executable path. "
        "3D motion is optional; use --motion-engine illustrated for the old renderer."
    )


def group_visual_sequences(
    beats: list[CompositionBeat],
    *,
    max_gap_seconds: float = 0.38,
    max_sequence_seconds: float = 8.5,
) -> list[dict[str, Any]]:
    """Merge adjacent SAME-TEMPLATE beats for continuous 3D choreography.

    Does not modify beat IDs, original timestamps or source speech. An
    out-of-order/overlapping list is invalid. Unrelated content is not merged.
    """
    if not 0 <= max_gap_seconds <= 0.5:
        raise ValueError("Invalid graphic grouping gap")
    groups: list[dict[str, Any]] = []
    for beat in beats:
        if beat.kind != "motion_graphic" or beat.template not in _TEMPLATES:
            raise ValueError("Blender requires validated warm motion beats")
        if not (math.isfinite(beat.start) and math.isfinite(beat.end)
                and 0 <= beat.start < beat.end <= 60):
            raise ValueError("Invalid 3D motion beat timing")
        if groups and beat.start < groups[-1]["end"] - 0.001:
            raise ValueError("Overlapping motion beats cannot share Blender animation")
        if (groups and beat.template == groups[-1]["template"]
                and beat.start - groups[-1]["end"] <= max_gap_seconds
                and beat.end - groups[-1]["start"] <= max_sequence_seconds):
            groups[-1]["end"] = beat.end
            groups[-1]["beats"].append({
                "id": beat.id, "start": beat.start, "end": beat.end,
            })
        else:
            groups.append({
                "template": beat.template, "start": beat.start,
                "end": beat.end,
                "beats": [{"id": beat.id, "start": beat.start, "end": beat.end}],
            })
    return groups


def build_blender_job(
    composition: CompositionPlanV21, beats: list[CompositionBeat], *,
    quality: str = "preview",
) -> dict[str, Any]:
    if quality not in _RENDER_QUALITY:
        raise ValueError("3D quality must be preview or final")
    if not beats:
        raise ValueError("Cannot render 3D plate without motion beats")
    if (not composition.source_audio_uninterrupted
            or not composition.base_video_uninterrupted
            or not composition.needs_review
            or composition.ready_to_render
            or composition.aspect_ratio != "9:16"
            or not 0 < composition.duration_seconds <= 60):
        raise ValueError("Expected validated review-only 9:16 scene composition")
    width, height, fps, samples = _RENDER_QUALITY[quality]
    sequences = group_visual_sequences(beats)
    if len(sequences) > 12:
        raise ValueError("Too many independent 3D sequences")
    return {
        "contract": "harshverse-blender-3d-v1",
        "duration": composition.duration_seconds,
        "width": width,
        "height": height,
        "fps": fps,
        "samples": samples,
        "quality": quality,
        "sequences": sequences,
    }


def render_blender_plate(
    composition: CompositionPlanV21,
    beats: list[CompositionBeat],
    path: Path,
    *,
    blender: str | Path | None = None,
    quality: str = "preview",
    ffmpeg: str = "ffmpeg",
    max_render_seconds: int = 1800,
) -> BlenderMotionResult:
    """Produce original 3D MP4 through headless Blender + reliable FFmpeg.

    Blender outputs lossless numbered PNG frames. FFmpeg then aligns them to
    the standard HarshVerse 720x640/30 fps plate. Exact source-time alignment
    is preserved with fixed-fps rendering and the source duration trim.
    """
    job = build_blender_job(composition, beats, quality=quality)
    executable = blender_executable(blender)
    script = Path(__file__).with_name("blender_scene.py")
    if not script.is_file():
        raise FileNotFoundError("Bundled HarshVerse Blender scene script is missing")
    destination = Path(path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="harshverse-blender-") as tmp:
        root = Path(tmp)
        job_path = root / "job.json"
        frames = root / "frames"
        frames.mkdir()
        job_path.write_text(json.dumps(job, indent=2), encoding="utf-8")
        command = [
            str(executable), "--background", "--factory-startup",
            "--python-exit-code", "1", "--python", str(script), "--",
            "--job", str(job_path), "--frames", str(frames),
        ]
        try:
            done = subprocess.run(
                command, capture_output=True, text=True,
                timeout=max_render_seconds, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Blender 3D render timed out; try --3d-quality preview") from exc
        if done.returncode:
            raise RuntimeError(
                "Blender 3D render failed: " +
                (done.stderr + "\n" + done.stdout)[-1400:]
            )
        generated = sorted(frames.glob("frame_*.png"))
        expected = math.ceil(job["duration"] * job["fps"])
        if len(generated) != expected:
            raise RuntimeError(
                f"Blender rendered {len(generated)} frames, expected {expected}. "
                "Refusing to produce a desynchronized 3D plate."
            )
        staging = destination.with_name(destination.stem + ".partial.mp4")
        try:
            convert = [
                ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", str(job["fps"]),
                "-i", str(frames / "frame_%06d.png"),
                "-vf", "fps=30,scale=720:640:flags=lanczos,setsar=1",
                "-t", f"{composition.duration_seconds:.6f}", "-an",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-pix_fmt", "yuv420p", "-r", "30",
                "-movflags", "+faststart", str(staging),
            ]
            subprocess.run(convert, capture_output=True, text=True, check=True, timeout=300)
            if not staging.is_file() or not staging.stat().st_size:
                raise RuntimeError("Blender FFmpeg 3D plate is empty")
            staging.replace(destination)
        finally:
            staging.unlink(missing_ok=True)
    return BlenderMotionResult(
        path=destination, render_engine="blender_3d",
        rendered_beat_ids=tuple(b.id for b in beats),
        grouped_sequences=len(job["sequences"]),
    )
