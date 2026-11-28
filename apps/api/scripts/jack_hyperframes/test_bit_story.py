import json
from pathlib import Path

import bit_story

HERE = Path(__file__).parent


def _save() -> dict:
    return json.loads((HERE / "stories" / "save_v4.json").read_text())


def test_reference_story_passes() -> None:
    assert all(c.ok for c in bit_story.review(_save()))


def test_v3_style_script_fails_on_jargon_and_stakes() -> None:
    s = _save()
    s["beats"][3]["text"] = "First I'm packed as JSON, locked, and fired down the wire! Then: two hundred, OK!"
    s["beats"][0]["text"] = "Tap Save!"
    failed = {c.id for c in bit_story.review(s) if not c.ok}
    assert {"jargon", "stakes_second_person"} <= failed


def test_explained_term_is_allowed() -> None:
    s = _save()
    s["beats"][4]["text"] += " That's called TLS."
    s["beats"][4]["explains"] = ["TLS"]
    assert next(c for c in bit_story.review(s) if c.id == "jargon").ok


def test_cta_must_follow_a_feeling() -> None:
    s = _save()
    s["beats"][6]["text"] = "Follow for part two. That's me, home safe?"
    assert not next(c for c in bit_story.review(s) if c.id == "feeling_before_cta").ok


def test_wow_needs_source_and_mood_rules() -> None:
    s = _save()
    s["beats"][5]["source"] = ""
    s["beats"][3]["mood"] = "grin"
    failed = {c.id for c in bit_story.review(s) if not c.ok}
    assert {"wow_sourced", "mood_trouble"} <= failed


def test_validator_raises_with_reasons() -> None:
    s = _save()
    s["beats"] = s["beats"][:6]
    try:
        bit_story.validator(s)
    except ValueError as e:
        assert "beats" in str(e)
    else:
        raise AssertionError("expected ValueError")
