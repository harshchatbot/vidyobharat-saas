import copy

import pytest
from app.services.harshverse.reference_style_blueprint import (
    InvalidReferenceDNA, make_reference_blueprint,
)


def sample():
    return {
        "schema_version": "reference-dna/v0.2",
        "video": {"duration_seconds": 6},
        "editing_rhythm": {"detected_cut_times_seconds": [2, 4],
                           "pacing": "moderate", "mean_shot_seconds": 2},
        "temporal_vision": {"windows": [
            {"sampled_times_seconds": [0.5, 1.0, 1.5], "observations": [
                {"label": "presenter", "start_seconds": 0.5, "end_seconds": 1.5,
                 "evidence_times_seconds": [0.5, 1.0, 1.5],
                 "evidence": "A person faces the camera"}]},
            {"sampled_times_seconds": [2.5, 3.0, 3.5], "observations": [
                {"label": "slide", "start_seconds": 2.5, "end_seconds": 3.5,
                 "evidence_times_seconds": [2.5, 3.5], "evidence": "Slide changes"},
                {"label": "text_reveal", "start_seconds": 3.0, "end_seconds": 3.5,
                 "evidence_times_seconds": [3.0, 3.5], "evidence": "Text appears"}]},
        ]},
    }


def test_advisory_only():
    blueprint = make_reference_blueprint(sample())
    assert blueprint["quality_gate"]["automatic_application_allowed"] is False
    assert blueprint["recommended"]["copy_reference_assets"] is False


def test_observations_and_inference():
    blueprint = make_reference_blueprint(sample())
    assert blueprint["diagnostics"]["accepted_observation_count"] == 3
    assert len(blueprint["observed"]["shot_intervals"]) == 3
    assert blueprint["observed"]["label_observation_counts"]["text_reveal"] == 1
    assert any(x["hypothesis"] == "mixed_presenter_and_graphics"
               for x in blueprint["inferred"])


@pytest.mark.parametrize("duration", [0, -1, float("nan"), "6", True])
def test_invalid_duration(duration):
    data = sample()
    data["video"]["duration_seconds"] = duration
    with pytest.raises(InvalidReferenceDNA):
        make_reference_blueprint(data)


def test_reject_invalid_cut_order():
    data = sample()
    data["editing_rhythm"]["detected_cut_times_seconds"] = [4, 2]
    with pytest.raises(InvalidReferenceDNA):
        make_reference_blueprint(data)


def test_unknown_label_excluded():
    data = sample()
    data["temporal_vision"]["windows"][0]["observations"][0]["label"] = "run_untrusted_code"
    result = make_reference_blueprint(data)
    assert result["diagnostics"]["skipped_observations"]["unknown_label"] == 1


def test_bad_timestamp_excluded():
    data = sample()
    data["temporal_vision"]["windows"][0]["observations"][0]["end_seconds"] = 99
    result = make_reference_blueprint(data)
    assert result["diagnostics"]["skipped_observations"]["invalid_timing"] == 1


def test_motion_requires_multiple_frames():
    data = sample()
    observation = data["temporal_vision"]["windows"][1]["observations"][1]
    observation["evidence_times_seconds"] = [3.0]
    result = make_reference_blueprint(data)
    assert result["diagnostics"]["skipped_observations"]["motion_without_temporal_evidence"] == 1


def test_no_input_mutation():
    data = sample()
    original = copy.deepcopy(data)
    make_reference_blueprint(data)
    assert data == original


def test_empty_windows_produces_no_style_claims():
    data = sample()
    data["temporal_vision"]["windows"] = []
    result = make_reference_blueprint(data)
    assert result["observed"]["temporal_observations"] == []
    assert result["inferred"] == []
    assert result["quality_gate"]["automatic_application_allowed"] is False
