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
from app.services.video_creative_director import fallback_plan, generate_gemini_plan, generate_openai_plan
from dotenv import load_dotenv


async def run() -> None:
    # .env is local-only. Environment variables take precedence over the file.
    load_dotenv(Path(__file__).resolve().parents[1] / '.env', override=False)
    parser = argparse.ArgumentParser()
    parser.add_argument("context", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--provider", choices=["openai", "gemini"],\n                        default=os.getenv("RANGMANCH_CREATIVE_PROVIDER", "openai"))\n    parser.add_argument("--model", default=None)
    parser.add_argument("--fallback", action="store_true", help="No external API; generate conservative proposal")
    args = parser.parse_args()
    path = args.context.expanduser().resolve()
    context = CreativeContext.model_validate_json(path.read_text(encoding="utf-8"))
    model = args.model or (
        os.getenv("RANGMANCH_OPENAI_MODEL", "gpt-4o-mini")
        if args.provider == "openai" else
        os.getenv("RANGMANCH_GEMINI_MODEL", "gemini-3.8-flash")
    )
    if args.fallback:
        plan = fallback_plan(context)
        provider = "fallback"
    elif args.provider == "openai":
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            parser.error("OPENAI_API_KEY not configured in environment or apps/api/.env")
        plan = await generate_openai_plan(context, api_key=key, model=model)
        provider = "openai"
    else:
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            parser.error("GEMINI_API_KEY not configured in environment or apps/api/.env")
        plan = await generate_gemini_plan(context, api_key=key, model=model)
        provider = "gemini"
    destination = (args.out.expanduser().resolve() if args.out
                   else path.with_name(path.stem + "-creative-plan.json"))
    if destination == path:
        parser.error("Output cannot overwrite input context")
    destination.write_text(json.dumps({
        "provider": provider,
        "model": model if provider != "fallback" else None,
        "status": "validated_suggestion_only",
        "plan": plan.model_dump(mode="json"),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Creative direction generated: {destination}")
    print(f"Validated suggestions: {len(plan.actions)}. No media was changed.")


if __name__ == "__main__":
    asyncio.run(run())
