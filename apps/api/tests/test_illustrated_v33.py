"""Offline contract tests for V3.3 topic-to-storyboard orchestration."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts" / "illustrated_v30"
sys.path.insert(0, str(SCRIPTS))
from auto_direct_v33 import FRAME_SLOTS, provenance, request_payload, verify_generated


def example():
    doc = json.loads((SCRIPTS / "example_illustrated_v30.json").read_text())
    doc["brief"] = "Create an original illustrated reel about testing a reel idea."
    return doc


def test_existing_example_v33_contract():
    doc = example()
    report = verify_generated(doc, doc["brief"])
    assert report["frames"] == 600 and report["beats"] == 8


def test_frame_slots_are_exact():
    assert sum(slot["duration_frames"] for slot in FRAME_SLOTS) == 600
    assert FRAME_SLOTS[-1]["end_frame"] == 600
    assert all(a["end_frame"] == b["start_frame"]
               for a, b in zip(FRAME_SLOTS, FRAME_SLOTS[1:]))


def test_v33_rejects_changed_scene_timing():
    doc = example()
    doc["beats"][5]["end_frame"] -= 1
    with pytest.raises(ValueError, match="frame counts"):
        verify_generated(doc, doc["brief"])


def test_v33_rejects_unknown_prop():
    doc = example()
    doc["beats"][2]["stage"]["props"].append({"id": "not_from_library"})
    with pytest.raises(ValueError, match="unknown prop"):
        verify_generated(doc, doc["brief"])


def test_v33_rejects_publishable_document():
    doc = example()
    doc["ready_to_publish"] = True
    with pytest.raises(ValueError, match="publishing gates"):
        verify_generated(doc, doc["brief"])


def test_v33_rejects_markup():
    doc = example()
    doc["beats"][1]["headline"]["text"] = "<script>alert(1)</script>"
    doc["beats"][1]["headline"]["emphasis_word"] = "<script>"
    with pytest.raises(ValueError, match="markup"):
        verify_generated(doc, doc["brief"])


def test_provenance_remains_review_only():
    doc = example()
    qa = verify_generated(doc, doc["brief"])
    report = provenance(doc["brief"], doc, qa)
    assert report["ready_to_publish"] is False
    assert report["publish_gate"] == "blocked_review_required"
    assert len(report["storyboard_sha256"]) == 64


def test_generation_payload_uses_explicit_library():
    doc = example()
    req = request_payload(doc["brief"], doc)
    assert "prop-that-is-not-registered" not in req["library"]["props"]
    assert len(req["frame_slots"]) == 8
