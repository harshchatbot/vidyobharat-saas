"""Local reference analysis: caller responsible for video read authorization."""
import argparse
import json
from pathlib import Path
from app.services.harshverse.reference_dna_recognition import analyze_reference_v09


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--reference',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--threshold',type=float,default=.32)
    p.add_argument('--reviewed-annotations',help='Optional local human-reviewed interval JSON list')
    a=p.parse_args()
    annotations=json.loads(Path(a.reviewed_annotations).read_text()) if a.reviewed_annotations else None
    report=analyze_reference_v09(a.reference,threshold=a.threshold,reviewed_annotations=annotations)
    out=Path(a.output).expanduser().resolve();out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+'\n')
    print('REFERENCE DNA V0.9:',out)
    print('Shots:',len(report['creative_recognition']['shot_candidates']),
          'Reviewed annotations:',len(report['creative_recognition']['reviewed_annotations']))
    print('Semantic recognition is gated pending evaluation.')

if __name__=='__main__': main()
