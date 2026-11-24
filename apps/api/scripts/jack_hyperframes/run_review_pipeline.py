"""Local review pipeline from prepared evidence, narration and approved assets.
Requires a bootstrapped HyperFrames workspace. No production changes.
"""
import argparse
import json
import subprocess
from pathlib import Path
from media_timeline import compose, verified_assets
from visual_review import review
from app.services.harshverse.jack_cinematic_director import validate_plan

def run(a):
    workspace=Path(a.workspace).expanduser().resolve()
    project=workspace/"cdc-benchmark"
    out=Path(a.output).expanduser().resolve()
    out.mkdir(parents=True,exist_ok=False)
    plan=json.loads(Path(a.plan).read_text())
    assets=verified_assets(a.manifest)
    alignment=json.loads(Path(a.alignment).read_text())
    validate_plan(plan,plan["duration"],set(assets))
    template=Path(__file__).with_name("composition")/"dynamic.html"
    # Media cues are executed by the downstream compositor, not the base scene.
    shots=[dict(s,assets=[]) for s in plan["shots"]]
    data=json.dumps(shots,ensure_ascii=True).replace("<","\\u003c")
    (project/"index.html").write_text(template.read_text().replace("__DURATION__",str(float(plan["duration"]))).replace("__SHOTS__",data))
    hf=workspace/"node_modules/.bin/hyperframes"
    base=out/"base.mp4"
    subprocess.run([str(hf),"render","--output",str(base)],cwd=project,check=True)
    final=compose(plan,assets,alignment,base,a.narration,out/"review.mp4")
    report=review(final,out/"qa")
    (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    print(json.dumps(report,indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("workspace","plan","manifest","alignment","narration","output"):
        p.add_argument("--"+name,required=True)
    run(p.parse_args())
