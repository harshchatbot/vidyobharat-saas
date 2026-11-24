"""Isolated V2 integration benchmark; never writes V1 output or publishes."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from openai import OpenAI
from app.services.harshverse.jack_v2.director import direct
from media_timeline import probe, verified_assets
import shutil
from visual_review import review
from stage_mascot_v2 import stage

CAPS={"templates":["hero_title","code_editor","workflow"],
      "cameras":["dolly_in","pull_back","pan_parallax"],"events":["pulse"]}

def run(a):
    source=Path(a.source).expanduser().resolve()
    out=Path(a.output).expanduser().resolve()
    workspace=Path(a.workspace).expanduser().resolve()
    if out==source or source in out.parents:
        raise ValueError("Use a separate V2 output directory")
    out.mkdir(parents=True,exist_ok=False)
    narration=source/"narration.wav"
    script=(source/"script.txt").read_text()
    words=json.loads((source/"alignment.json").read_text())["words"]
    duration=math.ceil((float(probe(narration)["format"]["duration"])+.35)*30)/30
    client=OpenAI()
    project=workspace/"cdc-benchmark"
    poses=stage(a.mascot_manifest,project) if a.mascot_manifest else {}
    caps=dict(CAPS,poses=["hidden",*poses])
    products={}
    if a.product_manifest:
        for key,item in verified_assets(a.product_manifest).items():
            if item["kind"]!="product_visual" or item["path"].suffix.lower() not in (".png",".jpg",".jpeg",".webp"):
                continue
            name=item["sha256"]+item["path"].suffix.lower()
            dest=project/"assets"/"jack-products"/name
            dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(item["path"],dest)
            products[key]="assets/jack-products/"+name
        if products:
            caps["templates"]=[*CAPS["templates"],"product_demo"]
    caps["product_assets"]=list(products)
    plan=direct(script,words,duration,caps,client,model=a.model)
    (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    project=workspace/"cdc-benchmark"
    entry=project/("jack-v2-"+out.name+".html")
    if entry.exists(): raise FileExistsError(entry)
    template=Path(__file__).with_name("composition")/"v2.html"
    data=json.dumps(plan["shots"],ensure_ascii=True).replace("<","\\u003c")
    entry.write_text(template.read_text().replace("__DURATION__",str(duration)).replace("__SHOTS__",data).replace("__PRODUCTS__",json.dumps(products).replace("<","\\u003c")))
    base=out/"base.mp4"
    subprocess.run([str(workspace/"node_modules/.bin/hyperframes"),"render","--composition="+entry.name,"--workers=1","--low-memory-mode","--quality=draft","--fps=30","--frames-cache-dir=off","--no-best-effort","--output="+str(base)],cwd=project,check=True)
    # Phrase captions use actual word timings; no V1 shot-plan adapter required.
    def ts(t):
        ms=round(t*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
        return f"{h:02}:{m:02}:{s:02},{ms:03}"
    groups=[]
    for w in words:
        if not groups or len(groups[-1])>=4 or w["start"]-groups[-1][-1]["end"]>.35:
            groups.append([])
        groups[-1].append(w)
    blocks=[]
    for i,g in enumerate(groups):
        end=min(g[-1]["end"],groups[i+1][0]["start"]) if i+1<len(groups) else g[-1]["end"]
        if end>g[0]["start"]:
            blocks.append(f"{i+1}\n{ts(g[0]['start'])} --> {ts(end)}\n"+ " ".join(w["word"].replace("\n"," ") for w in g))
    (out/"captions.srt").write_text("\n\n".join(blocks)+"\n")
    final=out/"review.mp4"
    subprocess.run(["ffmpeg","-n","-i",str(base),"-i",str(narration),"-vf","subtitles=captions.srt:force_style='FontName=Arial,FontSize=16,Bold=1,Outline=2,MarginV=55'","-af","apad,loudnorm=I=-14:TP=-1.5:LRA=7","-t",str(duration),"-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k",str(final)],cwd=out,check=True)
    print("VIDEO:",final,flush=True)
    print(json.dumps(review(final,out/"qa",client=client),indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("source","workspace","output"): p.add_argument("--"+name,required=True)
    p.add_argument("--mascot-manifest")
    p.add_argument("--product-manifest")
    p.add_argument("--model",default="gpt-4.1-mini")
    run(p.parse_args())
