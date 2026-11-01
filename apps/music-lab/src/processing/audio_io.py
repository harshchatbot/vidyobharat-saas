from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SUPPORTED_EXTENSIONS = {".wav", ".wave", ".aif", ".aiff", ".mp3", ".m4a"}
TARGET_SAMPLE_RATE = 48_000
MAX_DURATION_SECONDS = 15 * 60


class AudioInputError(ValueError): pass


def _ffmpeg() -> str:
    binary = shutil.which("ffmpeg")
    if not binary: raise AudioInputError("FFmpeg is required for MP3/M4A decoding and mastering")
    return binary


def read_audio(path: Path, target_sr: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS: raise AudioInputError("Use WAV, AIFF, MP3, or M4A audio")
    try:
        data, rate = sf.read(path, always_2d=True, dtype="float64")
    except RuntimeError:
        decoded = path.with_suffix(".decoded.wav")
        subprocess.run([_ffmpeg(), "-y", "-i", str(path), "-ar", str(target_sr), "-ac", "2", str(decoded)], check=True, capture_output=True)
        data, rate = sf.read(decoded, always_2d=True, dtype="float64")
        decoded.unlink(missing_ok=True)
    if len(data) == 0 or not np.isfinite(data).all(): raise AudioInputError("Audio is empty or invalid")
    if len(data) / rate > MAX_DURATION_SECONDS: raise AudioInputError("Audio must be 15 minutes or shorter")
    if np.max(np.abs(data)) < 1e-7: raise AudioInputError("Audio appears silent")
    if rate != target_sr:
        data = signal.resample_poly(data, target_sr, rate, axis=0)
    return data if data.shape[1] == 2 else np.repeat(data.mean(axis=1, keepdims=True), 2, axis=1)


def apply_offset(audio: np.ndarray, offset_ms: int, sr: int = TARGET_SAMPLE_RATE) -> np.ndarray:
    samples = round(offset_ms * sr / 1000)
    if samples > 0: return np.pad(audio, ((samples, 0), (0, 0)))
    return audio[-samples:] if samples < 0 else audio


def pad_to_match(*tracks: np.ndarray) -> tuple[np.ndarray, ...]:
    length = max(len(track) for track in tracks)
    return tuple(np.pad(track, ((0, length - len(track)), (0, 0))) for track in tracks)


def write_wav(path: Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.clip(audio, -1, 1), TARGET_SAMPLE_RATE, subtype="PCM_24")
