"""Reference-video editing rhythm analysis. Read-only, deterministic, no video copying.

This is an experimental *style measurements* interface, not semantic analysis.
Requires ffprobe/ffmpeg on PATH; intentionally no model keys or network calls.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import re
import statistics
import subprocess
from typing import Callable


class ReferenceDNAError(ValueError):
    pass


MAX_DURATION_SECONDS = 600.0
MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024


def _run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=True)
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        raise ReferenceDNAError(f"Reference analysis failed: {type(exc).__name__}") from exc


def _media_info(path: Path, runner: Callable = _run) -> tuple[float, dict]:
    result = runner(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)], 30)
    try:
        media = json.loads(result.stdout)
        duration = float(media["format"]["duration"])
        video = next(s for s in media["streams"] if s["codec_type"] == "video")
        assert duration > 0 and video.get("width", 0) > 0 and video.get("height", 0) > 0
    except (ValueError, KeyError, StopIteration, AssertionError, TypeError) as exc:
        raise ReferenceDNAError("Reference must be a readable video with duration and dimensions") from exc
    if duration > MAX_DURATION_SECONDS:
        raise ReferenceDNAError("Reference exceeds maximum analysis duration (600 seconds)")
    return duration, video


def _parse_scene_times(log: str, duration: float, minimum_spacing: float = 0.35) -> list[float]:
    times = []
    for raw in re.findall(r"pts_time:\s*([0-9]+(?:\.[0-9]+)?)", log):
        t = float(raw)
        if 0.25 < t < duration - 0.25 and (not times or t - times[-1] >= minimum_spacing):
            times.append(round(t, 3))
    return times


def _pacing(intervals: list[float]) -> str:
    if not intervals:
        return "unknown"
    median = statistics.median(intervals)
    if median < 1.5:
        return "fast"
    if median <= 3.5:
        return "moderate"
    return "slow"


def analyze_reference(
    path: str | Path,
    *,
    threshold: float = 0.32,
    runner: Callable = _run,
) -> dict:
    """Return an inspectable style fingerprint from *measured* hard scene changes.

    Does not extract audio, frames, captions, music, or recognizable subject data.
    A reference video is never copied into the result.
    """
    source = Path(path).expanduser().resolve()
    if not source.is_file() or source.stat().st_size > MAX_FILE_BYTES:
        raise ReferenceDNAError("Reference video missing or exceeds 2 GiB")
    if not 0.05 <= threshold <= 0.85:
        raise ReferenceDNAError("Scene threshold must be in [0.05, 0.85]")
    duration, video = _media_info(source, runner)
    # Scale down to bound CPU cost; showinfo logs only selected scene-change frames.
    result = runner([
        "ffmpeg", "-hide_banner", "-nostdin", "-v", "info", "-i", str(source),
        "-an", "-vf", f"scale=320:-2,select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr", "-f", "null", "-"
    ], min(240, max(30, int(duration * 1.5))))
    cuts = _parse_scene_times(result.stderr, duration)
    bounds = [0.0, *cuts, round(duration, 3)]
    spans = [round(b - a, 3) for a, b in zip(bounds, bounds[1:])]
    avg = round(statistics.mean(spans), 3) if spans else None
    med = round(statistics.median(spans), 3) if spans else None
    return {
        "schema_version": "reference-dna/v0.1",
        "source_kind": "reference_video",
        "analysis_method": "ffmpeg_scene_change_threshold",
        "analysis_parameters": {"scene_threshold": threshold, "min_cut_separation_seconds": 0.35},
        "video": {"duration_seconds": round(duration, 3), "width": video["width"], "height": video["height"]},
        "editing_rhythm": {
            "detected_cut_times_seconds": cuts,
            "shot_durations_seconds": spans,
            "detected_cuts": len(cuts),
            "mean_shot_seconds": avg,
            "median_shot_seconds": med,
            "pacing": _pacing(spans if cuts else []),
        },
        "style_guidance": {
            "target_pacing": _pacing(spans if cuts else []),
            "reference_cut_grid_seconds": cuts,
            "suggested_use": "Treat as a pacing prior, not strict target-video cut times",
        },
        "not_analyzed": ["semantic relevance", "typography", "lower thirds", "SFX events", "audio beats", "transitions", "B-roll", "color grade"],
        "safety": {"reference_media_embedded": False, "reference_audio_reused": False, "reference_frames_reused": False},
    }
