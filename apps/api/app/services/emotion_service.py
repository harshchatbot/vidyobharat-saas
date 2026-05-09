from __future__ import annotations

from typing import Any

from app.services.emotion_smoothing_service import smooth_emotions


def detect_emotion(line: str) -> str:
    normalized = str(line or "").lower()
    if (
        "!" in normalized
        or "amazing" in normalized
        or "love" in normalized
        or "wow" in normalized
        or "वाह" in normalized
        or "कमाल" in normalized
    ):
        return "excited"
    if (
        "problem" in normalized
        or "struggle" in normalized
        or "issue" in normalized
        or "समस्या" in normalized
        or "परेशान" in normalized
    ):
        return "serious"
    if (
        "you should" in normalized
        or "try this" in normalized
        or "must try" in normalized
        or "ज़रूर" in normalized
        or "आज ही" in normalized
    ):
        return "confident"
    return "neutral"


def map_expression(emotion: str) -> dict[str, float]:
    return {
        "excited": {"smile": 0.8, "eyebrow_raise": 0.6},
        "serious": {"smile": 0.1, "eye_focus": 0.9},
        "confident": {"smile": 0.5, "head_tilt": 0.3},
        "transition_excited": {"smile": 0.6, "eyebrow_raise": 0.4},
        "transition_serious": {"smile": 0.3, "eye_focus": 0.7},
        "transition_confident": {"smile": 0.4, "head_tilt": 0.2},
        "neutral": {"smile": 0.3},
    }.get(str(emotion or "").strip().lower(), {})


def get_head_motion(segment_duration: int) -> str:
    if int(segment_duration or 0) < 1500:
        return "slight_nod"
    if int(segment_duration or 0) < 3000:
        return "micro_tilt"
    return "slow_shift"


def build_behavior_timeline(segments: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not segments:
        return []

    timeline: list[dict[str, Any]] = []
    for segment in segments:
        emotion = detect_emotion(str(segment.get("text") or ""))
        expression = map_expression(emotion)
        motion = get_head_motion(int(segment.get("duration_ms") or 0))
        timeline.append(
            {
                "start": int(segment.get("start_ms") or 0),
                "end": int(segment.get("end_ms") or 0),
                "emotion": emotion,
                "expression": expression,
                "head_motion": motion,
                "text": str(segment.get("text") or ""),
                "duration_ms": int(segment.get("duration_ms") or 0),
            }
        )
    smoothed_timeline = smooth_emotions(timeline)
    for entry in smoothed_timeline:
        entry["expression"] = map_expression(str(entry.get("smoothed_emotion") or entry.get("emotion") or "neutral"))
    return smoothed_timeline
