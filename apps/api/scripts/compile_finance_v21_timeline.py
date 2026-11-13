"""Creative Director V2.1 -> faceless finance renderer timeline contract.

Consumes an existing *validated* V2 scene plan and its matching creative
context, then compiles the V2.1 choreography into a renderer-neutral manifest.

This bridge DOES NOT render frames, license assets, approve an export, or
pretend the local finance renderer has executed the instructions. The
finance renderer must consume the resulting scene/overlay specification and
report actual execution separately.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v2 import validate_scene_plan
from app.services.video_creative_director_v21 import compile_composition_v21


VISUAL_KINDS = frozenset({"motion_graphic", "typography", "zoom"})
DEFERRED_KINDS = frozenset({
    "broll_intent", "sound_intent", "emoji_intent",
    "lut_intent", "music_intent",
})


def compile_finance_timeline(context: CreativeContext, scene_plan: dict[str, Any],
                             *, director_mode: str) -> dict[str, Any]:
    """A source-timed and truthful handoff for faceless finance rendering.

    Calling this with a fallback/provided plan is permitted, but the mode is
    retained so downstream QA can distinguish AI direction from fixtures.
    """
    if not director_mode or not isinstance(director_mode, str):
        raise ValueError("Explicit director_mode provenance is required")
    if context.media.aspect_ratio != "9:16":
        raise ValueError("Finance V2.1 preview only supports 9:16")
    plan = validate_scene_plan(context, scene_plan)
    composition = compile_composition_v21(context, plan)
    phrases = {p.id: p for p in context.phrases}
    if not phrases:
        raise ValueError("No verified phrases available for finance scene direction")

    scenes = []
    for index, beat in enumerate(plan.scenes):
        first = phrases[beat.first_phrase_id]
        last = phrases[beat.last_phrase_id]
        if beat.visual_mode == "graphic_overlay":
            visual = "procedural_graphic"
        elif beat.visual_mode == "talking_head":
            # Faceless footage has no presenter. Preserve this editorial intent
            # as a neutral background until the finance renderer resolves it.
            visual = "background_only"
        else:
            visual = "unresolved_verified_asset"
        scenes.append({
            "id": f"finance-scene-{index + 1:02d}",
            "start": first.start,
            "end": last.end,
            "visual": visual,
            "director_visual_mode": beat.visual_mode,
            "template": beat.motion_template,
            "phrase_ids": [
                p.id for p in context.phrases
                if p.start >= first.start - .001 and p.end <= last.end + .001
            ],
            "creative_intent": beat.creative_intent,
            "asset_query": beat.broll_query,
            "requires_asset_resolution": visual == "unresolved_verified_asset",
        })

    visual_instructions = []
    deferred_intents = []
    for beat in composition.beats:
        if beat.kind in VISUAL_KINDS:
            visual_instructions.append({
                "id": beat.id,
                "kind": beat.kind,
                "start": beat.start,
                "end": beat.end,
                "template": beat.template,
                "layout": beat.layout,
                "text": phrases[beat.text_from_phrase_id].text
                        if beat.text_from_phrase_id else None,
                "keyframes": [kf.model_dump(mode="json") for kf in beat.keyframes],
                "status": "pending_renderer_execution",
            })
        elif beat.kind in DEFERRED_KINDS:
            deferred_intents.append({
                "id": beat.id,
                "kind": beat.kind,
                "start": beat.start,
                "end": beat.end,
                "asset_status": beat.asset_status,
                "approved_asset_id": beat.approved_asset_id,
                "status": "deferred_not_rendered",
            })

    return {
        "schema": "finance_creative_director_timeline_v1",
        "director_version": composition.version,
        "director_mode": director_mode,
        "ai_directed": director_mode == "creative_director_v2_openai",
        "duration_seconds": composition.duration_seconds,
        "aspect_ratio": composition.aspect_ratio,
        "creative_thesis": plan.creative_thesis,
        "source_audio_uninterrupted": True,
        "review_required": True,
        "render_complete": False,
        "scenes": scenes,
        "visual_instructions": visual_instructions,
        "deferred_intents": deferred_intents,
        "warnings": [
            *composition.warnings,
            "Finance render not executed: connect this manifest to the local finance renderer.",
            "No asset/effect is reported as rendered until the renderer confirms it.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", type=Path, required=True,
                        help="creative_context.json from the same analysis run")
    parser.add_argument("--scene-plan", type=Path, required=True,
                        help="creative_director_v2.json validated against the context")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--director-mode", required=True,
                        choices=("creative_director_v2_openai",
                                 "provided_validated_v2_plan",
                                 "existing_deterministic_fallback",
                                 "diagnostic_motion_smoke_not_ai"))
    parser.add_argument("--require-ai", action="store_true",
                        help="Fail if provenance is not an actual AI-directed run")
    args = parser.parse_args()
    if args.require_ai and args.director_mode != "creative_director_v2_openai":
        parser.error("This QA run requires actual AI direction; fallback plans are forbidden")
    context = CreativeContext.model_validate_json(args.context.read_text(encoding="utf-8"))
    raw_plan = json.loads(args.scene_plan.read_text(encoding="utf-8"))
    timeline = compile_finance_timeline(context, raw_plan,
                                        director_mode=args.director_mode)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(timeline, indent=2, ensure_ascii=False) + "\n",
                           encoding="utf-8")
    print(json.dumps({
        "timeline": str(args.output),
        "ai_directed": timeline["ai_directed"],
        "scenes": len(timeline["scenes"]),
        "visual_instructions": len(timeline["visual_instructions"]),
        "deferred_intents": len(timeline["deferred_intents"]),
        "render_complete": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
