"""Fail closed on missing evidence; scores are not inferred from commits."""
import math
GROUPS={"A":["research","trend","virality","fact_check","audience","script","engagement"],"B":["executive_producer","creative_direction","art_direction","visual_storytelling","storyboard","creative_critic"],"C":["cinematography","lighting","motion","geometry","vfx","typography","composition","assets","transitions","color","captions"],"D":["voice","music","sound_design","mixing","sync","mastering"],"E":["pipeline","rendering","integration","technical_qa","visual_qa","temporal_qa","audio_qa","revision"]}
MINIMUM=60
def evaluate(evidence):
    rows=[]
    for dept,names in GROUPS.items():
        for name in names:
            item=evidence.get(name,{})
            score=item.get("score")
            verified=(type(score) in (int,float) and math.isfinite(score) and 0<=score<=100 and bool(item.get("evidence")) and item.get("verified") is True)
            rows.append(dict(department=dept,capability=name,score=score if verified else None,status=("pass" if score>=MINIMUM else "fail") if verified else "unverified",evidence=item.get("evidence")))
    return dict(minimum=MINIMUM,capabilities=rows,gate="pass" if all(r["status"]=="pass" for r in rows) else "blocked",publish_authorized=False)
if __name__=="__main__":
    import argparse,json
    from pathlib import Path
    p=argparse.ArgumentParser()
    p.add_argument("evidence",type=Path)
    a=p.parse_args()
    report=evaluate(json.loads(a.evidence.read_text()))
    print(json.dumps(report,indent=2))
    raise SystemExit(0 if report["gate"]=="pass" else 1)
