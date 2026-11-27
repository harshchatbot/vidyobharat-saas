"""Regression for OpenAI frame evidence: no fabricated motion or auto-edit approval."""
from app.services.harshverse.reference_style_blueprint import make_reference_blueprint


def test_static_frame_composition_is_advisory():
    data = {
        "video": {"duration_seconds": 15.0},
        "editing_rhythm": {"detected_cut_times_seconds": [5.0, 10.0],
                           "pacing": "slow", "mean_shot_seconds": 5.0},
        "semantic_vision": {"frame_observations": [
            {"time_seconds": 6.983, "error": None, "predictions": [
                {"label": "split_screen", "confidence_uncalibrated": 0.9,
                 "evidence": "Upper graphics and lower presenter",
                 "frame_time_seconds": 6.983, "provenance": "vision_model_unreviewed"},
                {"label": "presenter", "confidence_uncalibrated": 0.8,
                 "evidence": "Person visible in lower section",
                 "frame_time_seconds": 6.983, "provenance": "vision_model_unreviewed"},
                {"label": "transition", "confidence_uncalibrated": 0.9,
                 "evidence": "Unsupported single-frame motion",
                 "frame_time_seconds": 6.983, "provenance": "vision_model_unreviewed"},
            ]}]},
    }
    result = make_reference_blueprint(data)
    assert result["observed"]["label_observation_counts"]["split_screen"] == 1
    assert result["observed"]["label_observation_counts"]["presenter"] == 1
    assert result["observed"]["label_observation_counts"].get("transition", 0) == 0
    assert "split_screen" in result["observed"]["shot_intervals"][1]["observed_labels"]
    assert result["diagnostics"]["accepted_static_observation_count"] == 2
    assert any(x["technique"] == "presenter_with_supporting_visual"
               for x in result["recommended"]["advisory_editing_preferences"])
    assert result["quality_gate"]["automatic_application_allowed"] is False
