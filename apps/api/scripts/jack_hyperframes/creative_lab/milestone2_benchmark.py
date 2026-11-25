"""Render and inspect all Milestone 2 fixtures without network or AI services."""
import argparse
import json
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path

from milestone2_fixtures import fixtures


def run(*args, cwd=None, stdout=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, stdout=stdout, check=True)


def source(root, text, duration):
    root.mkdir(parents=True)
    words = text.split()
    step = (duration - .5) / len(words)
    (root / "script.txt").write_text(text)
    (root / "alignment.json").write_text(json.dumps({"words": [
        {"word": word, "start": .2 + index * step, "end": .2 + (index + .72) * step}
        for index, word in enumerate(words)]}, indent=2))
    run("ffmpeg", "-v", "error", "-f", "lavfi", "-i",
        "aevalsrc=0.18*sin(2*PI*175*t)*(0.65+0.35*sin(2*PI*2.5*t)):s=48000",
        "-t", duration - .2, root / "narration.wav")


def contact_sheet(output):
    run("ffmpeg", "-v", "error", "-pattern_type", "glob", "-i", str(output / "scene-*.png"),
        "-vf", "scale=270:480,tile=3x4:padding=6:margin=6", "-frames:v", "1", output / "contact-sheet.png")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--browser-modules", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fixture", choices=tuple(fixtures()))
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    here = Path(__file__).resolve().parent
    summary = []
    selected = fixtures()
    if args.fixture:
        selected = {args.fixture: selected[args.fixture]}
    for name, plan in selected.items():
        fixture = output / name
        input_dir = output / "inputs" / name
        input_dir.mkdir(parents=True)
        storyboard = input_dir / "object_storyboard.json"
        storyboard.write_text(json.dumps(plan, indent=2))
        narration = " ".join(sequence["spoken_text"] for sequence in plan["sequences"])
        source(input_dir / "source", narration, plan["total_frames"] / 30)
        before = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
        started = time.monotonic()
        log = output / (name + ".log")
        with log.open("w") as handle:
            run(sys.executable, Path(__file__).with_name("benchmark.py"), "--workspace", args.workspace,
                "--output", fixture, "--storyboard", storyboard, "--source", input_dir / "source", stdout=handle)
        render_seconds = time.monotonic() - started
        peak = max(before, resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss)
        run("node", here / "browser_qa.cjs", args.browser_modules, fixture)
        run("node", here / "browser_qa.cjs", args.browser_modules, fixture, "inject")
        from temporal_audio_qa import inspect
        temporal = inspect(fixture / "review.mp4", fixture)
        (fixture / "temporal_audio_qa.json").write_text(json.dumps(temporal, indent=2))
        contact_sheet(fixture)
        qa = json.loads((fixture / "browser_qa.json").read_text())
        injected = json.loads((fixture / "injected_browser_qa.json").read_text())
        if qa["defects"]:
            raise RuntimeError(f"{name} browser QA defects: {qa['defects']}")
        required = {track["action"] for item in json.loads((fixture / "compiled_motion.json").read_text())["objects"] for track in item["tracks"]}
        if not required <= set(qa["executed_actions"]):
            raise RuntimeError(f"{name} did not execute {required - set(qa['executed_actions'])}")
        injected_codes = {defect["code"] for defect in injected["defects"]}
        if not {"blank_frame", "geometry_bounds", "text_safe_area", "camera_discontinuity"} <= injected_codes:
            raise RuntimeError(f"{name} missed injected failures: {injected_codes}")
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
            "format=duration,size:stream=codec_name,width,height,r_frame_rate", "-of", "json", fixture / "review.mp4"], text=True))
        summary.append({"fixture": name, "video": str(fixture / "review.mp4"), "contact_sheet": str(fixture / "contact-sheet.png"),
                        "render_seconds": round(render_seconds, 2), "child_peak_rss": peak, "probe": probe,
                        "executed_actions": qa["executed_actions"], "camera_continuity": qa["camera_continuity"],
                        "transition_samples": [{"scene": sample["scene"], "phase": sample["phase"], "transition": sample["state"]["transition"]}
                                               for sample in qa["samples"] if sample["phase"] in ("entry", "transition_midpoint", "exit")],
                        "temporal_qa": temporal, "clean_browser_defects": 0, "injected_defect_codes": sorted(injected_codes)})
    report = {"status": "technical_pass_creative_review_pending", "fixtures": summary,
              "environment": {"workers": 1, "low_memory": True, "network_media": False},
              "limitations": ["Procedural engineering benchmarks", "No independent creative review", "Synthetic narration proxy"]}
    (output / "benchmark_summary.json").write_text(json.dumps(report, indent=2))
    print(output)


if __name__ == "__main__":
    main()
