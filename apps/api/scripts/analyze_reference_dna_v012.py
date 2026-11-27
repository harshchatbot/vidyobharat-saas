"""Opt-in multi-frame Reference DNA. Never enables automatic editing."""
import argparse
import json
import os
from pathlib import Path

from app.services.harshverse.reference_dna_semantic import analyze_reference_v010
from app.services.harshverse.reference_dna_temporal import (
    analyze_temporal, GeminiTemporalProvider, OpenAITemporalProvider,
)


def main():
    p = argparse.ArgumentParser(description='RangManch Reference DNA temporal V0.12')
    p.add_argument('--reference', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--provider', choices=['none', 'openai', 'gemini'], default='none')
    p.add_argument('--model')
    p.add_argument('--max-windows', type=int, default=4)
    args = p.parse_args()
    provider = None
    if args.provider != 'none':
        if not args.model:
            p.error('--model is required for hosted providers')
        key_name = 'OPENAI_API_KEY' if args.provider == 'openai' else 'GEMINI_API_KEY'
        if not os.environ.get(key_name):
            p.error(f'{key_name} environment variable is required')
        provider_class = OpenAITemporalProvider if args.provider == 'openai' else GeminiTemporalProvider
        provider = provider_class(args.model, os.environ[key_name])
    # Preserve previous evidence; no second hosted inference call for single-frame labels.
    base = analyze_reference_v010(args.reference, max_frames=6)
    report = analyze_temporal(args.reference, base, provider=provider,
                              provider_name=args.provider, max_windows=args.max_windows)
    out = Path(args.output).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + '\n')
    section = report['temporal_vision']
    errors = sum(bool(window['error']) for window in section['windows'])
    print(f'REFERENCE DNA V0.12: {out}')
    print(f'Provider={args.provider}; windows={len(section["windows"])}; '
          f'observations={section["observation_count"]}; errors={errors}; '
          'auto-selection=DISABLED')
    if errors:
        raise SystemExit('Some temporal windows failed; inspect temporal_vision.windows[*].error')


if __name__ == '__main__':
    main()
