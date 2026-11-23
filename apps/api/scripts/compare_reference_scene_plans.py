"""Generate baseline and reference-guided review-only scene proposals offline.

Creative Context must be produced by Video Analysis V2; no invented transcript timing.
No network calls, media mutation, or render authorization.
"""
import argparse
import json
from pathlib import Path

from app.services.video_creative_context import CreativeContext
from app.services.harshverse.creative_scene_planner import propose_scene_plan


def compare(context_data: dict, blueprint: dict, *, max_scenes: int = 5) -> dict:
    context = CreativeContext.model_validate(context_data)
    baseline = propose_scene_plan(context, max_scenes=max_scenes)
    guided = propose_scene_plan(
        context, reference_blueprint=blueprint, max_scenes=max_scenes
    )
    before = {(p["phrase_id"], p["module"]) for p in baseline["proposals"]}
    after = {(p["phrase_id"], p["module"]) for p in guided["proposals"]}
    return {
        "schema_version": "reference-guided-scene-comparison/v0.1",
        "status": "review_only",
        "baseline": baseline,
        "reference_guided": guided,
        "comparison": {
            "baseline_scene_count": len(baseline["proposals"]),
            "guided_scene_count": len(guided["proposals"]),
            "changed_proposals": bool(before != after),
            "baseline_only": sorted([list(x) for x in before - after]),
            "guided_only": sorted([list(x) for x in after - before]),
            "style_preferences": guided["style_preferences_applied"],
        },
        "automatic_application_allowed": False,
        "render_ready": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--creative-context", required=True)
    parser.add_argument("--reference-blueprint", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-scenes", type=int, default=5)
    args = parser.parse_args()
    context = json.loads(Path(args.creative_context).expanduser().read_text())
    blueprint = json.loads(Path(args.reference_blueprint).expanduser().read_text())
    result = compare(context, blueprint, max_scenes=args.max_scenes)
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print("Comparison:", result["comparison"])
    print("Render ready:", result["render_ready"])


if __name__ == "__main__":
    main()
