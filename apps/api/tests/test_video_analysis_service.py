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
    monkeypatch.setattr(analysis, "measure_silences", lambda path, duration, **kwargs: [Interval(start=1, end=2)])
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
    assert validated.creative_guidance.auto_apply is False
    assert validated.creative_guidance.caption_placements[0].status == 'review_required'
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
    monkeypatch.setattr(analysis, "measure_silences", lambda path, duration, **kwargs: [
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
    # The conflicted opening is excluded; independent mid-recording silence is valid.
    assert len(report.audio.safe_cut_candidates) == 1
    assert report.audio.safe_cut_candidates[0].source_silence.start == 3.0
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


def test_segmenter_avoids_artificial_twenty_word_split():
    from app.services.video_analysis_timing import semantic_segments
    # Earlier V2 broke off "books and" simply because it reached 20 words.
    texts = ["Well", "here's", "the", "interesting", "part", "ChatGPT",
             "doesn't", "think", "exactly", "like", "a", "human", "it",
             "learns", "patterns", "from", "enormous", "amounts", "of",
             "books", "and", "from", "different", "sources", "of", "information."]
    words = [Word(text=text, start=i * 0.20, end=i * 0.20 + 0.18)
             for i, text in enumerate(texts)]
    grouped = semantic_segments(words, [])
    assert len(grouped) == 1
    assert grouped[0].word_end_index == len(words) - 1
    assert grouped[0].text.endswith("books and from different sources of information.")


def test_native_utterances_are_hints_without_stranding_connectors():
    from app.services.video_analysis_timing import semantic_segments
    words = [
        Word(text=text, start=i * 0.20, end=i * 0.20 + 0.18)
        for i, text in enumerate(["Well", "here's", "the", "interesting", "part",
                                   "ChatGPT", "doesn't", "think", "like", "us."])
    ]
    native = [
        {"word_start_index": 0, "word_end_index": 4},
        {"word_start_index": 5, "word_end_index": 9},
    ]
    grouped = semantic_segments(words, [], native)
    assert [s.text for s in grouped] == [
        "Well here's the interesting part",
        "ChatGPT doesn't think like us.",
    ]

    dangling = [
        {"word_start_index": 0, "word_end_index": 5},
        {"word_start_index": 6, "word_end_index": 9},
    ]
    grouped = semantic_segments(words, [], dangling)
    # A native model split after 'ChatGPT' is allowed but never a hard cut.
    assert all(segment.word_end_index >= segment.word_start_index for segment in grouped)


def test_invalid_native_boundaries_cannot_corrupt_word_indices():
    from app.services.video_analysis_timing import semantic_segments
    words = [Word(text="Hello", start=0, end=0.2),
             Word(text="world.", start=0.2, end=0.5)]
    for hints in ([{"word_start_index": 3, "word_end_index": 900}],
                  [{"word_start_index": True, "word_end_index": 1}],
                  [{"word_start_index": 1, "word_end_index": 0}]):
        grouped = semantic_segments(words, [], hints)
        assert grouped[0].word_start_index == 0
        assert grouped[-1].word_end_index == 1


def test_analysis_cache_is_bounded_isolated_and_returns_copies(monkeypatch):
    from app.api.routers import editor_routes
    import time
    with editor_routes._analysis_cache_lock:
        editor_routes._analysis_cache.clear()
    key = ("guest/a/media-file", 100, "elegant", "v2-utterance-20261105")
    different = ("guest/b/media-file", 100, "elegant", "v2-utterance-20261105")
    editor_routes._store_analysis_cache(key, {"warnings": ["first"]})
    saved = editor_routes._analysis_from_cache(key)
    assert saved == {"warnings": ["first"]}
    saved["warnings"].append("mutated")
    assert editor_routes._analysis_from_cache(key) == {"warnings": ["first"]}
    assert editor_routes._analysis_from_cache(different) is None
    with editor_routes._analysis_cache_lock:
        editor_routes._analysis_cache[key] = (time.monotonic() - 1, {"warnings": []})
    assert editor_routes._analysis_from_cache(key) is None
    with editor_routes._analysis_cache_lock:
        editor_routes._analysis_cache.clear()


def test_strong_silence_must_confirm_removable_gap():
    from app.services.video_analysis_timing import safe_cut_candidates
    words = [Word(start=0.1, end=0.8, text="Hello"),
             Word(start=2.4, end=2.9, text="world.")]
    weak = [Interval(start=1.0, end=2.0)]
    assert safe_cut_candidates(weak, words, [], 3.0,
                               strict_silences=[Interval(start=1.35, end=1.65)]) == []
    good = safe_cut_candidates(weak, words, [], 3.0,
                               strict_silences=[Interval(start=1.0, end=2.0)])
    assert len(good) == 1
    assert good[0].remove_start == 1.15
    assert good[0].remove_end == 1.85


def test_disputed_word_boundary_excludes_cut_near_conflict():
    from app.services.video_analysis_timing import safe_cut_candidates, timing_conflicts
    words = [Word(start=0.0, end=0.7, text="Hello"),
             Word(start=1.8, end=2.3, text="world")]
    silence = [Interval(start=0.8, end=1.65)]
    # The detector also calls the next word 'silent' nearby. Do not trust
    # a neat-looking word gap if adjacent timestamps contradict audio.
    conflict = timing_conflicts(words, [Interval(start=1.75, end=2.0)])
    assert conflict
    assert safe_cut_candidates(silence, words, conflict, 3.0,
                               strict_silences=silence) == []


def test_media_stream_delete_race_is_handled_after_headers(caplog):
    from app.api.routers.editor_routes import _stream_media_until_unavailable
    from app.services.guest_media_storage import GuestMediaObjectMissing
    import logging

    caplog.set_level(logging.INFO)
    def stream():
        yield b"second"
        raise GuestMediaObjectMissing("deleted-while-streaming")

    assert list(_stream_media_until_unavailable(b"first", stream(), "test-media")) == [
        b"first", b"second",
    ]
    assert "editor_media_stream_source_removed" in caplog.text



def test_yunet_sampling_resizes_and_normalizes_face(monkeypatch, tmp_path):
    """Portrait input scales to 360x640 while resulting boxes remain 0..1."""
    import sys
    from types import SimpleNamespace

    model = tmp_path / "yunet.onnx"
    model.write_bytes(b"fixture-model-path")
    monkeypatch.setenv("RANGMANCH_YUNET_MODEL_PATH", str(model))
    calls = {"seek": [], "sizes": [], "released": False}

    class Frame:
        shape = (1920, 1080, 3)

    class Resized:
        shape = (640, 360, 3)

    class Capture:
        def isOpened(self):
            return True
        def set(self, _property, time_ms):
            calls["seek"].append(time_ms)
        def read(self):
            return True, Frame()
        def release(self):
            calls["released"] = True

    class Detector:
        def setInputSize(self, size):
            calls["sizes"].append(size)
        def detect(self, _frame):
            # Box at x=90,y=160,width=180,height=320 on 360x640.
            return None, [[90, 160, 180, 320, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99]]

    fake_cv2 = SimpleNamespace(
        FaceDetectorYN_create=lambda *_args: Detector(),
        VideoCapture=lambda _path: Capture(),
        CAP_PROP_POS_MSEC=0,
        INTER_AREA=3,
        resize=lambda _frame, _size, interpolation: Resized(),
    )
    monkeypatch.setitem(sys.modules, "cv2", fake_cv2)
    status, samples = analysis.detect_faces(tmp_path / "video.mp4", 2.1)

    assert status == "complete"
    assert calls["seek"] == [0, 1000, 2000]
    assert calls["sizes"] == [(360, 640)] * 3
    assert calls["released"]
    assert len(samples) == 3
    assert samples[0].box.x == pytest.approx(0.25)
    assert samples[0].box.y == pytest.approx(0.25)
    assert samples[0].box.width == pytest.approx(0.5)
    assert samples[0].box.height == pytest.approx(0.5)


def test_yunet_no_detection_is_not_unavailable(monkeypatch, tmp_path):
    import sys
    from types import SimpleNamespace

    model = tmp_path / "yunet.onnx"
    model.write_bytes(b"fixture")
    monkeypatch.setenv("RANGMANCH_YUNET_MODEL_PATH", str(model))

    class Capture:
        def isOpened(self):
            return True
        def set(self, *_args):
            pass
        def read(self):
            return True, SimpleNamespace(shape=(320, 240, 3))
        def release(self):
            pass

    class Detector:
        def setInputSize(self, _size):
            pass
        def detect(self, _frame):
            return None, None

    fake_cv2 = SimpleNamespace(
        FaceDetectorYN_create=lambda *_args: Detector(),
        VideoCapture=lambda _path: Capture(),
        CAP_PROP_POS_MSEC=0,
    )
    monkeypatch.setitem(sys.modules, "cv2", fake_cv2)
    status, samples = analysis.detect_faces(tmp_path / "video.mp4", 2)
    assert (status, samples) == ("no_faces", [])
