import pytest
from app.services.harshverse.jack_content_engine import ContentRequest
from app.services.harshverse.jack_storyboard import ScriptBeat, compile_storyboard


def beats():
    return [ScriptBeat(kind, text) for kind, text in [
        ("hook", "Why does this happen?"),
        ("value", "Here is a demonstration with real evidence."),
        ("takeaway", "Remember the main lesson."),
        ("cta", "Try it yourself."),
    ]]


@pytest.mark.parametrize("mode,expected", [
    ("talking_head", "presenter_with_graphic"),
    ("faceless", "illustration_or_broll"),
    ("screen_demo", "screen_capture"),
])
def test_mode_specific_storyboard(mode, expected):
    plan = compile_storyboard(ContentRequest(
        topic="Demo", audience="Learners", goal="Explain",
        format=mode, duration_seconds=45), beats())
    assert plan["scenes"][1]["visual_intent"] == expected
    assert plan["scenes"][0]["estimated_start_seconds"] == 0
    assert plan["scenes"][-1]["estimated_end_seconds"] == 45
    assert plan["safety"]["render_ready"] is False
    assert all(scene["media_status"] == "unresolved" for scene in plan["scenes"])


def test_invalid_script_structure_fails():
    with pytest.raises(ValueError, match="exactly"):
        compile_storyboard(ContentRequest(topic="A", audience="B", goal="C"), beats()[:3])


def test_empty_script_fails():
    invalid = beats()
    invalid[2] = ScriptBeat("takeaway", " ")
    with pytest.raises(ValueError, match="1..2000"):
        compile_storyboard(ContentRequest(topic="A", audience="B", goal="C"), invalid)
