"""Normal JACK closed-loop benchmark. Deterministic mode never invokes paid APIs."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from automatic_corrections import apply_repairs, propose_repairs
from compile_motion import compile_motion
from producer import optimize
from rendered_video_evaluator import evaluate_video


def main():
    parser = argparse.ArgumentParser()
    for key in ("workspace", "source", "storyboard", "output"):
        parser.add_argument("--" + key, type=Path, required=True)
    parser.add_argument("--browser-modules", type=Path)
    parser.add_argument("--music", type=Path)
    parser.add_argument("--max-revisions", type=int, default=2, choices=range(4))
    parser.add_argument("--time-budget-seconds", type=int, default=300)
    parser.add_argument("--creative-review", action="store_true",
                        help="Explicitly opt into configured multimodal review after technical optimization")
    args = parser.parse_args()
    original = json.loads(args.storyboard.read_text())
    browser_modules = args.browser_modules or args.workspace

    def validate(plan):
        compile_motion(plan)
        if plan["total_frames"] != original["total_frames"] or len(plan["sequences"]) != len(original["sequences"]):
            raise ValueError("Narration timing changed")
        for scene, baseline in zip(plan["sequences"], original["sequences"]):
            for key in ("start_frame", "end_frame", "spoken_text"):
                if scene.get(key) != baseline.get(key):
                    raise ValueError("Canonical narration or timing changed")
            for key in ("first_word", "last_word"):
                if key in baseline and scene.get(key) != baseline.get(key):
                    raise ValueError("Narration alignment changed")

    def render(plan, output, affected_scenes):
        plan_path = output / "storyboard.json"
        plan_path.write_text(json.dumps(plan, indent=2))
        command = [sys.executable, str(Path(__file__).with_name("benchmark.py")),
                   "--workspace", str(args.workspace), "--source", str(args.source),
                   "--storyboard", str(plan_path), "--output", str(output / "render")]
        if args.music:
            command.extend(["--music", str(args.music)])
        subprocess.run(command, check=True)
        scope = {"requested_affected_scenes": affected_scenes,
                 "actual_render_scope": "full_composition",
                 "reason": "Scene-only integration is not yet proven safe; final encoded validation is mandatory"}
        (output / "render_scope.json").write_text(json.dumps(scope, indent=2))
        return output / "render" / "review.mp4"

    def evaluate(video, output, plan, attempt_id):
        render_root = output / "render"
        subprocess.run(["node", str(Path(__file__).with_name("browser_qa.cjs")),
                        str(browser_modules), str(render_root)], check=False)
        browser = render_root / "browser_qa.json"
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        config = {"expected_duration_seconds": plan["total_frames"] / plan["fps"],
                  "exposure_check": plan.get("render_options", {}).get("exposure", 1) < .5}
        return evaluate_video(video, output, run_id=args.output.name, attempt_id=attempt_id,
                              commit=commit, config=config,
                              browser_report=browser if browser.exists() else None, plan=plan)

    result = optimize(original, render, evaluate, propose_repairs, apply_repairs, validate, args.output,
                      max_revisions=args.max_revisions, time_budget_seconds=args.time_budget_seconds)
    creative = {"status": "not_requested", "human_review_required": True, "publish_authorized": False}
    if args.creative_review and result["best_video_path"]:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from visual_review import review
        creative = review(result["best_video_path"], args.output / "creative_review")
    (args.output / "creative_review_status.json").write_text(json.dumps(creative, indent=2))
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from quality_policy import evaluate as quality_evaluate
    policy = quality_evaluate({})
    (args.output / "department_quality.json").write_text(json.dumps(policy, indent=2))
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "final_awaiting_approval" else 1


if __name__ == "__main__":
    raise SystemExit(main())
