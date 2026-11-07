#!/usr/bin/env python3
"""Local integration spike: produce a RangManch-compatible MP4 from two videos."""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'apps' / 'api'))
from app.services.harshverse.render_adapter import _probe, _duration, render
from app.services.harshverse.scene_plan import demo_plan


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--presenter', type=Path, required=True)
    parser.add_argument('--animation', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    length = _duration(_probe(args.presenter))
    animation_length = _duration(_probe(args.animation))
    plan = demo_plan(length, asset_duration=animation_length)
    render(plan, args.presenter, args.animation, args.output)
    print('Created:', args.output, '\nScenes:', ', '.join(s.recipe for s in plan.scenes))


if __name__ == '__main__':
    main()
