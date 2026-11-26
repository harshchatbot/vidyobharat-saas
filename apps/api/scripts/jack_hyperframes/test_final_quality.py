from pathlib import Path

import pytest

from final_quality import FinalQualityConfigurationError, _apply, _propose, _validate


def plan(tmp_path):
    video = tmp_path / "review.mp4"
    video.write_bytes(b"encoded fixture")
    return {"schema_version": 1, "source_video": str(video),
            "expected_duration_seconds": 30.0, "audio_mastering": {"gain_db": 0}}


def test_final_gate_proposes_only_safe_audio_remaster(tmp_path):
    candidate = plan(tmp_path)
    operations = _propose(candidate, [{"category": "audio_loudness"}, {"category": "audio_peak"}])
    updated, applied = _apply(candidate, operations)
    _validate(updated)
    assert applied[0]["operation"] == "remaster_audio"
    assert updated["audio_mastering"]["loudnorm"]["integrated_lufs"] == -14


def test_final_gate_fails_closed_for_visual_defects(tmp_path):
    candidate = plan(tmp_path)
    assert _propose(candidate, [{"category": "text_safe_area"}]) == []
    with pytest.raises(FinalQualityConfigurationError):
        _apply(candidate, [{"operation": "set_camera"}])


def test_final_gate_rejects_mutable_or_unbounded_plan(tmp_path):
    candidate = plan(tmp_path)
    candidate["audio_mastering"] = {"gain_db": 13}
    with pytest.raises(FinalQualityConfigurationError):
        _validate(candidate)
