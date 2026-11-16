"""V3.4 compiler regression coverage for real AI timing failures."""
from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1] / "scripts" / "illustrated_v30"
sys.path.insert(0, str(ROOT))
from normalize_v34 import normalize_storyboard
from validate import validate


def sample():
    return json.loads((ROOT / "example_illustrated_v30.json").read_text())


def test_converts_absolute_event_and_sfx_frames():
    doc = sample()
    doc["beats"][1]["events"][0]["at_frame"] = 72  # global, beat starts at 60
    doc["beats"][1]["sfx"][0]["at_frame"] = 72
    normalized, changes = normalize_storyboard(doc)
    assert normalized["beats"][1]["events"][0]["at_frame"] == 12
    assert normalized["beats"][1]["sfx"][0]["at_frame"] == 12
    assert doc["beats"][1]["events"][0]["at_frame"] == 72
    assert len(changes) == 2
    assert validate(normalized)["frames"] == 600


def test_converts_digit_string_to_integer():
    doc = sample()
    doc["beats"][0]["events"][0]["at_frame"] = "8"
    normalized, changes = normalize_storyboard(doc)
    assert type(normalized["beats"][0]["events"][0]["at_frame"]) is int
    assert normalized["beats"][0]["events"][0]["at_frame"] == 8
    assert changes


def test_rejects_unsupported_event_type():
    doc = sample()
    doc["beats"][1]["events"][0]["type"] = "zoom"
    with pytest.raises(ValueError, match="unsupported event"):
        normalize_storyboard(doc)


def test_rejects_out_of_range_frame():
    doc = sample()
    doc["beats"][1]["events"][0]["at_frame"] = 1000
    with pytest.raises(ValueError, match="outside relative"):
        normalize_storyboard(doc)


def test_rejects_ambiguous_fractional_frame():
    doc = sample()
    doc["beats"][1]["events"][0]["at_frame"] = 12.5
    with pytest.raises(ValueError, match="not an integer"):
        normalize_storyboard(doc)


def test_rejects_unknown_sfx():
    doc = sample()
    doc["beats"][0]["sfx"][0]["id"] = "cinematic-boom"
    with pytest.raises(ValueError, match="unsupported sfx"):
        normalize_storyboard(doc)


def test_rejects_unaligned_sound_after_normalization():
    doc = sample()
    doc["beats"][1]["events"][0]["at_frame"] = 61
    doc["beats"][1]["sfx"][0]["at_frame"] = 90
    normalized, changes = normalize_storyboard(doc)
    with pytest.raises(ValueError, match="synchronized event sound"):
        validate(normalized)


def test_existing_storyboard_unchanged():
    doc = sample()
    normalized, changes = normalize_storyboard(doc)
    assert normalized == doc
    assert changes == []
