
"""Stereo mixing engine for Rangmanch Music Studio."""

from __future__ import annotations

import numpy as np
from scipy import signal

from .effects import stereo_reverb, feedback_delay


STEREO_SPACE = {
    "natural": {
        "width": 1.0,
        "vocal_room": 0.55,
        "guitar_room": 0.15,
        "decay": 1.2,
    },
    "wide": {
        "width": 1.3,
        "vocal_room": 0.8,
        "guitar_room": 0.30,
        "decay": 1.8,
    },
    "cinematic": {
        "width": 1.5,
        "vocal_room": 1.0,
        "guitar_room": 0.45,
        "decay": 2.8,
    },
}


def mix(
    vocal: np.ndarray,
    instrument: np.ndarray,
    vocal_balance: float,
    reverb: float,
    delay: float,
    sidechain: bool,
    sr: int = 48_000,
    stereo_space: str = "natural",
) -> np.ndarray:
    """Mix independent dry, reverb, and delay buses."""

    if stereo_space not in STEREO_SPACE:
        raise ValueError("Invalid stereo_space")

    if not 0 <= reverb <= 1:
        raise ValueError("Reverb must be between 0 and 1")

    if not 0 <= delay <= 1:
        raise ValueError("Delay must be between 0 and 1")

    config = STEREO_SPACE[stereo_space]

    vocal_gain = 1.15 * 10 ** (vocal_balance * 6 / 20)
    instrument_gain = 0.83 * 10 ** (
        -vocal_balance * 4 / 20
    )

    # Center dry lead vocal.
    vm = vocal.mean(axis=1)
    vocal_stereo = np.column_stack((vm, vm))

    inst = instrument.copy()

    # Optional vocal-triggered instrument ducking.
    if sidechain:
        envelope = np.abs(vm)

        envelope = signal.lfilter(
            [0.01],
            [1, -0.99],
            envelope,
        )

        reduction = 1 - 0.22 * np.clip(
            envelope / (np.max(envelope) + 1e-9),
            0,
            1,
        )

        inst *= reduction[:, None]

    # Preserve and moderately widen existing stereo content.
    mid = (inst[:, 0] + inst[:, 1]) * 0.5
    side = (inst[:, 0] - inst[:, 1]) * 0.5

    side *= config["width"]

    instrument_stereo = np.column_stack((
        mid + side,
        mid - side,
    ))

    # Independent dry bus.
    dry_bus = (
        vocal_gain * vocal_stereo * 0.707
        + instrument_gain * instrument_stereo * 0.707
    )

    # Independent vocal reverb bus.
    vocal_reverb_bus = np.zeros_like(dry_bus)

    # Independent instrumental reverb bus.
    instrument_reverb_bus = np.zeros_like(dry_bus)

    if reverb > 0:
        vocal_reverb_bus = stereo_reverb(
            vocal_stereo,
            sr=sr,
            decay_seconds=config["decay"],
        )

        instrument_reverb_bus = stereo_reverb(
            instrument_stereo,
            sr=sr,
            decay_seconds=config["decay"] * 0.8,
        )

    # Independent vocal delay bus.
    delay_bus = np.zeros_like(dry_bus)

    if delay > 0:
        delay_bus = feedback_delay(
            vocal_stereo,
            sr=sr,
            delay_ms=350,
            feedback=0.55,
        )

    # User-facing sliders control actual effect bus levels.
    vocal_reverb_gain = reverb * config["vocal_room"]
    instrument_reverb_gain = (
        reverb * config["guitar_room"]
    )
    vocal_delay_gain = delay * 0.8

    result = (
        dry_bus
        + vocal_gain
        * vocal_reverb_bus
        * vocal_reverb_gain
        * 0.707
        + instrument_gain
        * instrument_reverb_bus
        * instrument_reverb_gain
        * 0.707
        + vocal_gain
        * delay_bus
        * vocal_delay_gain
        * 0.707
    )

    return result
