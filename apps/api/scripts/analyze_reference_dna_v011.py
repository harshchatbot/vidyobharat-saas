"""Run Reference DNA v0.11 with Gemini/OpenAI or no hosted inference.

Only analyze media you are authorized to send to the selected provider.
"""
import argparse
import json
import os
from pathlib import Path
from app.services.harshverse.reference_dna_semantic import analyze_reference_v010
from app.services.harshverse.reference_dna_hosted import GeminiHostedVisionProvider, OpenAIHostedVisionProvider


def main():
    p = argparse.ArgumentParser(description='Reference DNA v0.11 hosted model comparison')
    p.add_argument('--reference', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--provider', choices=['none', 'gemini', 'openai'], default='none')
    p.add_argument('--model', help='Explicit vision model name; required for hosted providers')
    p.add_argument('--max-frames', type=int, default=6)
    p.add_argument('--reviewed-annotations', help='JSON list of human-reviewed intervals')
    args = p.parse_args()
    provider = None
    if args.provider != 'none':
        if not args.model:
            p.error('--model is required for hosted providers')
        env = 'GEMINI_API_KEY' if args.provider == 'gemini' else 'OPENAI_API_KEY'
        key = os.environ.get(env, '')
        if not key:
            p.error(f'{env} environment variable is required')
        cls = GeminiHostedVisionProvider if args.provider == 'gemini' else OpenAIHostedVisionProvider
        provider = cls(args.model, key)
    annotations = (json.loads(Path(args.reviewed_annotations).read_text())
                   if args.reviewed_annotations else None)
    report = analyze_reference_v010(args.reference, provider=provider,
                                    provider_name=args.provider, max_frames=args.max_frames,
                                    reviewed_annotations=annotations)
    report['semantic_vision']['adapter_version'] = 'hosted-providers/v0.11'
    report['semantic_vision']['model'] = args.model if provider else None
    report['semantic_vision']['privacy']['hosted_provider_selected'] = provider is not None
    out = Path(args.output).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + '\n')
    errors = sum(bool(x['error']) for x in report['semantic_vision']['frame_observations'])
    print(f'REFERENCE DNA V0.11: {out}')
    print(f'Provider={args.provider}; frames={len(report["semantic_vision"]["frame_observations"])}; '
          f'predictions={report["semantic_vision"]["prediction_count"]}; errors={errors}; '
          'auto-selection=DISABLED')
    if errors:
        raise SystemExit('Some inference requests failed; inspect frame_observations.error')


if __name__ == '__main__':
    main()
