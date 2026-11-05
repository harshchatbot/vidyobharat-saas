"""Optional Whisper forced-alignment validation and evidence-only integration."""
from pathlib import Path

from app.schemas.video_analysis import Interval, MediaInfo, Word
from app.services.video_whisper_alignment import validate_alignment
from app.services import video_analysis_service as analysis


def _words():
    return [Word(start=0.5, end=0.9, text="Hello"),
            Word(start=1.2, end=1.6, text="world!")]


def test_alignment_accepts_same_text_and_plausible_boundaries():
    original = _words()
    proposed = [Word(start=0.55, end=0.95, text="Hello"),
                Word(start=1.24, end=1.63, text="world!")]
    assert validate_alignment(original, proposed, 3) == (True, "validated_candidate")
    assert [w.start for w in original] == [0.5, 1.2]


def test_alignment_rejects_lexical_drift_large_shifts_and_missing_words():
    original = _words()
    assert validate_alignment(original, [original[0]], 3)[0] is False
    proposed = [Word(start=0.5, end=0.9, text="Goodbye"), original[1]]
    assert validate_alignment(original, proposed, 3) == (False, "token_mismatch")
    proposed = [Word(start=1.4, end=1.8, text="Hello"), original[1]]
    assert validate_alignment(original, proposed, 3)[0] is False


def test_compare_mode_preserves_original_words(monkeypatch, tmp_path):
    monkeypatch.setenv("RANGMANCH_WHISPER_ALIGNMENT_MODE", "compare")
    monkeypatch.delenv("RANGMANCH_YUNET_MODEL_PATH", raising=False)
    monkeypatch.setattr(analysis, "probe_video", lambda _path, media_id: MediaInfo(
        media_id=media_id, duration_seconds=3, width=1080, height=1920,
        fps=30, aspect_ratio="9:16", has_audio=True))
    monkeypatch.setattr(analysis, "measure_silences",
                        lambda _path, _duration, **kwargs: [Interval(start=2, end=2.8)])
    monkeypatch.setattr(analysis, "scene_changes", lambda _path, _duration: [])
    from app.services import video_whisper_alignment
    called = []
    def fake_align(path, words, language, duration):
        called.append((path, language, duration))
        return ([Word(start=0.55, end=0.95, text="Hello"),
                 Word(start=1.25, end=1.65, text="world!")], "validated_candidate", 0.1)
    monkeypatch.setattr(video_whisper_alignment, "forced_align", fake_align)
    report = analysis.build_video_analysis_report(
        tmp_path / "example.mp4", "test",
        transcript={"language": "en", "words": [w.model_dump() for w in _words()]},
    )
    assert len(called) == 1
    assert report.speech.alignment_status == "candidate_available"
    assert report.speech.words[0].start == 0.5
    assert report.speech.aligned_words_candidate[0].start == 0.55
    assert report.speech.alignment_notes


def test_default_mode_skips_optional_alignment(monkeypatch, tmp_path):
    monkeypatch.delenv("RANGMANCH_WHISPER_ALIGNMENT_MODE", raising=False)
    monkeypatch.delenv("RANGMANCH_YUNET_MODEL_PATH", raising=False)
    monkeypatch.setattr(analysis, "probe_video", lambda _path, media_id: MediaInfo(
        media_id=media_id, duration_seconds=3, width=1080, height=1920,
        fps=30, aspect_ratio="9:16", has_audio=False))
    monkeypatch.setattr(analysis, "scene_changes", lambda _path, _duration: [])
    report = analysis.build_video_analysis_report(tmp_path / "example.mp4", "test")
    assert report.speech.alignment_status == "not_requested"
    assert report.speech.aligned_words_candidate == []
