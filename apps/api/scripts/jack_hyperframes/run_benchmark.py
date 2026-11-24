"""Local end-to-end review benchmark; no publishing or production writes."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from openai import OpenAI
from faster_whisper import WhisperModel
from media_timeline import verified_assets, compose, probe
from visual_review import review
from app.services.harshverse.jack_asset_catalog import Asset
from app.services.harshverse.jack_cinematic_director import direct

SCRIPT = """What if your next video started with code instead of a timeline? Meet HyperFrames. You can build animated scenes using HTML, CSS and JavaScript, then render them into a video. Add a Three.js scene for depth, use GSAP to choreograph motion, and export the result as an MP4. The real opportunity? Reusable compositions for automated content. But great visuals still need great creative direction. Follow JACK for practical AI tools and experiments."""

def run(a):
    workspace=Path(a.workspace).expanduser().resolve()
    out=Path(a.output).expanduser().resolve()
    out.mkdir(parents=True,exist_ok=False)
    project=workspace/"cdc-benchmark"
    hf=workspace/"node_modules/.bin/hyperframes"
    for p in (hf,project/"vendor/gsap.min.js",project/"vendor/three.module.js",project/"vendor/three.core.js"):
        if not p.is_file(): raise FileNotFoundError(p)
    assets=verified_assets(a.manifest) if a.manifest else {}
    catalog=[Asset(k,v["kind"],v.get("title",k),tuple(v.get("tags",[])),v["license"],v["source"],True,v["evidence"]) for k,v in assets.items()]
    script=Path(a.script).read_text().strip() if a.script else SCRIPT
    (out/"script.txt").write_text(script)
    client=OpenAI()
    narration=out/"narration.wav"
    with client.audio.speech.with_streaming_response.create(model="gpt-4o-mini-tts",voice="onyx",input=script,response_format="wav",instructions="Energetic but clear technology presenter. Natural pacing, no exaggerated shouting.") as response:
        response.stream_to_file(narration)
    duration=math.ceil((float(probe(narration)["format"]["duration"])+.35)*30)/30
    model=WhisperModel("base",device="cpu",compute_type="int8")
    segments,_=model.transcribe(str(narration),language="en",word_timestamps=True)
    words=[{"word":w.word.strip(),"start":w.start,"end":min(w.end,duration)} for s in segments for w in (s.words or []) if w.end>w.start and w.start<duration]
    if not words: raise ValueError("No word timestamps")
    alignment={"words":words}
    (out/"alignment.json").write_text(json.dumps(alignment,indent=2))
    plan=direct(script=script,words=words,duration=duration,assets=catalog,client=client)
    (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    template=Path(__file__).with_name("composition")/"dynamic.html"
    shots=[dict(s,assets=[]) for s in plan["shots"]]
    data=json.dumps(shots,ensure_ascii=True).replace("<","\\u003c")
    entry=project/("jack-"+out.name+".html")
    if entry.exists(): raise FileExistsError(entry)
    entry.write_text(template.read_text().replace("__DURATION__",str(duration)).replace("__SHOTS__",data))
    base=out/"base.mp4"
    subprocess.run([str(hf),"render","--composition="+entry.name,"--workers=1","--low-memory-mode","--quality=draft","--fps=30","--frames-cache-dir=off","--no-best-effort","--output="+str(base)],cwd=project,check=True)
    final=compose(plan,assets,alignment,base,narration,out/"review.mp4")
    print("VIDEO:",final,flush=True)
    report=review(final,out/"qa",client=client)
    print(json.dumps(report,indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--workspace",required=True)
    p.add_argument("--output",required=True)
    p.add_argument("--manifest")
    p.add_argument("--script")
    run(p.parse_args())
