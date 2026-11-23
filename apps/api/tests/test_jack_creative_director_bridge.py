import pytest

from app.services.harshverse.jack_content_engine import ContentRequest
from app.services.harshverse.jack_storyboard import ScriptBeat, compile_storyboard
from app.services.harshverse.jack_creative_director_bridge import bridge_jack_to_creative_director


def sample():
    return compile_storyboard(
        ContentRequest(topic="CDC", audience="Developers", goal="Learn",
                       format="screen_demo", duration_seconds=45),
        [ScriptBeat(k, "Salesforce event driven integration example") for k in
         ("hook", "value", "takeaway", "cta")])


def test_existing_planner_is_reused_and_hyperframes_are_review_only():
    result = bridge_jack_to_creative_director(sample())
    assert result["existing_harshverse_scene_proposals"]["schema_version"] == "harshverse-scene-proposals/v0.14"
    assert len(result["hyperframe_proposals"]) == 4
    assert result["hyperframe_proposals"][1]["camera_proposal"] == "three_quarter_orbit"
    assert result["safety"]["render_ready"] is False
    assert result["transcription"]["status"] == "not_run"
    assert result["sfx"]["assets_resolved"] is False


def test_invalid_timing_fails():
    storyboard = sample()
    storyboard["scenes"][1]["estimated_start_seconds"] = -2
    with pytest.raises(ValueError, match="timing"):
        bridge_jack_to_creative_director(storyboard)
