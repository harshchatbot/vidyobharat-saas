"""Local CLI for read-only video editing-rhythm measurements."""
import argparse
import json
from pathlib import Path
from app.services.harshverse.reference_dna import analyze_reference


def main():
    p = argparse.ArgumentParser(description="Analyze reference-video editing rhythm")
    p.add_argument("--reference", required=True, help="Local video file")
    p.add_argument("--output", required=True, help="Write versioned JSON blueprint")
    p.add_argument("--threshold", type=float, default=0.32)
    args = p.parse_args()
    result = analyze_reference(args.reference, threshold=args.threshold)
    destination = Path(args.output).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("REFERENCE DNA:", destination)
    print("Cuts:", result["editing_rhythm"]["detected_cuts"], "Pacing:", result["editing_rhythm"]["pacing"])


if __name__ == "__main__":
    main()
