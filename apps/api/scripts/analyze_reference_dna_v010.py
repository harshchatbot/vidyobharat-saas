"""Analyze a reference video with opt-in vision provider. Do not pass arbitrary untrusted paths."""
import argparse
import json
import os
from pathlib import Path
from app.services.harshverse.reference_dna_semantic import (
    analyze_reference_v010, FixtureProvider, OllamaVisionProvider, OpenAIVisionProvider,
)


def main():
    p=argparse.ArgumentParser(description='Reference DNA v0.10 (no model requests by default)')
    p.add_argument('--reference',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--provider',choices=['none','fixture','ollama','openai'],default='none')
    p.add_argument('--fixture-json',help='Offline fixture data. For integration tests only.')
    p.add_argument('--model',help='Vision model name, required for ollama/openai')
    p.add_argument('--max-frames',type=int,default=10)
    p.add_argument('--reviewed-annotations',help='Local human-reviewed interval JSON list')
    args=p.parse_args()
    provider=None
    if args.provider=='fixture':
        if not args.fixture_json: p.error('--fixture-json is required for fixture')
        provider=FixtureProvider(json.loads(Path(args.fixture_json).read_text()))
    elif args.provider=='ollama':
        if not args.model: p.error('--model is required for ollama')
        provider=OllamaVisionProvider(args.model)
    elif args.provider=='openai':
        if not args.model: p.error('--model is required for openai')
        key=os.environ.get('OPENAI_API_KEY','')
        if not key: p.error('OPENAI_API_KEY environment variable required')
        provider=OpenAIVisionProvider(args.model,key)
    annotation=json.loads(Path(args.reviewed_annotations).read_text()) if args.reviewed_annotations else None
    report=analyze_reference_v010(args.reference,provider=provider,provider_name=args.provider,
                                  max_frames=args.max_frames,reviewed_annotations=annotation)
    out=Path(args.output).expanduser().resolve();out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+'\n')
    print(f'REFERENCE DNA V0.10: {out}')
    print(f"Frames: {len(report['semantic_vision']['frame_observations'])}; "
          f"candidate labels: {report['semantic_vision']['prediction_count']}; "
          'automatic selection: DISABLED')

if __name__=='__main__': main()
