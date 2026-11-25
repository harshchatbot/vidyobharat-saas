"""Bounded storyboard revision runner. Never authorizes publication."""
import copy,json
from pathlib import Path
DIMENSIONS=("composition","readability","relevance","originality","lighting")
def gate(report):
    if not isinstance(report,dict): return False
    scores=report.get("scores")
    defects=report.get("defects")
    return (isinstance(scores,dict) and set(scores)==set(DIMENSIONS)
            and all(type(v) is int and 60<=v<=100 for v in scores.values())
            and isinstance(defects,list) and all(isinstance(d,dict) and d.get("severity") in ("medium","low") for d in defects))
def iterate(plan,render,review,revise,validate,output,max_revisions=2):
    if type(max_revisions) is not int or not 0<=max_revisions<=3: raise ValueError("Invalid revision budget")
    output=Path(output)
    output.mkdir(parents=True,exist_ok=False)
    history=[]
    def save(status,**extra):
        result=dict(status=status,history=history,publish_authorized=False,**extra)
        tmp=output/"producer_report.tmp"
        tmp.write_text(json.dumps(result,indent=2))
        tmp.replace(output/"producer_report.json")
        return result
    plan=copy.deepcopy(plan)
    for i in range(max_revisions+1):
        stage="validate"
        try:
            validate(plan)
            attempt=output/f"attempt_{i}"
            stage="render"
            video=render(copy.deepcopy(plan),attempt)
            stage="review"
            report=review(video,attempt,copy.deepcopy(plan))
            passed=gate(report)
            history.append(dict(attempt=i,review=report,passed=passed))
            result=save("visual_gate_pass" if passed else "blocked")
            if passed or i==max_revisions: return result
            stage="revise"
            updated=revise(copy.deepcopy(plan),copy.deepcopy(report))
            stage="validate_revision"
            validate(updated)
            if updated==plan: return save("blocked",reason="unchanged_revision")
            plan=updated
        except Exception as exc:
            return save("blocked",failed_stage=stage,error_type=type(exc).__name__,attempt=i)
