"""Read-only local CLI for reference-video signal extraction."""
import argparse
import json
from pathlib import Path
from app.services.harshverse.reference_dna_visual import analyze_reference_v07


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--threshold", type=float, default=0.32)
    args = parser.parse_args()
    result = analyze_reference_v07(args.reference, threshold=args.threshold)
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"REFERENCE DNA V0.7: {output}")
    print(f"Cuts: {result['editing_rhythm']['detected_cuts']}; sampled frames: {result['visual_signals']['frame_samples']}; audio: {result['audio_signals']['has_audio']}")


if __name__ == "__main__":
    main()
