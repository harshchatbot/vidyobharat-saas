"""Offline rendered evidence suite for the Milestone 3 closed loop."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path

from automatic_corrections import RepairBlockedError, apply_repairs, propose_repairs
from compile_motion import compile_motion
from evaluation_contracts import artifact_record, defect, evaluation
from milestone3_fixtures import rendered_repair_fixtures, safety_fixture_manifest
from producer import optimize
from rendered_video_evaluator import evaluate_video
from revision_contracts import RevisionContractError, operation


def run(*args, check=True, stdout=None):
    return subprocess.run([str(value) for value in args], check=check, stdout=stdout)


def make_source(root: Path, plan: dict):
    root.mkdir(parents=True)
    text = " ".join(scene["spoken_text"] for scene in plan["sequences"])
    words = text.split(); duration = plan["total_frames"] / plan["fps"]
    step = (duration - .4) / len(words)
    (root / "script.txt").write_text(text)
    (root / "alignment.json").write_text(json.dumps({"words": [
        {"word": word, "start": .2 + index * step, "end": .2 + (index + .72) * step}
        for index, word in enumerate(words)]}, indent=2))
    run("ffmpeg", "-v", "error", "-f", "lavfi", "-i",
        "aevalsrc=0.17*sin(2*PI*180*t)*(0.7+0.3*sin(2*PI*2*t)):s=48000",
        "-t", duration - .15, root / "narration.wav")


def digest(path: str | Path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def contact_sheet(render_root: Path, target: Path):
    run("ffmpeg", "-v", "error", "-pattern_type", "glob", "-i", str(render_root / "scene-*.png"),
        "-vf", "scale=270:480,tile=3x4:padding=6:margin=6", "-frames:v", "1", target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--browser-modules", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fixture", choices=tuple(rendered_repair_fixtures()))
    args = parser.parse_args(); output = args.output.resolve(); output.mkdir(parents=True, exist_ok=False)
    here = Path(__file__).resolve().parent
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    summary = []
    selected = rendered_repair_fixtures()
    if args.fixture: selected = {args.fixture: selected[args.fixture]}
    for name, fixture in selected.items():
        plan = fixture["plan"]; root = output / name; source = output / "inputs" / name
        make_source(source, plan); started = time.monotonic()

        def validate(candidate):
            compile_motion(candidate)
            if candidate["total_frames"] != plan["total_frames"]:
                raise ValueError("Duration changed")

        def render(candidate, attempt, scope):
            storyboard = attempt / "storyboard.json"; storyboard.write_text(json.dumps(candidate, indent=2))
            render_root = attempt / "render"
            with (attempt / "render.log").open("w") as log:
                run(sys.executable, here / "benchmark.py", "--workspace", args.workspace,
                    "--output", render_root, "--storyboard", storyboard, "--source", source, stdout=log)
            (attempt / "render_scope.json").write_text(json.dumps({"requested_scenes": scope,
                "actual_scope": "full_composition", "reason": "partial integration is not proven safe"}, indent=2))
            return render_root / "review.mp4"

        def evaluate_candidate(video, attempt, candidate, attempt_id):
            render_root = attempt / "render"
            run("node", here / "browser_qa.cjs", args.browser_modules, render_root, check=False)
            config = {"expected_duration_seconds": candidate["total_frames"] / candidate["fps"],
                      "exposure_check": candidate.get("render_options", {}).get("exposure", 1) < .5}
            return evaluate_video(video, attempt, run_id=name, attempt_id=attempt_id, commit=commit,
                                  config=config, browser_report=render_root / "browser_qa.json", plan=candidate)

        state = optimize(plan, render, evaluate_candidate, propose_repairs, apply_repairs, validate, root,
                         max_revisions=2, transient_retries=1, time_budget_seconds=180)
        if state["status"] != "final_awaiting_approval":
            raise RuntimeError(f"{name} loop did not pass: {state['status']} {state.get('reason')}")
        first, best = state["history"][0], state["history"][state["best_attempt"]]
        before = json.loads(Path(first["evaluation_path"]).read_text()); after = json.loads(Path(best["evaluation_path"]).read_text())
        before_categories = {item["category"] for item in before["defects"]}; after_categories = {item["category"] for item in after["defects"]}
        if fixture["expected"] not in before_categories or fixture["expected"] in after_categories:
            raise RuntimeError(f"{name} expected defect was not measured and resolved")
        contact_sheet(Path(first["video_path"]).parent, root / "before-contact-sheet.png")
        contact_sheet(Path(best["video_path"]).parent, root / "after-contact-sheet.png")
        summary.append({"fixture": name, "expected_defect": fixture["expected"], "status": state["status"],
                        "attempts": len(state["history"]), "before_video": first["video_path"], "after_video": best["video_path"],
                        "before_sha256": digest(first["video_path"]), "after_sha256": digest(best["video_path"]),
                        "before_categories": sorted(before_categories), "after_categories": sorted(after_categories),
                        "repairs": first["repairs"], "wall_seconds": round(time.monotonic()-started, 2)})

    if args.fixture:
        (output / "milestone3_summary.json").write_text(json.dumps({"status": "focused_fixture_pass", "fixtures": summary}, indent=2))
        print(output); return

    # Audio correction operates on the actual encoded result and records measured before/after reports.
    audio_root = output / "audio_mastering"; audio_root.mkdir()
    clean_video = Path(summary[0]["after_video"]); bad_audio = audio_root / "before.mp4"; fixed_audio = audio_root / "after.mp4"
    run("ffmpeg", "-v", "error", "-i", clean_video, "-c:v", "copy", "-af", "volume=12dB", "-c:a", "aac", "-b:a", "192k", bad_audio)
    before_audio = evaluate_video(bad_audio, audio_root / "before-evaluation", run_id="audio_mastering", attempt_id="before",
                                  commit=commit, config={"expected_duration_seconds": 6})
    audio_defects = [item for item in before_audio["defects"] if item["category"] in ("audio_loudness", "audio_peak")]
    repairs = propose_repairs(rendered_repair_fixtures()["camera_discontinuity"]["plan"], audio_defects)
    if not repairs: raise RuntimeError("Audio failure was not diagnosed")
    run("ffmpeg", "-v", "error", "-i", bad_audio, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=7",
        "-c:a", "aac", "-b:a", "192k", fixed_audio)
    after_audio = evaluate_video(fixed_audio, audio_root / "after-evaluation", run_id="audio_mastering", attempt_id="after",
                                 commit=commit, config={"expected_duration_seconds": 6})
    if any(item["category"] in ("audio_loudness", "audio_peak") for item in after_audio["defects"]):
        raise RuntimeError("Audio remaster did not pass measured targets")
    summary.append({"fixture": "audio_mastering", "status": "measured_repair_pass", "before_video": str(bad_audio),
                    "after_video": str(fixed_audio), "before_sha256": digest(bad_audio), "after_sha256": digest(fixed_audio),
                    "repairs": repairs, "before_audio": before_audio["measurements"]["temporal_audio"].get("audio"),
                    "after_audio": after_audio["measurements"]["temporal_audio"].get("audio")})

    # Safety controls use real evidence paths but do not claim visual repair.
    controls = {}; evidence_path = Path(summary[0]["before_video"])
    locked = copy.deepcopy(rendered_repair_fixtures()["camera_discontinuity"]["plan"]); locked["sequences"][0]["locked"] = True
    finding = {"id": "locked-camera", "category": "camera_discontinuity", "severity": "high", "scene": 0,
               "timecode_seconds": 0, "reproduction": {}, "before_after": {}}
    try: propose_repairs(locked, [finding])
    except RepairBlockedError as exc: controls["locked_scene_protection"] = {"status": "pass", "evidence": str(evidence_path), "result": str(exc)}
    try: operation(defect_id="invalid", operation_type="set_camera", scene=0, parameters={"camera": "teleport"}, reason="negative fixture")
    except RevisionContractError as exc: controls["invalid_repair_rejection"] = {"status": "pass", "result": str(exc)}

    rollback_root = output / "failed_repair_rollback"
    transition_before = next(item for item in summary if item["fixture"] == "transition_flash")["before_video"]
    transition_plan = rendered_repair_fixtures()["transition_flash"]["plan"]
    def rollback_render(candidate, attempt, scope):
        path = attempt / "review.mp4"
        if candidate.get("render_options", {}).get("transition_flash"):
            shutil.copy2(transition_before, path)
        else: path.write_bytes(b"corrupt candidate")
        return path
    def rollback_evaluate(video, attempt, candidate, attempt_id):
        return evaluate_video(video, attempt, run_id="rollback", attempt_id=attempt_id, commit=commit,
                              config={"expected_duration_seconds": transition_plan["total_frames"]/30})
    rollback = optimize(transition_plan, rollback_render, rollback_evaluate, propose_repairs, apply_repairs,
                        lambda candidate: compile_motion(candidate), rollback_root, max_revisions=2)
    if rollback.get("reason") != "severe_regression" or rollback["best_attempt"] != 0:
        raise RuntimeError("Rollback fixture did not retain the best valid candidate")
    controls["failed_repair_rollback"] = {"status": "pass", "state": str(rollback_root / "optimizer_state.json"),
                                           "best_video": rollback["best_video_path"]}
    retry_root = output / "retry_exhaustion"
    def fail_render(*_): raise OSError("injected transient render failure")
    retry = optimize(transition_plan, fail_render, rollback_evaluate, propose_repairs, apply_repairs,
                     lambda candidate: compile_motion(candidate), retry_root, transient_retries=1)
    if retry.get("reason") != "transient_retry_exhausted": raise RuntimeError("Retry exhaustion did not stop safely")
    controls["retry_exhaustion"] = {"status": "pass", "state": str(retry_root / "optimizer_state.json")}
    if set(controls) != set(safety_fixture_manifest()) - {"audio_mastering"}:
        raise RuntimeError("Safety fixture evidence is incomplete")
    (output / "safety_controls.json").write_text(json.dumps(controls, indent=2))
    report = {"status": "engineering_gate_pass_creative_review_pending", "commit": commit,
              "fixtures": summary, "safety_controls": controls,
              "environment": {"workers": 1, "low_memory": True, "paid_apis": False,
                              "peak_child_rss_raw": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss},
              "limitations": ["Full rerenders used because safe scene-only integration is not proven",
                              "Deterministic technical repair does not establish creative quality",
                              "Independent human review and the 38-capability gate remain pending"]}
    (output / "milestone3_summary.json").write_text(json.dumps(report, indent=2))
    print(output)


if __name__ == "__main__": main()
