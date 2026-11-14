"""Build a PRIVATE-PREVIEW catalog from the user's existing finance demo assets.

All rights remain unverified. No asset is marked publishable by this script.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ASSETS = [
    ("money", "video", "assets/broll/Money.mp4",
     ["money", "cash", "finance", "saving"]),
    ("money_stack", "greenscreen",
     "assets/broll/B-roll/stack money greenscreen.mp4",
     ["money", "savings", "stack", "wealth", "investing"]),
    ("growth_graph", "greenscreen",
     "assets/broll/B-roll/Business Growth Bar Graph Green Screen.mp4",
     ["growth", "investing", "chart", "compound", "business"]),
    ("whoosh", "sfx", "assets/sfx/whoosh/Whoosh Soft Wooden.wav",
     ["transition", "whoosh"]),
    ("paper_flip", "sfx", "assets/sfx/paper/Paper Flip 1.wav",
     ["change", "paper"]),
    ("soft_pop", "sfx", "assets/sfx/pop/mixkit-bell-notification-933.mp3",
     ["highlight", "pop"]),
]


def make_catalog(root: Path) -> dict:
    rows = []
    missing = []
    for asset_id, kind, relative, tags in ASSETS:
        p = (root / relative).resolve()
        if not p.is_file() or not p.stat().st_size:
            missing.append(str(p))
        rows.append({
            "id": asset_id,
            "kind": kind,
            "path": str(p),
            "tags": tags,
            "commercial_use_verified": False,
            "license_reference": "",
        })
    if missing:
        raise FileNotFoundError("Missing source assets:\n" + "\n".join(missing))
    return {"version": 1, "purpose": "private_preview_only",
            "assets": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    if args.output.exists():
        parser.error("Catalog already exists: refusing overwrite")
    doc = make_catalog(root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print("Saved private-preview catalog:", args.output)


if __name__ == "__main__":
    main()
