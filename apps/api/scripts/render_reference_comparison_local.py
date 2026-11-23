"""Local, explicit opt-in render comparison using existing HarshVerse FFmpeg engine.

The supporting visual is supplied and approved by the operator. Reference DNA
never grants rights to reuse frames from the reference video. No API changes.
"""
import argparse
import json
from pathlib import Path

from app.services.video_creative_context import CreativeContext
from app.services.harshverse.creative_scene_planner import propose_scene_plan
from app.services.harshverse.scene_plan import Scene, ScenePlan
from app.services.harshverse.render_adapter import render


def build_comparison_plans(context: CreativeContext, blueprint: dict, *, supporting_visual_approved: bool):
    duration = context.media.duration_seconds
    if not 0 < duration <= 60 or context.media.aspect_ratio != "9:16":
        raise ValueError("Only 9:16 footage up to 60 seconds is supported")
    baseline = ScenePlan(duration=duration, scenes=(Scene("presenter_hook", 0, duration),))
    baseline.validate()
    guided_proposal = propose_scene_plan(context, reference_blueprint=blueprint)
    preferences = guided_proposal["style_preferences_applied"]
    if "presenter_with_supporting_visual" not in preferences:
        return baseline, baseline, {"status": "no_supported_reference_difference"}
    if not supporting_visual_approved:
        raise ValueError("Supporting visual must be independently approved; reference frames cannot be reused")
    # The spoken phrase is the only source of the timing and visual relevance.
    candidates = [p for p in guided_proposal["proposals"]
                  if p["module"] == "laptop_reveal"
                  and p["end_seconds"] - p["start_seconds"] >= 0.15]
    if not candidates:
        return baseline, baseline, {"status": "no_grounded_supporting_visual_scene"}
    selected = candidates[0]
    start, end = selected["start_seconds"], selected["end_seconds"]
    if start < 0 or end > duration or end <= start:
        raise ValueError("Invalid phrase timing")
    scenes = []
    if start > 0:
        scenes.append(Scene("presenter_hook", 0, start))
    scenes.append(Scene("presenter_split", start, end, asset_offset=0))
    if end < duration:
        scenes.append(Scene("presenter_outro", end, duration))
    guided = ScenePlan(duration=duration, scenes=tuple(scenes))
    guided.validate()
    return baseline, guided, {
        "status": "review_required",
        "selected_phrase_id": selected["phrase_id"],
        "supporting_visual_source": "operator_supplied_not_reference",
        "automatic_application_allowed": False,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--presenter", required=True)
    p.add_argument("--supporting-visual", required=True)
    p.add_argument("--creative-context", required=True)
    p.add_argument("--reference-blueprint", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--approve-supporting-visual", action="store_true")
    args = p.parse_args()
    context = CreativeContext.model_validate_json(Path(args.creative_context).expanduser().read_text())
    blueprint = json.loads(Path(args.reference_blueprint).expanduser().read_text())
    baseline, guided, metadata = build_comparison_plans(
        context, blueprint, supporting_visual_approved=args.approve_supporting_visual)
    out = Path(args.output_dir).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    presenter = Path(args.presenter).expanduser()
    visual = Path(args.supporting_visual).expanduser()
    render(baseline, presenter, visual, out / "baseline.mp4")
    render(guided, presenter, visual, out / "reference_guided.mp4")
    (out / "comparison.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print("Output:", out)
    print("Status:", metadata["status"])


if __name__ == "__main__":
    main()
