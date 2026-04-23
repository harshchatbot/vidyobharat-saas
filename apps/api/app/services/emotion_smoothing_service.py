from __future__ import annotations

from typing import Any


def blend_emotions(prev: str, current: str, next_: str) -> str:
    prev_norm = str(prev or "").strip().lower() or "neutral"
    current_norm = str(current or "").strip().lower() or "neutral"
    next_norm = str(next_ or "").strip().lower() or "neutral"

    if current_norm == prev_norm:
        return current_norm
    if current_norm != prev_norm and current_norm != next_norm:
        return f"transition_{current_norm}"
    return current_norm


def blend_motion(prev_motion: str, current_motion: str) -> str:
    prev_norm = str(prev_motion or "").strip().lower() or "micro_tilt"
    current_norm = str(current_motion or "").strip().lower() or "micro_tilt"

    if prev_norm == current_norm:
        return current_norm
    if "slow_shift" in {prev_norm, current_norm}:
        return "slow_shift"
    if {prev_norm, current_norm} == {"slight_nod", "micro_tilt"}:
        return "micro_tilt"
    return current_norm


def _resolve_transition_type(prev: str, current: str, next_: str, smoothed: str) -> str:
    prev_norm = str(prev or "").strip().lower() or "neutral"
    current_norm = str(current or "").strip().lower() or "neutral"
    next_norm = str(next_ or "").strip().lower() or "neutral"
    smoothed_norm = str(smoothed or "").strip().lower() or current_norm

    if smoothed_norm.startswith("transition_"):
        return "blended_transition"
    if current_norm == prev_norm == next_norm:
        return "steady"
    if current_norm != prev_norm and current_norm == next_norm:
        return "arriving"
    if current_norm == prev_norm and current_norm != next_norm:
        return "departing"
    return "steady"


def smooth_emotions(timeline: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not timeline:
        return []

    smoothed: list[dict[str, Any]] = []
    for index, current in enumerate(timeline):
        previous = timeline[index - 1] if index > 0 else current
        upcoming = timeline[index + 1] if index < len(timeline) - 1 else current

        prev_emotion = str(previous.get("emotion") or "neutral")
        current_emotion = str(current.get("emotion") or "neutral")
        next_emotion = str(upcoming.get("emotion") or "neutral")
        smoothed_emotion = blend_emotions(prev_emotion, current_emotion, next_emotion)

        prev_motion = str(previous.get("head_motion") or "micro_tilt")
        current_motion = str(current.get("head_motion") or "micro_tilt")
        smoothed_motion = blend_motion(prev_motion, current_motion)

        start_ms = int(current.get("start") or 0)
        end_ms = int(current.get("end") or start_ms)
        midpoint_ms = start_ms + max(0, ((end_ms - start_ms) // 2))

        entry = {
            **current,
            "smoothed_emotion": smoothed_emotion,
            "transition_type": _resolve_transition_type(prev_emotion, current_emotion, next_emotion, smoothed_emotion),
            "smoothed_head_motion": smoothed_motion,
            "micro_timing": {
                "start": start_ms,
                "mid": midpoint_ms,
                "end": end_ms,
            },
            "micro_states": {
                "start_emotion": prev_emotion,
                "mid_emotion": smoothed_emotion,
                "end_emotion": next_emotion,
            },
        }
        smoothed.append(entry)

    return smoothed
