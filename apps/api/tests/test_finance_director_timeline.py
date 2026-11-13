"""Regression checks for the finance Creative Director handoff."""
from __future__ import annotations

import pytest

from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v2 import SceneBeat, ScenePlanV2
from scripts.compile_finance_v21_timeline import compile_finance_timeline


def _context() -> CreativeContext:
    return CreativeContext.model_validate({
        "media": {"duration_seconds": 4.0, "aspect_ratio": "9:16",
                  "language": "en", "style": "energetic"},
        "phrases": [
            {"id": "phrase_001", "segment_id": "seg1", "start": .2,
             "end": 1.5, "text": "Save your money",
             "timing_status": "estimated"},
            {"id": "phrase_002", "segment_id": "seg2", "start": 1.7,
             "end": 3.8, "text": "Build your savings",
             "timing_status": "estimated"},
        ],
        "caption_zones": [], "zoom_zones": [], "approved_cuts": [],
        "review_required": True, "allowed_actions": [],
    })


def _plan() -> dict:
    return ScenePlanV2(
        creative_thesis="Two simple finance principles explained visually",
        scenes=[
            SceneBeat(
                first_phrase_id="phrase_001", last_phrase_id="phrase_002",
                visual_mode="graphic_overlay", motion_template="keyword_card",
                creative_intent="Emphasize the source-spoken savings advice",
                sound_cue="none",
            ),
        ],
    ).model_dump(mode="json")


def test_finance_bridge_preserves_speech_and_creates_graphics() -> None:
    timeline = compile_finance_timeline(
        _context(), _plan(), director_mode="creative_director_v2_openai",
    )
    assert timeline["ai_directed"] is True
    assert timeline["render_complete"] is False
    assert timeline["source_audio_uninterrupted"] is True
    assert len(timeline["scenes"]) == 1
    assert timeline["scenes"][0]["visual"] == "procedural_graphic"
    graphics = [b for b in timeline["visual_instructions"]
                if b["kind"] == "motion_graphic"]
    assert [g["text"] for g in graphics] == ["Save your money", "Build your savings"]
    assert all(g["status"] == "pending_renderer_execution" for g in graphics)


def test_finance_bridge_discloses_fallback() -> None:
    timeline = compile_finance_timeline(
        _context(), _plan(), director_mode="provided_validated_v2_plan",
    )
    assert timeline["ai_directed"] is False


def test_finance_bridge_rejects_uncovered_phrases() -> None:
    broken = _plan()
    broken["scenes"][0]["last_phrase_id"] = "phrase_001"
    with pytest.raises(ValueError, match="omits"):
        compile_finance_timeline(
            _context(), broken, director_mode="creative_director_v2_openai",
        )
