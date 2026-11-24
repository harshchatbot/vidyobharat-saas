"""Standalone nine-second creative benchmark; no AI services."""
import argparse
import json
import math
import random
import shutil
import struct
import subprocess
import wave
from pathlib import Path

RATE = 48000
DURATION = 9
THREE_VERSION = "0.180.0"

def run(*args, cwd=None):
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)

def soundtrack(path, version=1):
    duration = 10 if version >= 2 else DURATION
    rng = random.Random(42)
    cues = [(0.6, 1.7, "separation"), (2.8, 2.2, "dissolve"),
            (5.8, 1.4, "scan"), (7.5, .65, "resolve")]
    if version >= 2:
        cues = [(0.3, 1.6, 'separation'), (2, 1.5, 'dissolve'), (3.5, 1.8, 'dissolve'), (6, 1.6, 'scan'), (8, 1.2, 'resolve')]
    samples = []
    low = 0.0
    for i in range(RATE * duration):
        t = i / RATE
        fade = min(1, t / .4, (duration-t)/.5)
        x = .035 * (math.sin(2*math.pi*48*t)+.4*math.sin(2*math.pi*72*t)) * fade
        low = .94*low + .06*rng.uniform(-1,1)
        for start, length, kind in cues:
            q = t-start
            if not 0 <= q < length:
                continue
            u = q/length
            env = math.sin(math.pi*u)**2
            if kind == "separation":
                x += .28*low*env + .07*math.sin(2*math.pi*(90*q+55*q*q))*env
            elif kind == "dissolve":
                grain = (.5+.5*math.sin(2*math.pi*23*q))**4
                x += .22*low*env + .045*grain*env*math.sin(2*math.pi*(340*q+270*q*q))
            elif kind == "scan":
                x += .08*env*math.sin(2*math.pi*(180*q+180*q*q))+.12*low*env
            else:
                x += .35*min(1,q/.008)*(1-u)**3*math.sin(2*math.pi*(75*q-32*q*q))
        samples.append(round(max(-1,min(1,x))*32767))
    with wave.open(str(path),"wb") as w:
        w.setparams((1,2,RATE,0,"NONE","not compressed"))
        w.writeframes(struct.pack("<"+"h"*len(samples),*samples))
    return [{"time":s,"duration":d,"intent":k} for s,d,k in cues]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--workspace",type=Path,required=True)
    ap.add_argument("--output",type=Path,required=True)
    ap.add_argument('--version',type=int,choices=(1,2,3,4),default=1)
    a=ap.parse_args()
    work=a.workspace.resolve()
    out=a.output.resolve()
    hf=work/"node_modules/.bin/hyperframes"
    gsap=work/"node_modules/gsap/dist/gsap.min.js"
    for tool in ("npm","ffmpeg","ffprobe"):
        if not shutil.which(tool): raise SystemExit("Missing "+tool)
    if not hf.is_file() or not gsap.is_file(): raise SystemExit("Missing workspace HyperFrames or GSAP")
    out.mkdir(parents=True,exist_ok=False)
    deps=work/"creative-lab-deps"
    deps.mkdir(exist_ok=True)
    three=deps/"node_modules/three"
    pkg=three/"package.json"
    if not pkg.exists() or json.loads(pkg.read_text())["version"]!=THREE_VERSION:
        run("npm","install","--prefix",deps,"--no-audit","--no-fund","--save-exact","three@"+THREE_VERSION)
    project=out/"composition"
    vendor=project/"vendor"
    vendor.mkdir(parents=True)
    shutil.copy2(gsap,vendor/"gsap.min.js")
    # Modern Three.js module imports its sibling core module.
    for file in (three/"build").glob("*.js"):
        shutil.copy2(file,vendor/file.name)
    shutil.copy2(three/"LICENSE",vendor/"three-LICENSE.txt")
    if a.version >= 3:
        shutil.copytree(three/"examples/jsm",project/"addons")
        import os
        for js in (project/"addons").rglob("*.js"):
            relative = os.path.relpath(vendor/"three.module.js",js.parent).replace(os.sep,"/")
            if not relative.startswith("."): relative="./"+relative
            source=js.read_text(encoding="utf-8")
            updated=source.replace("from 'three'","from '"+relative+"'").replace('from "three"','from "'+relative+'"')
            if updated!=source: js.write_text(updated,encoding="utf-8")
    entry=project/"index.html"
    shutil.copy2(Path(__file__).with_name({1:"document_vectors.html",2:"document_vectors_v2.html",3:"document_vectors_v3.html",4:"document_vectors_v4.html"}[a.version]),entry)
    cues=soundtrack(out/"soundtrack.wav",a.version)
    (out/"audio_cues.json").write_text(json.dumps(cues,indent=2))
    run(hf,"lint",entry,cwd=project)
    run(hf,"render","--composition=index.html","--workers=1","--low-memory-mode","--quality=draft","--fps=30","--frames-cache-dir=off","--no-best-effort","--output="+str(out/"base.mp4"),cwd=project)
    run("ffmpeg","-v","error","-i",out/"base.mp4","-i",out/"soundtrack.wav","-map","0:v:0","-map","1:a:0","-c:v","copy","-af","loudnorm=I=-16:TP=-1.5:LRA=7","-c:a","aac","-b:a","192k","-shortest",out/"review.mp4")
    run("ffprobe","-v","error","-show_entries","format=duration,size:stream=codec_name,width,height,r_frame_rate","-of","json",out/"review.mp4")
    print("VIDEO:",out/"review.mp4")
if __name__=="__main__":
    main()
