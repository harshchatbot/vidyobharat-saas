"""Offline, read-only Reference DNA V0.8 CLI. Trusted local inputs only."""
import argparse
import json
from pathlib import Path
from app.services.harshverse.reference_dna_creative import analyze_reference_v08


def main():
    parser = argparse.ArgumentParser(description='Extract bounded reference creative evidence')
    parser.add_argument('--reference', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--threshold', type=float, default=.32)
    args = parser.parse_args()
    result = analyze_reference_v08(args.reference, threshold=args.threshold)
    out = Path(args.output).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    evidence = result['creative_evidence']
    print('REFERENCE DNA V0.8:', out)
    print('Shots:', len(evidence['shot_appearance']), 'Frames:', evidence['sampling']['frames'],
          'Visual activity candidates:', len(evidence['visual_activity_candidates']))


if __name__ == '__main__':
    main()
