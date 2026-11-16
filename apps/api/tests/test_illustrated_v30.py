"""Contract tests for illustrated V3.0 (no network, no external video files)."""
import copy
import json
from pathlib import Path
import sys

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts" / "illustrated_v30"
sys.path.insert(0, str(SCRIPTS))
from validate import validate


def example():
    return json.loads((SCRIPTS / "example_illustrated_v30.json").read_text())


def test_example_passes_all_frame_checks():
    assert validate(example())["frames"] == 600


def test_missing_frame_rejected():
    doc = example()
    doc["beats"][1]["start_frame"] += 1
    with pytest.raises(ValueError, match="frame counts"):
        validate(doc)


def test_unknown_asset_rejected():
    doc = example()
    doc["beats"][0]["stage"]["props"][0]["id"] = "invented_prop"
    with pytest.raises(ValueError, match="unknown prop"):
        validate(doc)


def test_unillustrative_counter_rejected():
    doc = example()
    doc["beats"][5]["events"][0]["value"]["illustrative"] = False
    with pytest.raises(ValueError, match="illustrative"):
        validate(doc)


def test_publish_gate_remains_locked():
    doc = example()
    doc["ready_to_publish"] = True
    with pytest.raises(ValueError, match="publishing gates"):
        validate(doc)
