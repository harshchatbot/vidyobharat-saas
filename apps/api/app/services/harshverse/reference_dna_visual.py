"""Reference DNA v0.7: measured visual/audio *signals*, not semantic recognition.

Offline FFmpeg/NumPy analyzer. Outputs only aggregate statistics; it does not
store reference frames, audio samples, or text. Intended for a local trusted job
with the same media ownership validation as other RangManch services.
"""
from __future__ import annotations

import math
from pathlib import Path
import subprocess
from typing import Any

import numpy as np

from .reference_dna import ReferenceDNAError, _media_info, analyze_reference, MAX_FILE_BYTES

FRAME_WIDTH = 160
FRAME_HEIGHT = 284
SAMPLE_FPS = 1
MAX_SAMPLES = 600
AUDIO_HZ = 8000
AUDIO_WINDOW_SECONDS = 0.10


def _capture(command: list[str], timeout: int, max_bytes: int) -> bytes:
    try:
        result = subprocess.run(command, capture_output=True, timeout=timeout, check=True)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ReferenceDNAError(f"Reference signal extraction failed: {type(exc).__name__}") from exc
    if len(result.stdout) > max_bytes:
        raise ReferenceDNAError("Reference signal output exceeded limit")
    return result.stdout


def _sample_frames(source: Path, duration: float) -> np.ndarray:
    # Fit entire portrait/landscape input without distortion, then pad to a fixed frame size.
    max_bytes = int(min(MAX_SAMPLES, math.ceil(duration)) * FRAME_WIDTH * FRAME_HEIGHT * 3)
    raw = _capture([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
        "-vf", f"fps={SAMPLE_FPS},scale={FRAME_WIDTH}:{FRAME_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={FRAME_WIDTH}:{FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=rgb24",
        "-an", "-sn", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
    ], min(240, max(30, int(duration * 2))), max_bytes)
    frame_size = FRAME_WIDTH * FRAME_HEIGHT * 3
    if len(raw) % frame_size:
        raise ReferenceDNAError("Invalid decoded frame sample length")
    count = len(raw) // frame_size
    if count == 0 or count > MAX_SAMPLES:
        raise ReferenceDNAError("No frame samples decoded or sample limit exceeded")
    return np.frombuffer(raw, np.uint8).reshape(count, FRAME_HEIGHT, FRAME_WIDTH, 3)


def _visual_signals(frames: np.ndarray) -> dict[str, Any]:
    # Remove black letterbox bias by using active pixels above a low intensity.
    f = frames.astype(np.float32) / 255
    luminance = f[..., 0] * .2126 + f[..., 1] * .7152 + f[..., 2] * .0722
    active = luminance > 0.035
    if not np.any(active):
        active = np.ones_like(luminance, dtype=bool)
    pixels = f[active]
    mean_rgb = pixels.mean(axis=0)
    mx = pixels.max(axis=1)
    mn = pixels.min(axis=1)
    saturation = float(np.mean(np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)))
    lum = luminance[active]
    # spatial gradient strength is a proxy for visual complexity, NOT text detection.
    grad = (np.abs(np.diff(luminance, axis=1)).mean(axis=(1, 2)) +
            np.abs(np.diff(luminance, axis=2)).mean(axis=(1, 2))) / 2
    mean_diff = np.mean(np.abs(np.diff(f, axis=0)), axis=(1, 2, 3)) if len(f) > 1 else np.array([])
    return {
        "frame_samples": len(frames), "sample_fps": SAMPLE_FPS,
        "mean_rgb_8bit": [int(round(float(x * 255))) for x in mean_rgb],
        "mean_luma": round(float(lum.mean()), 4),
        "luma_std": round(float(lum.std()), 4),
        "mean_saturation": round(saturation, 4),
        "edge_activity_proxy": round(float(grad.mean()), 4),
        "frame_change_proxy_mean": round(float(mean_diff.mean()), 4) if len(mean_diff) else None,
        "frame_change_proxy_p90": round(float(np.percentile(mean_diff, 90)), 4) if len(mean_diff) else None,
        "interpretation": "Low-resolution statistical proxies; do not infer font, object, overlay or camera movement identity",
    }


def _audio_signals(source: Path, duration: float, has_audio: bool) -> dict[str, Any]:
    if not has_audio:
        return {"has_audio": False, "rms_mean": None, "transient_candidates_seconds": [], "disclaimer": "No audio stream"}
    # 600 seconds at 8 kHz mono s16 is only 9.6 MB.
    raw = _capture([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
        "-map", "0:a:0", "-vn", "-sn", "-ac", "1", "-ar", str(AUDIO_HZ),
        "-f", "s16le", "-acodec", "pcm_s16le", "-"
    ], min(240, max(30, int(duration * 2))), int(AUDIO_HZ * 2 * (duration + 1)))
    samples = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    window = int(AUDIO_HZ * AUDIO_WINDOW_SECONDS)
    count = len(samples) // window
    if count == 0:
        return {"has_audio": True, "rms_mean": None, "transient_candidates_seconds": [], "disclaimer": "Insufficient decoded audio"}
    blocks = samples[:count * window].reshape(count, window)
    rms = np.sqrt(np.mean(blocks ** 2, axis=1))
    # Compare rising energy with prior 300ms; these can be speech or SFX.
    events = []
    floor = float(np.median(rms))
    for i in range(3, len(rms) - 1):
        baseline = max(float(np.mean(rms[i-3:i])), .004)
        if rms[i] > max(.035, 2.8 * baseline, 2 * floor) and rms[i] >= rms[i-1] and rms[i] > rms[i+1]:
            seconds = round(i * AUDIO_WINDOW_SECONDS, 2)
            if not events or seconds - events[-1] >= .45:
                events.append(seconds)
    return {
        "has_audio": True,
        "rms_mean": round(float(rms.mean()), 5),
        "rms_p90": round(float(np.percentile(rms, 90)), 5),
        "transient_candidates_seconds": events[:120],
        "disclaimer": "Energy transients may be speech, music, edits, or SFX; no source separation or SFX classification",
    }


def analyze_reference_v07(path: str | Path, *, threshold: float = 0.32) -> dict[str, Any]:
    source = Path(path).expanduser().resolve()
    if not source.is_file() or source.stat().st_size > MAX_FILE_BYTES:
        raise ReferenceDNAError("Reference video missing or exceeds 2 GiB")
    base = analyze_reference(source, threshold=threshold)
    duration, _ = _media_info(source)
    # ffprobe only checks audio presence; no audio is retained in output.
    audio_probe = _capture([
        "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", str(source)
    ], 30, 4096)
    frames = _sample_frames(source, duration)
    visual = _visual_signals(frames)
    result = {
        **base,
        "schema_version": "reference-dna/v0.2",
        "analysis_method": "ffmpeg_scene_change_plus_sampled_visual_audio_signals",
        "visual_signals": visual,
        "audio_signals": _audio_signals(source, duration, bool(audio_probe.strip())),
        "style_guidance": {**base["style_guidance"], "palette_rgb_8bit": visual["mean_rgb_8bit"],
                           "use_as_style_prior_only": True},
        "not_analyzed": ["semantic relevance", "text/OCR/font identity", "lower thirds", "SFX classification",
                         "music identity or beat grid", "transition type", "B-roll identity", "subject tracking"],
    }
    return result
