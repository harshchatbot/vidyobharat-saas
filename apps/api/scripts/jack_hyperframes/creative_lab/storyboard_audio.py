"""Storyboard audio adapter. Music is optional, explicitly supplied by owner."""
import json,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from original_sfx import generate
from approved_selection import automatic_music, authorized_music, music_bed
def schedule(plan):
    mapping={"assemble":"soft_impact","disassemble":"paper_swipe","unlock":"interface_click","rotate":"short_whoosh","move":"short_whoosh","reveal":"digital_ping"}
    candidates=[]
    for obj in plan["objects"]:
        for track in obj["tracks"]:
            key=mapping.get(track["action"])
            if key: candidates.append((track["start_frame"],key,obj["id"]))
    result=[]
    for frame,key,obj in sorted(candidates):
        if not 0<=frame<plan["total_frames"]: continue
        if result and frame-result[-1]["frame"]<45: continue
        if sum(c["sfx"]==key for c in result)>=3: continue
        result.append(dict(frame=frame,sfx=key,object_id=obj))
    return result
def mix(plan,narration,out,music=None):
    out=Path(out);duration=plan["total_frames"]/30
    selected=None
    manifest=out.parent/"approved_assets.json"
    if music is not None:
        selected=authorized_music(manifest if manifest.is_file() else None,music)
    elif manifest.is_file():
        scenes=plan.get("scenes",[])
        script=" ".join(str(scene.get("spoken_text","")) for scene in scenes)
        selected=automatic_music(manifest,scenes,script,duration,plan.get("creative_bible"))
        if selected: music=selected["path"]
    cues=schedule(plan);sounds=generate(out/"original_sfx")
    cmd=["ffmpeg","-v","error","-i",str(out/"base.mp4"),"-i",str(narration)]
    filters=["[1:a]aresample=48000,apad,atrim=duration="+str(duration)+"[voice]"]
    labels=["[voice]"];idx=2
    if music:
        cmd+=["-stream_loop","-1","-i",str(music)]
        filters[0]=filters[0]+";[voice]asplit=2[vmain][side]"
        filters.extend(music_bed(idx,duration))
        labels=["[vmain]","[music]"];idx+=1
    for j,c in enumerate(cues):
        cmd+=["-i",str(sounds[c["sfx"]]["path"])]
        ms=round(c["frame"]*1000/30)
        filters.append(f"[{idx}:a]volume=0.12,adelay={ms}:all=1[s{j}]")
        labels.append(f"[s{j}]");idx+=1
    filters.append("".join(labels)+f"amix=inputs={len(labels)}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7,aresample=48000[a]")
    subprocess.run(cmd+["-filter_complex",";".join(filters),"-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac","-t",str(duration),str(out/"review.mp4")],check=True)
    (out/"audio_cues.json").write_text(json.dumps(cues,indent=2))
    (out/"audio_manifest.json").write_text(json.dumps(dict(music=str(music) if music else None,music_rights=selected if selected else ("owner supplied; not independently verified" if music else None),cues=cues),indent=2))
