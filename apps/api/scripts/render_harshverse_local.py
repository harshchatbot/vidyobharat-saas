"""Run the HarshVerse FFmpeg backend locally, without frontend/Firebase/Celery.

Examples (from repository root):
    PYTHONPATH=apps/api python3 apps/api/scripts/render_harshverse_local.py \
      --presenter /path/source.mp4 --animation /path/plate.mp4 \
      --output /path/preview.mp4 --demo

    PYTHONPATH=apps/api python3 apps/api/scripts/render_harshverse_local.py \
      --presenter /path/source.mp4 --animation /path/plate.mp4 \
      --output /path/preview.mp4 --plan /path/scene_plan.json

JSON contract:
    {"duration": 12.0, "fps": 30, "width": 720, "height": 1280,
     "scenes": [
       {"recipe": "presenter_hook", "start": 0, "end": 3},
       {"recipe": "presenter_split", "start": 3, "end": 7, "asset_offset": 0},
       {"recipe": "presenter_outro", "start": 7, "end": 12}
     ]}

--demo is for renderer smoke tests, not Creative Director automated editing.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from app.services.harshverse.scene_plan import Scene, ScenePlan, demo_plan
from app.services.harshverse.render_adapter import _duration, _probe, render


def load_plan(path: Path) -> ScenePlan:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Scene plan must be a JSON object")
    allowed = {"duration", "fps", "width", "height", "scenes"}
    if set(payload) - allowed or not {"duration", "scenes"} <= set(payload):
        raise ValueError("Invalid scene plan fields")
    scenes = payload["scenes"]
    if not isinstance(scenes, list):
        raise ValueError("scenes must be a list")
    allowed_scene = {"recipe", "start", "end", "asset_offset", "title"}
    for scene in scenes:
        if not isinstance(scene, dict) or set(scene) - allowed_scene or not {"recipe", "start", "end"} <= set(scene):
            raise ValueError("Invalid scene fields")
    return ScenePlan(
        duration=payload["duration"],
        scenes=tuple(Scene(**scene) for scene in scenes),
        fps=payload.get("fps", 30),
        width=payload.get("width", 720),
        height=payload.get("height", 1280),
    )


def render_local(*, presenter: Path, animation: Path, output: Path,
                 plan_path: Path | None = None, demo: bool = False,
                 overwrite: bool = False) -> ScenePlan:
    if demo == (plan_path is not None):
        raise ValueError("Choose exactly one of --demo or --plan")
    presenter, animation, output = (Path(v).expanduser().resolve() for v in (presenter, animation, output))
    if not presenter.is_file() or not animation.is_file():
        raise FileNotFoundError("Presenter and animation MP4s must exist")
    if output in {presenter, animation}:
        raise ValueError("Output may not replace source or animation")
    if output.exists() and not overwrite:
        raise FileExistsError("Output exists; choose another filename or --overwrite")
    source_meta = _probe(presenter)
    animation_meta = _probe(animation)
    source_duration = _duration(source_meta)
    asset_duration = _duration(animation_meta)
    if not any(s.get("codec_type") == "audio" for s in source_meta.get("streams", [])):
        raise ValueError("Presenter requires original audio")
    plan = demo_plan(source_duration, asset_duration=asset_duration) if demo else load_plan(Path(plan_path))
    plan.validate(asset_duration=asset_duration)
    if source_duration + 0.05 < plan.duration:
        raise ValueError("Presenter shorter than scene plan")
    render(plan, presenter, animation, output)
    return plan


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local HarshVerse backend render (no frontend or cloud)")
    parser.add_argument("--presenter", type=Path, required=True)
    parser.add_argument("--animation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", type=Path)
    mode.add_argument("--demo", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    try:
        plan = render_local(
            presenter=args.presenter, animation=args.animation, output=args.output,
            plan_path=args.plan, demo=args.demo, overwrite=args.overwrite,
        )
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"HarshVerse render failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "rendered", "output": str(args.output.expanduser().resolve()),
        "duration": plan.duration, "scenes": len(plan.scenes),
        "source_audio": "preserved_timing", "mode": "demo" if args.demo else "scene_plan",
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
