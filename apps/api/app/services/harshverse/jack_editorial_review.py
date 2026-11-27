"""JACK V0.5: conservative script editorial QA and scene direction.

This is a heuristic review aid, not factual verification or render authorization.
"""
from __future__ import annotations

import re

ABSOLUTE_CLAIMS = (
    r"\binstantly\b", r"\bno delays?\b", r"\bguaranteed\b",
    r"\balways\b", r"\bnever\b", r"\b100%\b",
)
GENERIC_VISUALS = {"screen_capture", "presenter", "presenter_or_title", "illustration_or_broll"}


def review_storyboard(storyboard: dict) -> dict:
    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("Storyboard requires scenes")
    issues = []
    directions = []
    for scene in scenes:
        narration = scene.get("narration", "")
        if not isinstance(narration, str):
            raise ValueError("Scene narration must be text")
        for pattern in ABSOLUTE_CLAIMS:
            for match in re.finditer(pattern, narration, flags=re.I):
                issues.append({
                    "scene_id": scene.get("id"),
                    "code": "absolute_claim_requires_review",
                    "phrase": match.group(0),
                    "severity": "review",
                })
        visual = scene.get("visual_intent")
        if visual in GENERIC_VISUALS:
            issues.append({
                "scene_id": scene.get("id"),
                "code": "visual_direction_too_generic",
                "severity": "review",
            })
        directions.append({
            "scene_id": scene.get("id"),
            "beat": scene.get("beat"),
            "existing_visual_intent": visual,
            "director_instruction": (
                "Specify exact screen action, source recording, and cursor/zoom emphasis."
                if visual == "screen_capture" else
                "Specify shot, on-screen text, transition, and approved visual asset."
            ),
            "assets_verified": False,
        })
    issues.append({
        "scene_id": None,
        "code": "timing_requires_audio_alignment",
        "severity": "review",
    })
    return {
        "schema_version": "jack-editorial-review/v0.5",
        "status": "requires_editorial_review",
        "issues": issues,
        "scene_directions": directions,
        "claims_verified": False,
        "render_ready": False,
    }
