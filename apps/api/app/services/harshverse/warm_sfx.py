"""Original procedural sound accents for the HarshVerse warm style.

No audio samples, soundfont assets, or recordings from any third party.
Small deterministic synthesizer for a crisp UI pop and soft filtered
whoosh. Source narration is never replaced; optional generated bed is mixed
quietly into the existing stream after the composition is validated.
"""
from __future__ import annotations

import math
from pathlib import Path
import random
import struct
import wave

_RATE = 48000


def synthesize_warm_sfx(path: Path, duration: float,
                        beats: list[tuple[float, str]]) -> tuple[Path, int]:
    if not 0 < duration <= 60:
        raise ValueError("Invalid SFX bed duration")
    samples = [0.0] * (math.ceil(duration * _RATE))
    last_cue = -3.0
    rendered = 0
    for at, kind in sorted(beats):
        if kind not in ("whoosh", "pop", "click", "faahh", "typewriter"):
            raise ValueError("Unknown original SFX")
        if not math.isfinite(at) or at < 0 or at >= duration:
            raise ValueError("Invalid original SFX timing")
        # Keep spoken-word comprehension primary. Avoid machine-gun cues.
        if at - last_cue < 1.05 or rendered >= 5:
            continue
        last_cue = at
        rendered += 1
        rng = random.Random(5811 + int(at * 1000))
        length = {"whoosh": 0.33, "pop": 0.19, "click": 0.065,
                  "faahh": 0.45, "typewriter": 0.30}[kind]
        n = int(length * _RATE)
        start = round(at * _RATE)
        filtered = 0.0
        for i in range(min(n, len(samples) - start)):
            t = i / _RATE
            progress = i / n
            if kind == "whoosh":
                # Noise shaped into a rising and falling airy sweep.
                envelope = (math.sin(math.pi * progress) ** 1.65) * 0.070
                filtered = 0.82 * filtered + 0.18 * rng.uniform(-1, 1)
                value = envelope * filtered
            elif kind == "faahh":
                # Cinematic, quiet airy lift and a short warm low thud.
                filtered = 0.89 * filtered + 0.11 * rng.uniform(-1, 1)
                envelope = (math.sin(math.pi * progress) ** 1.8) * 0.080
                bass = math.sin(2 * math.pi * (132 - 54 * progress) * t)
                value = envelope * filtered + 0.026 * bass * math.exp(-10 * t)
            elif kind == "typewriter":
                # Three quiet mechanical key-taps in a 300 ms cue.
                local = (t % .095)
                envelope = math.exp(-95 * local) * (1 - math.exp(-650 * local))
                value = .065 * rng.uniform(-1, 1) * envelope
            elif kind == "pop":
                envelope = math.exp(-27 * t) * (1 - math.exp(-300 * t))
                value = (0.105 * math.sin(2 * math.pi * (310 - 120 * progress) * t)
                         + 0.016 * rng.uniform(-1, 1)) * envelope
            else:
                envelope = math.exp(-66 * t) * (1 - math.exp(-500 * t))
                value = 0.085 * rng.uniform(-1, 1) * envelope
            samples[start + i] += value
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(_RATE)
        # peak below 0.11; conversion explicitly clipped as a guardrail.
        audio.writeframes(b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, sample)) * 32767))
            for sample in samples
        ))
    return path, rendered
