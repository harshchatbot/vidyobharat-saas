"""JACK Content Engine V0.1: deterministic, review-only content production brief.

No external research, model calls, publishing, rendering, or fabricated facts.
The existing Creative Director and renderer remain separate downstream stages.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import re

Platform = Literal["youtube_shorts", "instagram_reels", "linkedin_video"]
Format = Literal["talking_head", "faceless", "screen_demo"]


@dataclass(frozen=True)
class ContentRequest:
    topic: str
    audience: str
    goal: str
    platform: Platform = "youtube_shorts"
    format: Format = "talking_head"
    language: str = "en"
    duration_seconds: int = 45


def build_content_brief(request: ContentRequest) -> dict:
    """Create an editable brief, not a supposedly researched or publishable script."""
    for key in ("topic", "audience", "goal", "language"):
        value = getattr(request, key)
        if not isinstance(value, str) or not value.strip() or len(value) > 500:
            raise ValueError(f"{key} must contain 1..500 characters")
    if request.platform not in ("youtube_shorts", "instagram_reels", "linkedin_video"):
        raise ValueError("Unsupported platform")
    if request.format not in ("talking_head", "faceless", "screen_demo"):
        raise ValueError("Unsupported content format")
    if type(request.duration_seconds) is not int or not 15 <= request.duration_seconds <= 180:
        raise ValueError("duration_seconds must be 15..180")
    topic = re.sub(r"\s+", " ", request.topic).strip()
    audience = re.sub(r"\s+", " ", request.audience).strip()
    goal = re.sub(r"\s+", " ", request.goal).strip()
    return {
        "schema_version": "jack-content-brief/v0.1",
        "status": "review_only",
        "input": asdict(request),
        "creative_brief": {
            "working_title": topic[:100],
            "target_audience": audience,
            "viewer_outcome": goal,
            "hook_direction": f"Introduce the central question about {topic} for {audience}.",
            "story_structure": [
                {"beat": "hook", "purpose": "Establish the viewer's problem or curiosity"},
                {"beat": "value", "purpose": "Explain or demonstrate only verified information"},
                {"beat": "takeaway", "purpose": "Summarize the actionable lesson"},
                {"beat": "cta", "purpose": "Invite a relevant next action without unsupported claims"},
            ],
            "production_format": request.format,
            "distribution_platform": request.platform,
        },
        "pipeline": [
            {"stage": "research", "status": "requires_verified_sources"},
            {"stage": "script", "status": "awaiting_research_and_review"},
            {"stage": "creative_director", "status": "not_started"},
            {"stage": "asset_resolution", "status": "not_started"},
            {"stage": "render", "status": "not_started"},
            {"stage": "quality_review", "status": "not_started"},
            {"stage": "publish", "status": "manual_only"},
        ],
        "safety": {
            "claims_verified": False,
            "script_approved": False,
            "assets_licensed": False,
            "render_authorized": False,
            "publish_authorized": False,
        },
    }
