"""Run explicit, review-only V0.17 finishing effects on a local MP4."""
import argparse
import json
from pathlib import Path
from app.services.harshverse.pro_finishing_v017 import render_effects


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--effects", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--audit", required=True)
    parser.add_argument("--fontfile", default="/System/Library/Fonts/Supplemental/Arial.ttf")
    args = parser.parse_args()
    raw = json.loads(Path(args.effects).expanduser().read_text(encoding="utf-8"))
    audit = render_effects(Path(args.source).expanduser(),
                           Path(args.output).expanduser(), raw,
                           fontfile=Path(args.fontfile).expanduser())
    location = Path(args.audit).expanduser()
    location.parent.mkdir(parents=True, exist_ok=True)
    location.write_text(json.dumps(audit, ensure_ascii=False, indent=2)+"\n",
                        encoding="utf-8")
    print("MP4:", args.output)
    print("Audit:", location)
    print("Rendered:", len(audit["rendered"]), "Deferred:", len(audit["deferred"]))
    print("Needs review: YES; auto export: NO")


if __name__ == "__main__":
    main()
