"""Local review audio pipeline. Requires openai, faster-whisper, ffmpeg.
No publishing. OpenAI receives only the public benchmark narration.
"""
import argparse
import hashlib
import json
import math
import struct
import subprocess
import wave
from pathlib import Path

NARRATION = "When a Salesforce record changes, a change event is published. Listening systems react."
RATE = 48000

def synth(path, kind):
    duration = {"digital_ping": .22, "event_whoosh": .55, "soft_impact": .3}[kind]
    samples = []
    for i in range(int(RATE * duration)):
        t = i / RATE
        p = t / duration
        env = min(1, t / .012) * (1-p)**2
        if kind == "digital_ping":
            signal = math.sin(2*math.pi*880*t) + .3*math.sin(2*math.pi*1320*t)
        elif kind == "event_whoosh":
            signal = math.sin(2*math.pi*(180*t+900*t*t)) * math.sin(math.pi*p)
        else:
            signal = math.sin(2*math.pi*(95*t-65*t*t))
        samples.append(struct.pack("<h", int(10000*env*signal)))
    with wave.open(str(path), "wb") as f:
        f.setparams((1,2,RATE,0,"NONE","not compressed"))
        f.writeframes(b"".join(samples))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output",required=True)
    p.add_argument("--voice",default="onyx")
    p.add_argument("--sfx-only",action="store_true")
    a=p.parse_args()
    out=Path(a.output).expanduser().resolve()
    out.mkdir(parents=True,exist_ok=True)
    assets={}
    for kind in ("digital_ping","event_whoosh","soft_impact"):
        path=out/(kind+".wav")
        synth(path,kind)
        assets[kind]={"path":path.name,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"license":"Original procedural synthesis; no third-party samples","source":"produce_audio.py","approved":False}
    (out/"sfx_manifest.json").write_text(json.dumps({"assets":assets},indent=2))
    if a.sfx_only:
        return
    from openai import OpenAI
    from faster_whisper import WhisperModel
    narration=out/"narration.wav"
    with OpenAI().audio.speech.with_streaming_response.create(model="gpt-4o-mini-tts",voice=a.voice,input=NARRATION,response_format="wav",instructions="Clear confident technical explainer, brisk but natural.") as response:
        response.stream_to_file(narration)
    duration=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",str(narration)],text=True))
    if duration>6.8:
        raise ValueError(f"Narration is {duration:.2f}s; revise script or extend composition, do not truncate.")
    model=WhisperModel("base",device="cpu",compute_type="int8")
    segments,_=model.transcribe(str(narration),word_timestamps=True,language="en")
    words=[{"word":w.word.strip(),"start":w.start,"end":w.end} for s in segments for w in (s.words or [])]
    if not words:
        raise ValueError("No aligned words")
    (out/"alignment.json").write_text(json.dumps({"voice":a.voice,"duration":duration,"words":words},indent=2))
    cmd=["ffmpeg","-y","-i",str(narration)]
    for kind in assets:
        cmd+=["-i",str(out/(kind+".wav"))]
    cmd+=["-filter_complex","[0:a]apad=whole_dur=7[n];[1:a]volume=0.16,adelay=1200:all=1[p];[2:a]volume=0.12,adelay=2000:all=1[w];[3:a]volume=0.15,adelay=4200:all=1[i];[n][p][w][i]amix=inputs=4:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7[a]","-map","[a]","-t","7","-ar","48000",str(out/"mix.wav")]
    subprocess.run(cmd,check=True)

if __name__=="__main__":
    main()
