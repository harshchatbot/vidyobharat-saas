"""V0.17 effects compiler tests; no real FFmpeg or paid inference calls."""
import pytest
from app.services.harshverse.pro_finishing_v017 import (
    Effect, build_video_filter, parse_effects,
)


def sample(*effects):
    return {"schema_version": "harshverse-effects/v0.17", "effects": list(effects)}


def event(ident="zoom1", kind="punch_zoom", start=1, end=1.6, **extra):
    return {"id": ident, "kind": kind, "start": start, "end": end, **extra}


def test_effects_and_deferrals():
    active, deferred = parse_effects(sample(
        event(), event("tick", "tick", 2, 3),
        event("whoosh", "sfx", 2.1, 2.5, cue="whoosh"),
        event("broll", "broll", 4, 5)), duration=10)
    assert [x.kind for x in active] == ["punch_zoom", "tick", "sfx"]
    assert [x["kind"] for x in deferred] == ["broll"]
    assert deferred[0]["status"] == "not_rendered"


def test_unknown_and_duplicate_rejected():
    with pytest.raises(ValueError, match="Unknown"):
        parse_effects(sample(event(kind="delete_everything")), duration=10)
    with pytest.raises(ValueError, match="duplicate"):
        parse_effects(sample(event(), event()), duration=10)


@pytest.mark.parametrize("start,end", [(-1, 1), (2, 1), (1, 11), (float("nan"), 2), (True, 2)])
def test_invalid_times(start, end):
    with pytest.raises(ValueError, match="interval"):
        parse_effects(sample(event(start=start, end=end)), duration=10)


def test_dense_camera_effects_fail_closed():
    with pytest.raises(ValueError, match="crowd"):
        parse_effects(sample(event(), event("shake1", "impact_shake", 1.65, 2.0)), duration=10)


def test_long_untrusted_headline_rejected():
    with pytest.raises(ValueError, match="text"):
        parse_effects(sample(event("text", "headline", 1, 2, text="x" * 81)), duration=10)


def test_data_and_cuts_never_rendered():
    kinds = ("jump_cut", "j_cut", "l_cut", "money_stack", "calendar",
             "emoji", "transition", "broll")
    active, deferred = parse_effects(sample(*[
        event(f"e{i}", kind, i / 2, i / 2 + 0.25) for i, kind in enumerate(kinds)
    ]), duration=10)
    assert active == []
    assert {x["kind"] for x in deferred} == set(kinds)


def test_sfx_requires_original_known_cue():
    with pytest.raises(ValueError, match="SFX"):
        parse_effects(sample(event("a", "sfx", 1, 1.5, cue="external.mp3")), duration=10)


def test_video_filter_contains_multiple_timed_layers(tmp_path):
    font = tmp_path / "font.ttf"
    font.write_bytes(b"test")
    active, _ = parse_effects(sample(
        event(), event("tick", "tick", 2, 3),
        event("caption", "headline", 4, 4.8, text="Hello")),
        duration=10)
    graph = build_video_filter(active, width=720, height=1280, fontfile=font)
    assert "overlay" in graph and "drawtext" in graph
    assert "between(t,1.000,1.600)" in graph
    assert "[vout]" in graph
