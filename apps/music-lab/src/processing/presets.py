
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, replace
from typing import Literal

PresetName = Literal["acoustic", "sufi", "clean_studio"]


@dataclass(frozen=True)
class ProductionSettings:
    preset: PresetName = "acoustic"
    stereo_space: str = "natural"
    clarity: float = 0.55
    compression: float = 0.35
    reverb: float = 0.20
    delay: float = 0.0
    vocal_balance: float = 0.0
    sync_offset_ms: int = 0
    sidechain: bool = False
    de_esser: float = 0.25
    vocal_warmth: float = 0.25
    instrumental_width: float = 0.50
    noise_reduction: float = 0.0
    loudness_lufs: float = -14.0


_PRESETS: dict[PresetName, ProductionSettings] = {
    "acoustic": ProductionSettings(),

    "sufi": ProductionSettings(
        preset="sufi",
        stereo_space="wide",
        clarity=0.50,
        compression=0.25,
        reverb=0.35,
        delay=0.08,
        de_esser=0.20,
        vocal_warmth=0.40,
        instrumental_width=0.55,
    ),

    "clean_studio": ProductionSettings(
        preset="clean_studio",
        stereo_space="natural",
        clarity=0.65,
        compression=0.45,
        reverb=0.12,
        delay=0.0,
        de_esser=0.35,
        vocal_warmth=0.15,
        instrumental_width=0.45,
    ),
}


def validated_settings(**values: object) -> ProductionSettings:
    preset = str(values.get("preset", "acoustic"))

    if preset not in _PRESETS:
        raise ValueError(
            "preset must be acoustic, sufi, or clean_studio"
        )

    base = _PRESETS[preset]  # type: ignore[index]

    numeric_ranges = {
        "clarity": (0.0, 1.0),
        "compression": (0.0, 1.0),
        "reverb": (0.0, 1.0),
        "delay": (0.0, 1.0),
        "vocal_balance": (-1.0, 1.0),
        "loudness_lufs": (-20.0, -9.0),
        "de_esser": (0.0, 1.0),
        "vocal_warmth": (0.0, 1.0),
        "instrumental_width": (0.0, 1.0),
        "noise_reduction": (0.0, 1.0),
    }

    updates: dict[str, object] = {}

    for key, (low, high) in numeric_ranges.items():
        if key in values and values[key] is not None:
            value = float(values[key])

            if not math.isfinite(value) or not low <= value <= high:
                raise ValueError(
                    f"{key} must be between {low} and {high}"
                )

            updates[key] = value

    if (
        "sync_offset_ms" in values
        and values["sync_offset_ms"] is not None
    ):
        offset = int(values["sync_offset_ms"])

        if not -10_000 <= offset <= 10_000:
            raise ValueError(
                "sync_offset_ms must be between -10000 and 10000"
            )

        updates["sync_offset_ms"] = offset

    if "sidechain" in values:
        if not isinstance(values["sidechain"], bool):
            raise ValueError("sidechain must be a boolean")

        updates["sidechain"] = values["sidechain"]

    if "stereo_space" in values:
        space = str(values["stereo_space"])

        if space not in {"natural", "wide", "cinematic"}:
            raise ValueError("Invalid stereo_space")

        updates["stereo_space"] = space

    return replace(base, **updates)


def settings_dict(
    settings: ProductionSettings,
) -> dict[str, object]:
    return asdict(settings)
