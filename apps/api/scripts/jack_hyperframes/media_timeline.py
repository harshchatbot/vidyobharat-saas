"""Local review media compositor for a rendered HyperFrames base video.
Manifest maps approved asset IDs to local paths, kinds and provenance.
No network downloads or production writes.
"""
import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path
from app.services.harshverse.jack_cinematic_director import validate_plan

def probe(path):
    return json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(path)],text=True))

def verified_assets(manifest_path):
    root=Path(manifest_path).resolve()
    result={}
    for key,a in json.loads(root.read_text())["assets"].items():
        if a.get("approved") is not True:
            continue
        if not all(a.get(k) for k in ("license","source","sha256","evidence")):
            raise ValueError("Missing provenance: "+key)
        if a["license"].lower() in ("unknown","unverified","pending"):
            raise ValueError("Unverified license: "+key)
        path=(root.parent/a["path"]).resolve()
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=a["sha256"].lower():
            raise ValueError("Asset checksum mismatch: "+key)
        result[key]=dict(a,path=path)
    return result

def captions(words,duration):
    lines=["[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","[V4+ Styles]","Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding","Style: Default,Arial,52,&H00FFFFFF,&H0000FFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,90,90,320,1","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    def ts(t):
        n=round(t*100); h,n=divmod(n,360000); m,n=divmod(n,6000); s,c=divmod(n,100)
        return f"{h}:{m:02}:{s:02}.{c:02}"
    last=0
    for w in words:
        s,e=float(w["start"]),float(w["end"])
        if not all(math.isfinite(x) for x in (s,e)) or not 0<=s<e<=duration or s<last-.02:
            raise ValueError("Invalid word alignment")
        last=e
        word=w["word"].replace("\\","").replace("{","").replace("}","").replace("\n"," ")
        lines.append(f"Dialogue: 0,{ts(s)},{ts(e)},Default,,0,0,0,,{word}")
    if not words: raise ValueError("Missing narration alignment")
    return "\n".join(lines)+"\n"

def compose(plan,assets,alignment,base,narration,output):
    duration=float(plan["duration"])
    validate_plan(plan,duration,set(assets))
    output=Path(output).resolve()
    if output.exists(): raise FileExistsError(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    for path in (base,narration):
        if not Path(path).is_file(): raise FileNotFoundError(path)
    if abs(float(probe(base)["format"]["duration"])-duration)>.1:
        raise ValueError("Base video duration mismatch")
    if float(probe(narration)["format"]["duration"])>duration+.02:
        raise ValueError("Narration exceeds timeline")
    ass=output.with_suffix(".ass")
    ass.write_text(captions(alignment["words"],duration))
    args=["ffmpeg","-n","-i",str(Path(base).resolve()),"-i",str(Path(narration).resolve())]
    filters=["[0:v]scale=1080:1920,setsar=1[v0]","[1:a]aresample=48000,apad[narr]"]
    audio=["[narr]"]; video="v0"; index=2
    for shot in plan["shots"]:
        for cue in shot["assets"]:
            a=assets[cue["id"]]; kind=a["kind"]; at=float(cue["at"])
            end=float(shot["end"]); length=end-at
            if kind not in ("sfx","music","overlay","troll","mascot","product_visual","broll"):
                raise ValueError("Unsupported media kind: "+kind)
            if kind in ("sfx","music"):
                args+=["-i",str(a["path"])]
                gain=.12 if kind=="music" else .18
                filters.append(f"[{index}:a]atrim=duration={length},asetpts=PTS-STARTPTS,aresample=48000,volume={gain},adelay={round(at*1000)}:all=1[a{index}]")
                audio.append(f"[a{index}]")
            else:
                if a["path"].suffix.lower() in (".png",".jpg",".jpeg",".webp"):
                    args+=["-loop","1","-framerate","30"]
                args+=["-i",str(a["path"])]
                width=1080 if kind=="overlay" else 760
                filters.append(f"[{index}:v]trim=duration={length},setpts=PTS-STARTPTS+{at}/TB,scale={width}:-2,format=rgba[m{index}]")
                filters.append(f"[{video}][m{index}]overlay=(W-w)/2:(H-h)/2:eof_action=pass:repeatlast=0:enable='between(t,{at},{end})'[v{index}]")
                video=f"v{index}"
            index+=1
    # Relative subtitle filename avoids filter escaping of arbitrary directory names.
    safe_ass="captions_"+hashlib.sha256(ass.read_bytes()).hexdigest()[:16]+".ass"
    subtitle=output.parent/safe_ass
    subtitle.write_bytes(ass.read_bytes())
    filters.append(f"[{video}]subtitles={safe_ass}[finalv]")
    filters.append("".join(audio)+f"amix=inputs={len(audio)}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7[finala]")
    args+=["-filter_complex",";".join(filters),"-map","[finalv]","-map","[finala]","-t",str(duration),"-r","30","-c:v","libx264","-pix_fmt","yuv420p","-crf","18","-c:a","aac","-b:a","192k",str(output)]
    subprocess.run(args,cwd=output.parent,check=True)
    return output

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("plan","manifest","alignment","base","narration","output"):
        p.add_argument("--"+name,required=True)
    a=p.parse_args()
    compose(json.loads(Path(a.plan).read_text()),verified_assets(a.manifest),json.loads(Path(a.alignment).read_text()),a.base,a.narration,a.output)
