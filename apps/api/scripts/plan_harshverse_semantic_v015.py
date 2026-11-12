"""V0.15 one-shot semantic scene planning from a validated CreativeContext JSON.

No rendering, no editor changes, no silent API retries or credential logging.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path

from app.services.video_creative_context import CreativeContext
from app.services.harshverse.semantic_scene_planner import generate_openai_semantic_plan


async def run(args):
    context = CreativeContext.model_validate_json(
        Path(args.context).expanduser().read_text(encoding="utf-8")
    )
    blueprint = None
    if args.reference:
        blueprint = json.loads(Path(args.reference).expanduser().read_text(encoding="utf-8"))
    result = await generate_openai_semantic_plan(
        context, api_key=os.environ.get("OPENAI_API_KEY", ""),
        reference_blueprint=blueprint, model=args.model, max_scenes=args.max_scenes,
    )
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"SEMANTIC SCENE PROPOSALS: {output}")
    print(f"Proposals: {len(result['proposals'])}; render-ready: NO; human review: REQUIRED")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True, help="CreativeContext JSON from Video Analysis V2")
    parser.add_argument("--reference", help="Optional V0.13 reference blueprint JSON")
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="gpt-4.1-mini")
    parser.add_argument("--max-scenes", type=int, default=5)
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
