import pytest

from app.services.harshverse.jack_content_engine import ContentRequest
from app.services.harshverse.jack_storyboard import ScriptBeat, compile_storyboard
from scripts.render_jack_screen_demo_local import render_prototype


def _storyboard(fmt="screen_demo"):
    return compile_storyboard(
        ContentRequest(topic="CDC", audience="Developers", goal="Explain",
                       format=fmt, duration_seconds=45),
        [ScriptBeat(kind, "This is a short explanation.") for kind in
         ("hook", "value", "takeaway", "cta")],
    )


def test_prototype_rejects_wrong_format(tmp_path):
    with pytest.raises(ValueError, match="screen_demo"):
        render_prototype(_storyboard("faceless"), tmp_path)


def test_prototype_rejects_missing_narration(tmp_path):
    plan = _storyboard()
    plan["scenes"][1]["narration"] = ""
    with pytest.raises(ValueError, match="narration"):
        render_prototype(plan, tmp_path)
