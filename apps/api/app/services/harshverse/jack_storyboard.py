"""JACK V0.2: format-aware, review-only production storyboard.

This compiler consumes an explicitly supplied script. It does not hallucinate
research, generate speech, retrieve assets, or authorize video exports.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

from app.services.harshverse.jack_content_engine import ContentRequest, build_content_brief


@dataclass(frozen=True)
class ScriptBeat:
    kind: str
    narration: str


BEAT_KINDS = ("hook", "value", "takeaway", "cta")
MODE_VISUALS = {
    "talking_head": ("presenter", "presenter_with_graphic", "presenter", "presenter"),
    "faceless": ("title_card", "illustration_or_broll", "kinetic_text", "end_card"),
    "screen_demo": ("presenter_or_title", "screen_capture", "screen_capture", "end_card"),
}
MODE_REQUIRED_MEDIA = {
    "talking_head": ("presenter_video",),
    "faceless": ("approved_voice_track", "licensed_visual_assets"),
    "screen_demo": ("screen_recording", "approved_voice_track"),
}


def compile_storyboard(request: ContentRequest, beats: list[ScriptBeat]) -> dict:
    brief = build_content_brief(request)
    if len(beats) != 4 or tuple(b.kind for b in beats) != BEAT_KINDS:
        raise ValueError("Script requires exactly hook, value, takeaway, cta in order")
    if any(not isinstance(b.narration, str) or not b.narration.strip()
           or len(b.narration) > 2000 for b in beats):
        raise ValueError("Every script beat must have 1..2000 characters")
    # Allocate timing proportionally by word count, preserving complete duration.
    counts = [max(1, len(re.findall(r"\S+", b.narration))) for b in beats]
    total = sum(counts)
    # This is a planning estimate, not forced subtitle/audio timestamps.
    cursor = 0
    scenes = []
    for i, beat in enumerate(beats):
        end = request.duration_seconds if i == 3 else round(
            request.duration_seconds * sum(counts[:i + 1]) / total, 3)
        scenes.append({
            "id": f"jack_scene_{i + 1:03d}",
            "beat": beat.kind,
            "narration": beat.narration.strip(),
            "estimated_start_seconds": cursor,
            "estimated_end_seconds": end,
            "visual_intent": MODE_VISUALS[request.format][i],
            "media_status": "unresolved",
            "requires_review": True,
        })
        cursor = end
    return {
        "schema_version": "jack-storyboard/v0.2",
        "status": "review_only",
        "format": request.format,
        "platform": request.platform,
        "language": request.language,
        "brief": brief,
        "scenes": scenes,
        "required_media": list(MODE_REQUIRED_MEDIA[request.format]),
        "safety": {
            "estimated_timestamps_only": True,
            "narration_is_user_supplied": True,
            "assets_resolved": False,
            "speech_generated": False,
            "render_ready": False,
            "publish_authorized": False,
        },
    }
