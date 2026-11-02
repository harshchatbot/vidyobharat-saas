
"""Wet-only stereo effects for Rangmanch Music Studio."""

from __future__ import annotations

import numpy as np
from scipy.signal import fftconvolve


def _stereo(audio: np.ndarray) -> np.ndarray:
    x = np.asarray(audio, dtype=np.float64)

    if x.ndim == 1:
        return np.column_stack((x, x))

    if x.ndim != 2 or x.shape[1] != 2:
        raise ValueError("Expected mono or stereo audio")

    return x


def stereo_reverb(
    audio: np.ndarray,
    sr: int = 48_000,
    decay_seconds: float = 1.4,
) -> np.ndarray:
    """Return only stereo reverb, without the dry signal."""

    dry = _stereo(audio)

    if decay_seconds <= 0:
        raise ValueError("Decay must be positive")

    length = max(1, round(decay_seconds * sr))
    rng = np.random.default_rng(42)

    impulse = np.zeros((length, 2), dtype=np.float64)

    for channel in range(2):
        times = np.linspace(
            0.025,
            max(0.026, decay_seconds - 0.01),
            320,
        )

        times += rng.uniform(-0.004, 0.004, len(times))

        indices = np.clip(
            (times * sr).astype(int),
            0,
            length - 1,
        )

        gains = (
            np.exp(-6.0 * indices / length)
            * rng.uniform(-1, 1, len(indices))
        )

        np.add.at(impulse[:, channel], indices, gains)

        early = (
            [(31, 0.6), (59, 0.4), (101, 0.2)]
            if channel == 0
            else [(43, 0.6), (73, 0.4), (127, 0.2)]
        )

        for ms, gain in early:
            idx = round(ms * sr / 1000)

            if idx < length:
                impulse[idx, channel] += gain

    wet = np.column_stack([
        fftconvolve(
            dry[:, channel],
            impulse[:, channel],
            mode="full",
        )[:len(dry)]
        for channel in range(2)
    ])

    # Normalize effect level relative to input, not peak volume.
    dry_rms = np.sqrt(np.mean(dry**2) + 1e-12)
    wet_rms = np.sqrt(np.mean(wet**2) + 1e-12)

    if wet_rms > 1e-9:
        wet *= dry_rms / wet_rms

    return wet


def feedback_delay(
    audio: np.ndarray,
    sr: int = 48_000,
    delay_ms: int = 350,
    feedback: float = 0.55,
    repeats: int = 6,
) -> np.ndarray:
    """Return only alternating stereo echoes."""

    dry = _stereo(audio)

    if not 0 <= feedback < 1:
        raise ValueError("Feedback must be between 0 and 1")

    if delay_ms <= 0:
        raise ValueError("Delay must be positive")

    samples = max(1, round(delay_ms * sr / 1000))
    wet = np.zeros_like(dry)

    # Use a centered source for alternating echoes.
    source = dry.mean(axis=1)

    for repeat in range(1, repeats + 1):
        offset = repeat * samples

        if offset >= len(source):
            break

        channel = (repeat - 1) % 2
        gain = feedback ** (repeat - 1)

        wet[offset:, channel] += source[:-offset] * gain

    return wet
