"""Unified reference blueprint is consumed as advisory Creative Director style."""
from app.services.harshverse.creative_scene_planner import _style_preferences, propose_scene_plan
from app.services.harshverse.reference_style_blueprint import make_reference_blueprint


def test_split_screen_style_reaches_creative_director_without_authorizing_edit():
    dna = {
        "video": {"duration_seconds": 12.0},
        "editing_rhythm": {"detected_cut_times_seconds": [6.0],
                           "pacing": "slow", "mean_shot_seconds": 6.0},
        "semantic_vision": {"frame_observations": [
            {"time_seconds": 7.0, "error": None, "predictions": [{
                "label": "split_screen", "confidence_uncalibrated": 0.9,
                "evidence": "Upper supporting visual, presenter below",
                "frame_time_seconds": 7.0, "provenance": "vision_model_unreviewed"
            }]}
        ]}
    }
    blueprint = make_reference_blueprint(dna)
    assert "presenter_with_supporting_visual" in _style_preferences(blueprint)
    assert blueprint["quality_gate"]["automatic_application_allowed"] is False


def test_reject_untrusted_reference_style_gate():
    blueprint = {
        "schema_version": "reference-style-blueprint/v0.13",
        "quality_gate": {"automatic_application_allowed": True},
        "recommended": {"advisory_editing_preferences": [{
            "technique": "presenter_with_supporting_visual",
            "strength": "soft_preference", "never_force": True
        }]}
    }
    assert not _style_preferences(blueprint)
