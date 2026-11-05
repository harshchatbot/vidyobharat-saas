"""Experimental V2 scene-story planner; output is review-only, NOT timeline edits.

Run from apps/api:
  python scripts/run_creative_director_v2.py ~/Downloads/clip-creative-context.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v2 import (
    fallback_scene_plan, generate_openai_scene_plan, storyboard,
)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a reviewable V2 scene storyboard")
    parser.add_argument("context", type=Path)
    parser.add_argument("--model", default=os.getenv("RANGMANCH_OPENAI_MODEL", "gpt-4o-mini"))
    parser.add_argument("--fallback", action="store_true", help="No paid API call")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    source = args.context.expanduser().resolve()
    context = CreativeContext.model_validate_json(source.read_text(encoding="utf-8"))
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    if args.fallback:
        plan = fallback_scene_plan(context)
        provider = "fallback"
    else:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            parser.error("Set OPENAI_API_KEY in apps/api/.env or environment")
        plan = await generate_openai_scene_plan(context, api_key=api_key, model=args.model)
        provider = "openai"

    target = args.out.expanduser().resolve() if args.out else source.with_name(
        source.stem + "-scene-plan-v2.json"
    )
    if target == source:
        parser.error("Output path cannot overwrite source context")
    result = {
        "provider": provider,
        "model": args.model if provider == "openai" else None,
        "status": "review_only_not_renderable",
        "plan": plan.model_dump(mode="json"),
        "storyboard": storyboard(context, plan),
        "constraints": {
            "full_caption_coverage_owned_by": "deterministic_editor",
            "original_voice_preserved": True,
            "asset_queries_are_not_licensed_media": True,
            "speech_timing_review_required": context.review_required,
            "rendering_enabled": False,
        },
    }
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"V2 review-only storyboard: {target}")
    print(f"Scenes: {len(plan.scenes)}; no video was edited or rendered.")


if __name__ == "__main__":
    asyncio.run(main())
