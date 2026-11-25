"""Bounded storyboard revision runner. Never authorizes publication."""
import json
from pathlib import Path
DIMENSIONS=("composition","readability","relevance","originality","lighting")
def gate(report):
    scores=report.get("scores",{})
    return (set(scores)==set(DIMENSIONS) and all(type(v) is int and 60<=v<=100 for v in scores.values())
            and isinstance(report.get("defects"),list) and not any(d.get("severity") in ("critical","high") for d in report["defects"]))
def iterate(plan,render,review,revise,validate,output,max_revisions=2):
    if not 0<=max_revisions<=3: raise ValueError("Invalid revision budget")
    output=Path(output)
    output.mkdir(parents=True,exist_ok=False)
    history=[]
    for i in range(max_revisions+1):
        validate(plan)
        attempt=output/f"attempt_{i}"
        video=render(plan,attempt)
        report=review(video,attempt,plan)
        passed=gate(report)
        history.append(dict(attempt=i,review=report,passed=passed))
        result=dict(status="visual_gate_pass" if passed else "blocked",history=history,publish_authorized=False)
        (output/"producer_report.json").write_text(json.dumps(result,indent=2))
        if passed or i==max_revisions: return result
        updated=revise(plan,report)
        validate(updated)
        if updated==plan: return result
        plan=updated
