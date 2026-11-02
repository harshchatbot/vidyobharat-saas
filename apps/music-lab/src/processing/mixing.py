
from __future__ import annotations

import numpy as np
from scipy import signal


STEREO_SPACE = {
    "natural": {
        "width": 1.0,
        "vocal_room": 0.08,
        "guitar_room": 0.04,
    },
    "wide": {
        "width": 1.30,
        "vocal_room": 0.17,
        "guitar_room": 0.20,
    },
    "cinematic": {
        "width": 1.50,
        "vocal_room": 0.26,
        "guitar_room": 0.32,
    },
}


def _stereo_reflections(
    mono: np.ndarray,
    sr: int,
    *,
    cinematic: bool = False,
) -> np.ndarray:
    """Create complementary stereo early reflections."""

    left_taps = [(29, 0.55), (73, 0.30), (131, 0.16)]
    right_taps = [(43, 0.52), (97, 0.28), (157, 0.15)]

    if cinematic:
        left_taps.append((211, 0.12))
        right_taps.append((239, 0.12))

    result = np.zeros((len(mono), 2), dtype=np.float64)

    for channel, taps in enumerate((left_taps, right_taps)):
        for milliseconds, gain in taps:
            offset = round(milliseconds * sr / 1000)

            if offset < len(mono):
                result[offset:, channel] += mono[:-offset] * gain

    return result


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

    if stereo_space not in STEREO_SPACE:
        raise ValueError("Invalid stereo_space")

    config = STEREO_SPACE[stereo_space]

    vocal_gain = 1.15 * 10 ** (vocal_balance * 6 / 20)
    instrument_gain = 0.83 * 10 ** (-vocal_balance * 4 / 20)

    vm = vocal.mean(axis=1)
    inst = instrument.copy()

    if sidechain:
        envelope = np.abs(vm)
        envelope = signal.lfilter(
            [0.01], [1, -0.99], envelope
        )

        reduction = 1 - 0.22 * np.clip(
            envelope / (np.max(envelope) + 1e-9),
            0,
            1,
        )

        inst *= reduction[:, None]

    # Keep the dry vocal centered.
    vocal_stereo = np.column_stack((vm, vm))

    # Preserve original stereo information.
    mid = (inst[:, 0] + inst[:, 1]) * 0.5
    side = (inst[:, 0] - inst[:, 1]) * 0.5

    side *= config["width"]

    instrument_stereo = np.column_stack((
        mid + side,
        mid - side,
    ))

    is_cinematic = stereo_space == "cinematic"

    vocal_ambience = _stereo_reflections(
        vm, sr, cinematic=is_cinematic
    )

    guitar_ambience = _stereo_reflections(
        mid, sr, cinematic=is_cinematic
    )

    # Cross the guitar reflection channels to create
    # a different spatial pattern from the vocals.
    guitar_ambience = guitar_ambience[:, ::-1]

    # Reverb controls the wet signal, without
    # multiplying the space amount twice.
    vocal_wet = reverb * config["vocal_room"] * 3.0
    guitar_wet = config["guitar_room"] * 0.7

    # Gentle centered delay.
    delayed = np.zeros_like(vm)
    delay_samples = round((0.18 + delay * 0.24) * sr)

    if delay > 0 and 0 < delay_samples < len(vm):
        delayed[delay_samples:] = (
            vm[:-delay_samples] * delay * 0.22
        )

    result = (
        vocal_gain * vocal_stereo * 0.707
        + instrument_gain * instrument_stereo * 0.707
        + vocal_gain * vocal_ambience * vocal_wet
        + instrument_gain * guitar_ambience * guitar_wet
        + np.column_stack((delayed, delayed)) * 0.5
    )

    return result
