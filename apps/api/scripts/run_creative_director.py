"""Experiment CLI: Gemini creative direction from compact context, NEVER apply edits.

cd apps/api && source .venv/bin/activate
export GEMINI_API_KEY='...'  # keep key in shell / secret store; never commit
python scripts/run_creative_director.py ~/Downloads/sample-creative-context.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director import fallback_plan, generate_gemini_plan


async def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("context", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--model", default=os.getenv("RANGMANCH_GEMINI_MODEL", "gemini-3.8-flash"))
    parser.add_argument("--fallback", action="store_true", help="No external API; generate conservative proposal")
    args = parser.parse_args()
    path = args.context.expanduser().resolve()
    context = CreativeContext.model_validate_json(path.read_text(encoding="utf-8"))
    if args.fallback:
        plan = fallback_plan(context)
        provider = "fallback"
    else:
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            parser.error("Set GEMINI_API_KEY in environment or use --fallback")
        plan = await generate_gemini_plan(context, api_key=key, model=args.model)
        provider = "gemini"
    destination = (args.out.expanduser().resolve() if args.out
                   else path.with_name(path.stem + "-creative-plan.json"))
    if destination == path:
        parser.error("Output cannot overwrite input context")
    destination.write_text(json.dumps({
        "provider": provider,
        "model": args.model if provider == "gemini" else None,
        "status": "validated_suggestion_only",
        "plan": plan.model_dump(mode="json"),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Creative direction generated: {destination}")
    print(f"Validated suggestions: {len(plan.actions)}. No media was changed.")


if __name__ == "__main__":
    asyncio.run(run())
