"""Unit tests: report is truthful and structurally safe even without optional models."""
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.video_analysis import BoundingBox, Interval, VideoAnalysisReport, Word
from app.services import video_analysis_service as analysis


def test_interval_and_face_box_validation():
    with pytest.raises(ValidationError):
        Interval(start=5, end=4)
    with pytest.raises(ValidationError):
        BoundingBox(x=0.8, y=0.1, width=0.4, height=0.2)


def test_silence_parser_handles_open_ended_silence():
    log = """
[silencedetect] silence_start: 1.2
[silencedetect] silence_end: 2.6 | silence_duration: 1.4
[silencedetect] silence_start: 4.2
"""
    result = analysis.parse_silence_log(log, 5)
    assert [(x.start, x.end) for x in result] == [(1.2, 2.6), (4.2, 5.0)]


def test_pause_evidence_is_distinct_from_measured_silence():
    words = [Word(start=0.5, end=0.9, text="Hello"), Word(start=2, end=2.3, text="world")]
    pauses = analysis.speech_pauses(words, 3)
    assert [(p.start, p.end) for p in pauses] == [(0.9, 2.0), (2.3, 3.0)]


def test_report_no_face_model_is_explicit(monkeypatch, tmp_path):
    monkeypatch.delenv("RANGMANCH_YUNET_MODEL_PATH", raising=False)
    monkeypatch.setattr(analysis, "probe_video", lambda path, media_id: analysis.MediaInfo(
        media_id=media_id, duration_seconds=3, width=1080, height=1920,
        fps=30, aspect_ratio="9:16", has_audio=True,
    ))
    monkeypatch.setattr(analysis, "measure_silences", lambda path, duration: [Interval(start=1, end=2)])
    monkeypatch.setattr(analysis, "scene_changes", lambda path, duration: [1.5])
    report = analysis.build_video_analysis_report(
        tmp_path / "source.mp4", "testid", transcript={
            "language": "en", "words": [{"text": "hello", "start": 0.1, "end": 0.6}],
        },
    )
    validated = VideoAnalysisReport.model_validate_json(report.model_dump_json())
    assert validated.schema_version == "1.0"
    assert validated.speech.status == "complete"
    assert validated.visual.face_status == "unavailable"
    assert validated.visual.face_samples == []
    assert validated.visual.scene_changes_seconds == [1.5]
    assert validated.audio.silence_intervals[0].start == 1
    assert validated.editing.selected_style == "elegant"
    assert len(validated.editing.supported_effects) > 3


def test_invalid_transcript_rejected():
    with pytest.raises(ValueError):
        analysis.normalize_transcript({"words": [{"start": -1, "end": 2, "text": "bad"}]}, 10)
