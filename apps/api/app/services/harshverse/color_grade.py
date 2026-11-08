"""Presenter-only color grading presets for HarshVerse.

Pure FFmpeg filter strings: no LUT downloads, no AI recoloring, no face retouch,
no per-frame white-balance oscillation. Apply to the *camera input* before
graphics/captions/buddy are composited so brand colors stay unchanged.

The warm preset intentionally makes small adjustments for mixed-light phone
recordings. It is not a replacement for good lighting or camera exposure.
"""
from __future__ import annotations

from typing import Literal

GradePreset = Literal["auto", "off", "warm_editorial"]

# Validated against FFmpeg colorbalance + eq filters.
# Preserve luma while adding a little red/amber in midtones, subtly reduce
# blue, lift midtones, and restore a small amount of saturation/contrast.
_WARM_EDITORIAL_FILTER = (
    "colorbalance="
    "rs=0.015:gs=0:bs=-0.012:"
    "rm=0.024:gm=0.005:bm=-0.015:"
    "rh=0.006:gh=0:bh=-0.006:pl=1,"
    "eq=contrast=1.045:brightness=0.009:saturation=1.07:gamma=1.035"
)


def resolve_color_grade(visual_style: str, requested: GradePreset = "auto") -> str:
    """Resolve an optional grade without hardcoding it in the core renderer."""
    if requested not in ("auto", "off", "warm_editorial"):
        raise ValueError("Unsupported presenter grade")
    if visual_style not in ("classic", "harshverse_warm"):
        raise ValueError("Unknown visual style pack")
    if requested == "auto":
        return "warm_editorial" if visual_style == "harshverse_warm" else "off"
    return requested


def presenter_grade_filter(preset: str = "off") -> str:
    """Return only the FFmpeg video filter suffix (empty means untouched)."""
    if preset == "off":
        return ""
    if preset == "warm_editorial":
        return _WARM_EDITORIAL_FILTER
    raise ValueError("Unknown presenter grade preset")
