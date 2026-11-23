"""V0.14 read-only HarshVerse narration-to-module proposal planner.

No media mutation, network calls, or assumption of asset availability.
Reference style is advisory; spoken content is the only source for module meaning.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import math
import re

from app.services.video_creative_context import CreativeContext

APPROVED_MODULES = frozenset({
    "headline", "type_slam", "day_counter", "laptop_reveal",
    "lower_third", "before_after", "stat_chart",
})
# These are concrete source-grounded signals, not a semantic LLM.
_PATTERNS = {
    "day_counter": re.compile(r"\b(?:\d+\s*(?:days?|weeks?|months?)|day\s+\d+)\b", re.I),
    "stat_chart": re.compile(r"(?<!\w)(?:\d+(?:\.\d+)?\s*%|percent|percentage)(?!\w)", re.I),
    "before_after": re.compile(r"\b(?:before\s+(?:and\s+)?after|compared\s+to|versus|vs\.?|difference\s+between)\b", re.I),
    "laptop_reveal": re.compile(r"\b(?:website|web\s*app|dashboard|application\s+demo|screen\s+recording)\b", re.I),
}
# The generator intentionally does not invent money_stack: it is not yet an approved module.


@dataclass(frozen=True)
class SceneProposal:
    module: str
    phrase_id: str
    segment_id: str
    start_seconds: float
    end_seconds: float
    text_evidence: str
    reason: str
    review_required: bool = True


def _style_preferences(blueprint: dict | None) -> frozenset[str]:
    """Allow only known soft preferences from a structurally recognizable blueprint."""
    if not isinstance(blueprint, dict):
        return frozenset()
    if blueprint.get("schema_version") != "reference-style-blueprint/v0.13":
        return frozenset()
    gate = blueprint.get("quality_gate")
    if not isinstance(gate, dict) or gate.get("automatic_application_allowed") is not False:
        return frozenset()
    recommended = blueprint.get("recommended", {})
    if not isinstance(recommended, dict):
        return frozenset()
    items = recommended.get("advisory_editing_preferences", [])
    if not isinstance(items, list):
        return frozenset()
    return frozenset(
        item.get("technique") for item in items[:50]
        if isinstance(item, dict)
        and item.get("strength") == "soft_preference"
        and item.get("never_force") is True
        and item.get("technique") in {
            "alternate_presenter_and_explainer", "progressive_text_emphasis", "shot_pacing"
        }
    )


def propose_scene_plan(
    context: CreativeContext, *, reference_blueprint: dict | None = None,
    max_scenes: int = 5,
) -> dict:
    """Return review-only module suggestions with exact phrase-bound timestamps.

    A single phrase can lead to at most one animation proposal. Review-status
    phrases are skipped. Style guidance may prefer type_slam for an introduction
    but never creates an animation without a grounded narration phrase.
    """
    if type(max_scenes) is not int or not 0 <= max_scenes <= 10:
        raise ValueError("max_scenes must be 0..10")
    preferences = _style_preferences(reference_blueprint)
    suggestions: list[SceneProposal] = []
    skipped: list[dict[str, str]] = []
    phrases = sorted(context.phrases, key=lambda p: (p.start, p.id))
    duration = context.media.duration_seconds
    last_end = -1.0
    for index, phrase in enumerate(phrases):
        if len(suggestions) >= max_scenes:
            break
        if (phrase.timing_status != "estimated"
            or not math.isfinite(phrase.start) or not math.isfinite(phrase.end)
            or phrase.start < 0 or phrase.end <= phrase.start
            or phrase.end > duration + .01):
            skipped.append({"phrase_id": phrase.id, "reason": "timing_requires_review"})
            continue
        if phrase.start < last_end - .001:
            skipped.append({"phrase_id": phrase.id, "reason": "overlapping_phrase"})
            continue
        text = phrase.text.strip()
        if not text:
            continue
        chosen = next((key for key in ("stat_chart", "day_counter", "before_after", "laptop_reveal")
                       if _PATTERNS[key].search(text)), None)
        if chosen is None and index == 0 and len(text.split()) >= 2:
            chosen = "type_slam" if "progressive_text_emphasis" in preferences else "headline"
        if chosen is None:
            continue
        if chosen not in APPROVED_MODULES:
            raise ValueError("Internal module not approved")
        # A percentage suggests a visual candidate, not permission to invent
        # a before/after dataset, graph series, or numerical trend.
        suggestions.append(SceneProposal(
            module=chosen, phrase_id=phrase.id, segment_id=phrase.segment_id,
            start_seconds=round(phrase.start, 3),
            end_seconds=round(phrase.end, 3), text_evidence=text[:200],
            reason="Spoken phrase matches a known visual concept; verify graphic facts and asset availability.",
        ))
        last_end = phrase.end
    return {
        "schema_version": "harshverse-scene-proposals/v0.14",
        "status": "review_only", "automatic_application_allowed": False,
        "source": "phrase_timestamps_and_optional_reference_advice",
        "style_preferences_applied": sorted(preferences),
        "proposals": [asdict(p) for p in suggestions],
        "skipped": skipped,
        "safety": {
            "render_ready": False, "assets_resolved": False,
            "numeric_claims_verified": False,
            "requires_human_review": True,
            "reference_media_reused": False,
            "transcript_commands_executed": False,
        },
    }
