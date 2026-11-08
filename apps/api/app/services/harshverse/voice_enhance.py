"""Optional, deterministic speech cleanup for HarshVerse talking-head videos.

All filters are built into FFmpeg. No third-party voice weights, cloud uploads,
voice cloning, speech replacement, transcript changes or generative audio.

Enhance ONLY the original narration BEFORE generated SFX are mixed. Do not
enhance the already-mixed finished video: it would also distort sound effects.

These restrained starting presets are meant for human QA and A/B comparison,
not a claim of real studio acoustics or restoration of clipped recordings.
"""
from __future__ import annotations

from typing import Literal

VoicePreset = Literal["off", "natural", "studio"]

_FILTERS: dict[str, str] = {
    "off": "",
    # Lowest intervention: reduce rumble, gentle mud cut and light leveling.
    "natural": (
        "aresample=48000,"
        "highpass=f=72,"
        "equalizer=f=280:t=q:w=1.0:g=-1.0,"
        "acompressor=threshold=0.09:ratio=1.7:attack=18:release=180:makeup=1.0"
    ),
    # Balanced talking-head preset: moderate FFT denoise, tonal clarity,
    # restrained de-essing and compression. Avoid noise gates that clip syllables.
    "studio": (
        "aresample=48000,"
        "highpass=f=78,"
        "afftdn=nr=8:nf=-52:tn=0,"
        "equalizer=f=260:t=q:w=1.0:g=-1.6,"
        "equalizer=f=3200:t=q:w=0.95:g=1.4,"
        "deesser=i=0.12:m=0.35:f=0.52,"
        "acompressor=threshold=0.08:ratio=2.2:attack=16:release=170:makeup=1.05"
    ),
}


def voice_enhance_filter(preset: VoicePreset = "off") -> str:
    """Filter chain for a single spoken-source audio stream, not SFX."""
    try:
        return _FILTERS[preset]
    except KeyError as exc:
        raise ValueError(f"Unknown voice enhancement preset: {preset}") from exc
