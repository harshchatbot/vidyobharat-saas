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
    assert validated.schema_version == "2.0"
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


def test_v2_report_flags_speech_silence_disagreement(monkeypatch, tmp_path):
    monkeypatch.delenv("RANGMANCH_YUNET_MODEL_PATH", raising=False)
    monkeypatch.setattr(analysis, "probe_video", lambda path, media_id: analysis.MediaInfo(
        media_id=media_id, duration_seconds=8, width=1080, height=1920,
        fps=30, aspect_ratio="9:16", has_audio=True,
    ))
    # Starts within the word "Have" and conflicts with its timing.
    monkeypatch.setattr(analysis, "measure_silences", lambda path, duration: [
        Interval(start=0, end=0.95),
        Interval(start=3.0, end=4.0),
    ])
    monkeypatch.setattr(analysis, "scene_changes", lambda path, duration: [])
    transcript = {"language": "en", "words": [
        {"start": 0.53, "end": 1.05, "text": "Have"},
        {"start": 1.06, "end": 1.30, "text": "you"},
        {"start": 1.30, "end": 1.60, "text": "wondered?"},
        {"start": 2.0, "end": 2.25, "text": "Next"},
        {"start": 2.25, "end": 2.60, "text": "part."},
        {"start": 4.40, "end": 4.80, "text": "Another"},
        {"start": 4.80, "end": 5.10, "text": "part."},
    ]}
    report = analysis.build_video_analysis_report(
        tmp_path / "test.mp4", "testid", transcript=transcript,
    )
    assert report.schema_version == "2.0"
    assert report.audio.timing_quality.status == "review_required"
    assert report.audio.timing_quality.conflict_count == 1
    assert report.audio.timing_quality.conflicts[0].word_text == "Have"
    assert report.speech.segments[0].text == "Have you wondered?"
    assert report.speech.segments[0].timing_status == "review"
    assert report.audio.safe_cut_candidates == []
    assert any("conflicts" in warning for warning in report.warnings)


def test_safe_cut_candidate_requires_padding_and_two_sided_speech():
    from app.services.video_analysis_timing import safe_cut_candidates
    words = [Word(start=0.1, end=0.8, text="Hello"),
             Word(start=2.4, end=2.9, text="world.")]
    cuts = safe_cut_candidates([Interval(start=1.0, end=2.0)], words, [], 3.0)
    assert len(cuts) == 1
    assert cuts[0].remove_start == 1.15
    assert cuts[0].remove_end == 1.85
    assert cuts[0].anchor_time == 1.5
    assert safe_cut_candidates([Interval(start=0, end=1.0)], words, [], 3.0) == []


def test_word_timing_conflicts_do_not_rewrite_original_transcript():
    from app.services.video_analysis_timing import timing_conflicts, semantic_segments
    words = [Word(start=0.4, end=1.2, text="Have"),
             Word(start=1.3, end=1.8, text="you?")]
    before = [word.model_dump() for word in words]
    conflicts = timing_conflicts(words, [Interval(start=0, end=0.9)])
    assert len(conflicts) == 1
    assert semantic_segments(words, conflicts)[0].timing_status == "review"
    assert [word.model_dump() for word in words] == before


def test_no_audio_does_not_offer_cut_candidates(monkeypatch, tmp_path):
    monkeypatch.delenv("RANGMANCH_YUNET_MODEL_PATH", raising=False)
    monkeypatch.setattr(analysis, "probe_video", lambda path, media_id: analysis.MediaInfo(
        media_id=media_id, duration_seconds=4, width=1080, height=1920,
        fps=30, aspect_ratio="9:16", has_audio=False,
    ))
    monkeypatch.setattr(analysis, "scene_changes", lambda path, duration: [])
    report = analysis.build_video_analysis_report(tmp_path / "test.mp4", "testid")
    assert report.audio.status == "no_audio"
    assert report.speech.status == "no_speech"
    assert report.audio.safe_cut_candidates == []
    assert report.audio.timing_quality.status == "unavailable"
