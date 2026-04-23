from __future__ import annotations

from app.services.emotion_service import build_behavior_timeline, detect_emotion, get_head_motion, map_expression
from app.services.emotion_smoothing_service import blend_emotions, blend_motion, smooth_emotions


def test_detect_emotion_handles_basic_copy() -> None:
    assert detect_emotion("I love this product!") == "excited"
    assert detect_emotion("This problem was so annoying.") == "serious"
    assert detect_emotion("You should try this today.") == "confident"
    assert detect_emotion("Here is what I found.") == "neutral"


def test_map_expression_returns_expected_cues() -> None:
    assert map_expression("excited")["smile"] == 0.8
    assert map_expression("serious")["eye_focus"] == 0.9
    assert map_expression("transition_excited")["smile"] == 0.6
    assert map_expression("neutral")["smile"] == 0.3


def test_get_head_motion_varies_by_duration() -> None:
    assert get_head_motion(1200) == "slight_nod"
    assert get_head_motion(2200) == "micro_tilt"
    assert get_head_motion(3600) == "slow_shift"


def test_build_behavior_timeline_uses_segment_timing() -> None:
    timeline = build_behavior_timeline(
        [
            {"text": "Here is what I found.", "start_ms": 0, "end_ms": 1200, "duration_ms": 1200},
            {"text": "I love this!", "start_ms": 1400, "end_ms": 3200, "duration_ms": 1800},
            {"text": "You should try this.", "start_ms": 3400, "end_ms": 5200, "duration_ms": 1800},
        ]
    )
    assert timeline[0]["emotion"] == "neutral"
    assert timeline[0]["head_motion"] == "slight_nod"
    assert timeline[1]["emotion"] == "excited"
    assert timeline[1]["head_motion"] == "micro_tilt"
    assert timeline[1]["smoothed_emotion"] == "transition_excited"
    assert timeline[1]["transition_type"] == "blended_transition"
    assert timeline[1]["micro_timing"]["mid"] == 2300
    assert timeline[1]["micro_states"]["start_emotion"] == "neutral"
    assert timeline[1]["micro_states"]["end_emotion"] == "confident"
    assert timeline[1]["expression"]["smile"] == 0.6


def test_smoothing_service_blends_emotions_and_motion() -> None:
    base_timeline = [
        {"start": 0, "end": 1000, "emotion": "neutral", "head_motion": "slight_nod"},
        {"start": 1000, "end": 2400, "emotion": "excited", "head_motion": "micro_tilt"},
        {"start": 2400, "end": 4200, "emotion": "confident", "head_motion": "slow_shift"},
    ]
    smoothed = smooth_emotions(base_timeline)
    assert smoothed[1]["smoothed_emotion"] == "transition_excited"
    assert smoothed[1]["smoothed_head_motion"] == "micro_tilt"
    assert smoothed[2]["smoothed_head_motion"] == "slow_shift"
    assert smoothed[1]["micro_timing"]["start"] == 1000
    assert smoothed[1]["micro_timing"]["end"] == 2400


def test_blend_helpers_keep_transitions_subtle() -> None:
    assert blend_emotions("neutral", "excited", "confident") == "transition_excited"
    assert blend_emotions("excited", "excited", "confident") == "excited"
    assert blend_motion("slight_nod", "micro_tilt") == "micro_tilt"
    assert blend_motion("micro_tilt", "slow_shift") == "slow_shift"
