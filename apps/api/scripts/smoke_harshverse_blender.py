"""Short Blender 3D quality smoke test without transcription, camera footage or AI.

Creates original 3D HarshVerse motion plate using the same renderer as Phase 1.
This diagnostic demo is *not* generated from a user's speech and must never
be labeled an automated edit. Real Auto Edit requires a validated V2.1 plan.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.harshverse.blender_motion import render_blender_plate
from app.services.video_creative_director_v21 import CompositionBeat, CompositionPlanV21


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render 2.8s original warm Blender 3D scene to verify Mac setup."
    )
    parser.add_argument(
        "--output", type=Path, default=Path.home() / "Downloads/HarshVerse-3D-Smoke.mp4",
    )
    parser.add_argument("--blender-bin", type=Path, default=None)
    parser.add_argument("--quality", choices=("preview", "final"), default="preview")
    args = parser.parse_args()
    beat = CompositionBeat(
        id="diagnostic-3d-graphic",
        kind="motion_graphic", template="data_flow",
        start=0.2, end=2.6, layout="face_safe_graphic",
        phrase_ids=["diagnostic"], text_from_phrase_id="diagnostic",
    )
    plan = CompositionPlanV21(
        duration_seconds=2.8, aspect_ratio="9:16",
        beats=[
            CompositionBeat(
                id="diagnostic-source", kind="source", template="original_video_audio",
                start=0, end=2.8,
            ),
            beat,
        ],
        warnings=["Local diagnostic 3D motion smoke; no actual user video or speech."],
    )
    result = render_blender_plate(
        plan, [beat], args.output, blender=args.blender_bin,
        quality=args.quality,
    )
    print(json.dumps({
        "status": "diagnostic_3d_plate_requires_review",
        "preview": str(result.path),
        "renderer": result.render_engine,
        "sequences": result.grouped_sequences,
        "beat_ids": list(result.rendered_beat_ids),
        "contains_presenter_video": False,
        "contains_audio": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
