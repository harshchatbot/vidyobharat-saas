"""V3.4 offline regression tests: no story leakage, visual selection and QA."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1] / "scripts" / "illustrated_v30"
sys.path.insert(0, str(ROOT))
from auto_direct_v34 import FRAME_SLOTS, SYSTEM, request_payload, verify_generated
from visual_qa_v34 import storyboard_preflight


def scene():
    doc = json.loads((ROOT / "example_illustrated_v30.json").read_text())
    doc["brief"] = "Explain how a video opening influences audience retention."
    # Convert the old example into a different, topic-driven, graphics-first plan.
    roles = ["character_focus", "center_card", "graphic_focus", "full_bleed",
             "split_compare", "graphic_focus", "center_card", "cta_focus"]
    replacements = [
        None, "idea_card", "retention_chart", "prompt_card",
        "phone_screen", "compare_card", "checklist_card", None,
    ]
    for i, beat in enumerate(doc["beats"]):
        beat["stage"]["layout"] = roles[i]
        beat["stage"]["actors"] = []
        if replacements[i]:
            beat["stage"]["props"] = [{"id": replacements[i], "text": f"Visual for scene {i+1}", "enter": "pop"}]
        elif i == 0:
            beat["stage"]["props"] = [{"id": "stage_sign", "text": "VIDEO HOOK", "enter": "pop"}]
        if i != 7:
            prop_id = beat["stage"]["props"][0]["id"]
            beat["events"] = [{"at_frame": 9, "type": "pop", "target": prop_id}]
            beat["sfx"] = [{"id": "pop", "at_frame": 9}]
        else:
            beat["events"] = [
                {"at_frame": 12, "type": "type_text", "target": "comment_box", "value": "HOOK"},
                {"at_frame": 60, "type": "pop", "target": "envelope"},
            ]
    return doc


def test_v34_does_not_send_previous_story():
    req = request_payload("Make a reel about creating a good hook.", {"secret": "five critics"})
    serialized = json.dumps(req)
    assert "five critics" not in serialized
    assert "reference_is_structure_only_not_content" not in serialized
    assert "phone_screen" in req["library"]["props"]


def test_v34_topic_specific_valid_fixture():
    doc = scene()
    assert verify_generated(doc, doc["brief"])["frames"] == 600
    preflight = storyboard_preflight(doc)
    assert preflight["layout_count"] >= 4
    assert preflight["graphic_beats"] >= 3


def test_v34_rejects_critic_without_topic_permission():
    doc = scene()
    doc["beats"][1]["stage"]["actors"].append(
        {"id": "critic_visuals", "pose": "neutral", "x": .3, "enter": "pop"}
    )
    with pytest.raises(ValueError, match="critic characters"):
        verify_generated(doc, doc["brief"])


def test_v34_rejects_missing_visual_event_target():
    doc = scene()
    doc["beats"][2]["events"][0]["target"] = "calculator"
    with pytest.raises(ValueError, match="not present"):
        verify_generated(doc, doc["brief"])


def test_v34_rejects_repetitive_layout():
    doc = scene()
    for b in doc["beats"][:-1]:
        b["stage"]["layout"] = "character_focus"
    with pytest.raises(ValueError, match="four distinct"):
        verify_generated(doc, doc["brief"])


def test_v34_rejects_no_graphics():
    doc = scene()
    for b in doc["beats"][1:7]:
        b["stage"]["props"] = [{"id": "speech_bubble", "text": "Generic", "enter": "pop"}]
        b["events"][0]["target"] = "speech_bubble"
    with pytest.raises(ValueError, match="topic-relevant graphics"):
        verify_generated(doc, doc["brief"])


def test_v34_remains_review_only():
    doc = scene()
    doc["ready_to_publish"] = True
    with pytest.raises(ValueError, match="publishing gates"):
        verify_generated(doc, doc["brief"])
