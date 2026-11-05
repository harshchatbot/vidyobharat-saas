"""Compile an already validated V2 storyboard into review-only V2.1 composition.

Run from apps/api:
  python scripts/compile_creative_director_v21.py CONTEXT_JSON V2_SCENE_PLAN_JSON
No OpenAI request, timeline mutation, asset download, or export occurs.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v2 import ScenePlanV2
from app.services.video_creative_director_v21 import ApprovedAsset, compile_composition_v21


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("context", type=Path)
    parser.add_argument("storyboard", type=Path, help="V2 CLI output containing plan, or bare V2 plan")
    parser.add_argument("--published-assets", type=Path, help="Optional vetted public registry JSON (items)")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    context_file = args.context.expanduser().resolve()
    storyboard_file = args.storyboard.expanduser().resolve()
    context = CreativeContext.model_validate_json(context_file.read_text(encoding="utf-8"))
    raw = json.loads(storyboard_file.read_text(encoding="utf-8"))
    plan = ScenePlanV2.model_validate(raw["plan"] if "plan" in raw else raw)
    approved = []
    if args.published_assets:
        asset_data = json.loads(args.published_assets.expanduser().read_text(encoding="utf-8"))
        approved = [ApprovedAsset.model_validate({\n            "id": a["id"], "type": a["type"], "tags": a.get("tags", []),\n            "sha256": a["sha256"], "content_url": a["content_url"],\n        }) for a in asset_data["items"]]
    composition = compile_composition_v21(context, plan, approved_assets=approved)
    out = args.out.expanduser().resolve() if args.out else storyboard_file.with_name(
        storyboard_file.stem + "-composition-v21.json"
    )
    if out in {context_file, storyboard_file}:
        parser.error("Output must not overwrite source JSON")
    out.write_text(composition.model_dump_json(indent=2) + "\n", encoding="utf-8")
    print("V2.1 read-only composition:", out)
    print("Beats:", len(composition.beats), "| Rendering: disabled | Original voice/video: preserved")


if __name__ == "__main__":
    main()
