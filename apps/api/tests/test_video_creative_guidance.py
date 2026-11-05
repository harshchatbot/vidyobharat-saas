"""Face-aware guidance is conservative and never authorizes automatic edits."""
from app.schemas.video_analysis import BoundingBox, FaceSample, SpeechSegment
from app.services.video_creative_guidance import build_creative_guidance


def _segment():
    return SpeechSegment(
        id="seg_001", start=0.5, end=3.5, text="Hello there!",
        word_start_index=0, word_end_index=1, timing_status="estimated",
    )


def _face(x=0.22, y=0.39, w=0.49, h=0.38):
    return FaceSample(
        time=1.0, confidence=0.94,
        box=BoundingBox(x=x, y=y, width=w, height=h),
    )


def test_face_centered_low_uses_top_caption_lane():
    guidance = build_creative_guidance([_segment()], [_face()], "complete")
    assert guidance.auto_apply is False
    caption = guidance.caption_placements[0]
    assert caption.status == "suggested"
    assert caption.y == 0.19
    assert caption.face_sample_count == 1
    assert guidance.zoom_framing[0].status == "suggested"
    assert guidance.zoom_framing[0].max_scale == 1.06


def test_top_face_uses_bottom_caption_lane():
    guidance = build_creative_guidance(
        [_segment()], [_face(y=0.12, h=0.22)], "complete",
    )
    assert guidance.caption_placements[0].status == "suggested"
    assert guidance.caption_placements[0].y == 0.78


def test_obscured_lanes_require_review():
    guidance = build_creative_guidance(
        [_segment()], [_face(y=0.06, h=0.90)], "complete",
    )
    assert guidance.caption_placements[0].status == "review_required"
    assert guidance.zoom_framing[0].status == "review_required"


def test_no_face_samples_do_not_create_fake_safe_positions():
    guidance = build_creative_guidance([_segment()], [], "unavailable")
    assert guidance.caption_placements[0].status == "review_required"
    assert guidance.caption_placements[0].face_sample_count == 0
    assert guidance.zoom_framing[0].max_scale == 1
