from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from typing import Literal

PresetName = Literal["acoustic", "sufi", "clean_studio"]


@dataclass(frozen=True)
class ProductionSettings:
    preset: PresetName = "acoustic"
    clarity: float = 0.55
    compression: float = 0.35
    reverb: float = 0.18
    delay: float = 0.0
    vocal_balance: float = 0.0
    sync_offset_ms: int = 0
    sidechain: bool = False
    de_esser: float = 0.25
    vocal_warmth: float = 0.2
    instrumental_width: float = 0.5
    noise_reduction: float = 0.0
    loudness_lufs: float = -14.0


_PRESETS: dict[PresetName, ProductionSettings] = {
    "acoustic": ProductionSettings(),
    "sufi": ProductionSettings(clarity=0.45, compression=0.28, reverb=0.28, delay=0.08, vocal_balance=0.05, vocal_warmth=0.38, de_esser=0.18),
    "clean_studio": ProductionSettings(clarity=0.7, compression=0.48, reverb=0.1, delay=0.0, vocal_balance=0.08, de_esser=0.38, instrumental_width=0.6),
}


def validated_settings(**values: object) -> ProductionSettings:
    preset = str(values.get("preset", "acoustic"))
    if preset not in _PRESETS:
        raise ValueError("preset must be acoustic, sufi, or clean_studio")
    base = _PRESETS[preset]  # type: ignore[index]
    numeric_ranges = {
        "clarity": (0.0, 1.0), "compression": (0.0, 1.0), "reverb": (0.0, 1.0),
        "delay": (0.0, 1.0), "vocal_balance": (-1.0, 1.0), "loudness_lufs": (-20.0, -9.0),
        "de_esser": (0.0, 1.0), "vocal_warmth": (0.0, 1.0), "instrumental_width": (0.0, 1.0), "noise_reduction": (0.0, 1.0),
    }
    updates: dict[str, object] = {}
    for key, (low, high) in numeric_ranges.items():
        if key in values and values[key] is not None:
            value = float(values[key])
            if not low <= value <= high:
                raise ValueError(f"{key} must be between {low} and {high}")
            updates[key] = value
    if "sync_offset_ms" in values and values["sync_offset_ms"] is not None:
        offset = int(values["sync_offset_ms"])
        if not -10_000 <= offset <= 10_000:
            raise ValueError("sync_offset_ms must be between -10000 and 10000")
        updates["sync_offset_ms"] = offset
    if "sidechain" in values: updates["sidechain"] = bool(values["sidechain"])
    return replace(base, **updates)


def settings_dict(settings: ProductionSettings) -> dict[str, object]:
    return asdict(settings)
