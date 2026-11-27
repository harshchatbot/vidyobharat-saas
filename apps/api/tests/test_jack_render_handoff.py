import pytest
from app.services.harshverse.jack_content_engine import ContentRequest
from app.services.harshverse.jack_storyboard import ScriptBeat, compile_storyboard
from app.services.harshverse.jack_render_handoff import prepare_render_handoff


def storyboard(fmt):
    req = ContentRequest(topic="CDC", audience="Developers", goal="Learn",
                         format=fmt, duration_seconds=45)
    beats = [ScriptBeat(kind, "Example narration") for kind in
             ("hook", "value", "takeaway", "cta")]
    return compile_storyboard(req, beats)


@pytest.mark.parametrize("fmt,supported", [
    ("talking_head", True), ("faceless", False), ("screen_demo", False),
])
def test_format_handoff_never_claims_render_ready(fmt, supported):
    result = prepare_render_handoff(storyboard(fmt))
    assert result["renderer_supported"] is supported
    assert result["render_ready"] is False
    assert result["missing_assets"]
    assert result["timing_status"] == "estimated_requires_audio_alignment"


def test_presenter_baseline_uses_existing_valid_recipes():
    result = prepare_render_handoff(storyboard("talking_head"), approved_assets={
        "presenter_video_with_audio": "/tmp/presenter.mp4",
        "animation_plate_video": "/tmp/animation.mp4",
    }, script_approved=True)
    assert result["missing_assets"] == []
    assert result["scene_plan"]["scenes"][0]["recipe"] == "presenter_hook"
    assert result["scene_plan"]["scenes"][-1]["recipe"] == "presenter_outro"
    assert result["render_ready"] is False


def test_invalid_scene_timing_rejected():
    plan = storyboard("screen_demo")
    plan["scenes"][2]["estimated_start_seconds"] = -1
    with pytest.raises(ValueError, match="gaps"):
        prepare_render_handoff(plan)
