"""Render V3 from existing narration and validated V2 plan; no publishing."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from stage_mascot_v2 import stage
from media_timeline import probe
from visual_review import review

def run(a):
    source, previous, workspace, out = [Path(x).expanduser().resolve() for x in (a.source,a.previous,a.workspace,a.output)]
    if any(out == p or p in out.parents for p in (source,previous)):
        raise ValueError("Use a separate output directory")
    plan=json.loads((previous/"production_plan.json").read_text())
    words=json.loads((source/"alignment.json").read_text())["words"]
    shots=plan["shots"]
    duration=shots[-1]["end_frame"]/30
    if not shots or shots[0]["start_frame"]!=0 or any(x["end_frame"]!=y["start_frame"] for x,y in zip(shots,shots[1:])):
        raise ValueError("Invalid shot coverage")
    project=workspace/"cdc-benchmark"
    poses=stage(a.mascot_manifest,project)
    if any(s["mascot"]!="hidden" and s["mascot"] not in poses for s in shots):
        raise ValueError("Missing mascot pose")
    for vendor in ("three.module.js","three.core.js","gsap.min.js"):
        if not (project/"vendor"/vendor).is_file(): raise FileNotFoundError(vendor)
    out.mkdir(parents=True,exist_ok=False)
    def js(x): return json.dumps(x,ensure_ascii=True).replace("<","\\u003c")
    template=(Path(__file__).parent/"composition/v3.html").read_text()
    entry=project/("jack-v3-"+out.name+".html")
    with entry.open("x") as f:
        f.write(template.replace("__DURATION__",str(duration)).replace("__SHOTS__",js(shots)).replace("__WORDS__",js(words)))
    (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    clean=out/"narration.wav"
    subprocess.run(["ffmpeg","-n","-i",str(source/"narration.wav"),"-c:a","pcm_s16le","-ar","48000",str(clean)],check=True)
    base=out/"base.mp4"
    subprocess.run([str(workspace/"node_modules/.bin/hyperframes"),"render","--composition="+entry.name,"--workers=1","--low-memory-mode","--quality=draft","--fps=30","--frames-cache-dir=off","--no-best-effort","--output="+str(base)],cwd=project,check=True)
    final=out/"review.mp4"
    subprocess.run(["ffmpeg","-n","-i",str(base),"-i",str(clean),"-map","0:v:0","-map","1:a:0","-c:v","copy","-af","apad,loudnorm=I=-14:TP=-1.5:LRA=7","-c:a","aac","-ar","48000","-b:a","192k","-t",str(duration),str(final)],check=True)
    print("VIDEO:",final,flush=True)
    print(json.dumps(review(final,out/"qa"),indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("source","previous","workspace","output","mascot-manifest"): p.add_argument("--"+name,required=True)
    run(p.parse_args())
