"""Isolated V2 integration benchmark; never writes V1 output or publishes."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from openai import OpenAI
from tech_editorial import direct
from media_timeline import probe, verified_assets
import shutil
from visual_review import review
from stage_mascot_v2 import stage

CAPS={"templates":["hero_title","github_reveal","workflow","comparison","reaction"],
      "cameras":["dolly_in","pull_back","pan_left","pan_right","orbit","snap_zoom","static"],"events":["pulse"]}

def shortlist(client, script, assets, limit=12, words=None, duration=None):
    if not assets: return {}
    from app.services.harshverse.jack_v2.director import fixed_beats
    keys=list(assets)
    queries=[script]
    if words and duration:
        starts=fixed_beats(words,duration)
        queries=[" ".join(w["word"] for w in words[i:j]) for i,j in zip(starts,starts[1:]+[len(words)])]
    descriptions=[" ".join([str(assets[k].get("title",k)),str(assets[k].get("description","")), " ".join(assets[k].get("tags",[]))]) for k in keys]
    vectors=[x.embedding for x in sorted(client.embeddings.create(model="text-embedding-3-small",input=queries+descriptions).data,key=lambda x:x.index)]
    def cosine(q,v):
        return sum(a*b for a,b in zip(q,v))/(math.sqrt(sum(a*a for a in q)*sum(b*b for b in v)) or 1)
    selected={}
    for q in vectors[:len(queries)]:
        for kind in ("product_visual",):
            ranked=sorted(((k,cosine(q,v)) for k,v in zip(keys,vectors[len(queries):]) if assets[k]["kind"]==kind),key=lambda kv:kv[1],reverse=True)
            for k,score in ranked[:2]:
                if score>=.40: selected[k]=max(score,selected.get(k,0))
    return {k:assets[k] for k in sorted(selected,key=selected.get,reverse=True)[:limit]}

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
    if a.preview_seconds is not None:
        if not 5<=a.preview_seconds<=30 or a.preview_start<0 or a.preview_start+a.preview_seconds>duration-.35:
            raise ValueError("Preview must be 5–30 seconds within narration")
        lo,hi=a.preview_start,a.preview_start+a.preview_seconds
        selected=[w for w in words if w["start"]>=lo and w["end"]<=hi]
        if not selected: raise ValueError("No complete words in preview")
        lo,hi=selected[0]["start"],selected[-1]["end"]
        clip=out/"preview_narration.wav"
        subprocess.run(["ffmpeg","-n","-i",str(narration),"-ss",str(lo),"-t",str(hi-lo),"-c:a","pcm_s16le",str(clip)],check=True)
        narration=clip
        words=[dict(w,start=w["start"]-lo,end=w["end"]-lo) for w in selected]
        script=" ".join(w["word"] for w in words)
        duration=math.ceil((hi-lo+.35)*30)/30
        (out/"preview_window.json").write_text(json.dumps({"start":lo,"end":hi,"preview_only":True},indent=2))
    client=OpenAI()
    project=workspace/"cdc-benchmark"
    poses=stage(a.mascot_manifest,project) if a.mascot_manifest else {}
    caps=dict(CAPS,poses=["hidden",*poses])
    products={}
    product_context={}
    inventory={}
    if getattr(a,"assets_root",None):
        from creative_assets import catalog
        inventory=catalog(a.assets_root)
        (out/"creative_catalog.json").write_text(json.dumps(inventory,default=str,indent=2))
    media={**inventory,**(verified_assets(a.product_manifest) if a.product_manifest else {})}
    if media:
        for key,item in shortlist(client,script,{k:v for k,v in media.items() if v["kind"] in ("product_visual",)},words=words,duration=duration).items():
            if item["kind"] not in ("product_visual",) or item["path"].suffix.lower() not in (".png",".jpg",".jpeg",".webp",".mp4",".webm",".mov"):
                continue
            name=item["sha256"]+item["path"].suffix.lower()
            dest=project/"assets"/"jack-products"/name
            dest.parent.mkdir(parents=True,exist_ok=True)
            if dest.suffix.lower() in (".mp4",".webm",".mov"):
                # Extract deterministic silent visual frames; browser video seeking is avoided.
                frames=dest.with_suffix("")
                frames.mkdir(exist_ok=True)
                subprocess.run(["ffmpeg","-y","-i",str(item["path"]),"-t","5","-vf","fps=15,scale=720:-2","-an",str(frames/"%04d.jpg")],check=True)
                images=sorted(frames.glob("*.jpg"))
                if not images: continue
            else:
                shutil.copyfile(item["path"],dest)
            product_context[key]={k:item.get(k) for k in ("title","description","tags","kind")}
            products[key]={"src":"assets/jack-products/"+name,"kind":"image"}
            if dest.suffix.lower() in (".mp4",".webm",".mov"):
                products[key]={"src":str(images[0].relative_to(project)),"kind":"image","frames":[str(x.relative_to(project)) for x in images]}
        if any(v.get("kind")=="product_visual" for v in product_context.values()):
            caps["templates"]=[*CAPS["templates"],"product_demo"]
    caps["product_assets"]=list(products)
    caps["product_context"]=product_context
    sounds={k:v for k,v in verified_assets(a.sfx_manifest).items() if v["kind"]=="sfx"} if a.sfx_manifest else {}
    sounds={**{k:v for k,v in inventory.items() if v["kind"]=="sfx"},**sounds}
    caps["sfx"]=list(sounds)
    caps["sfx_context"]={k:{f:v.get(f) for f in ("title","description","tags")} for k,v in sounds.items()}
    caps["research"]=json.loads((source/"research.json").read_text()) if (source/"research.json").is_file() else []
    from original_sfx import generate
    sounds.update(generate(out/"original_sfx"))
    caps["sfx"]=list(k for k in sounds if k in {"soft_impact","deep_hit","short_whoosh","paper_swipe","digital_ping","glitch_tick","interface_click","comic_pop","comic_drop","riser","sparkle","shutter"})
    caps["sfx_context"]={k:v for k,v in caps["sfx_context"].items() if k in caps["sfx"]}
    caps["sfx_context"].update({k:{"title":k} for k in caps["sfx"]})
    from discover_media import discover
    (out/"media_candidates.json").write_text(json.dumps({"candidates":discover(caps["research"])},indent=2))
    plan=direct(script,words,duration,caps,client,model=a.model)
    from sound_direction import direct_sound
    direct_sound(plan["shots"],{k:sounds[k] for k in caps["sfx"]})
    (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    from spatial_timeline import compile_spatial
    spatial=compile_spatial(plan,words,round(duration*30))
    engagement=source/"engagement_config.json"
    if a.preview_seconds is None and engagement.is_file() and (source/"resource_guide.pdf").is_file():
        config=json.loads(engagement.read_text())
        import re
        keyword=config["keyword"]
        if not re.fullmatch(r"[A-Z]{2,16}",keyword):
            raise ValueError("Invalid CTA keyword")
        matches=[round(w["start"]*30) for w in words if w["word"].strip(".,!?").lower()=="comment"]
        if matches:
            spatial["cta"]={"keyword":keyword,"start":min(matches[-1],spatial["total_frames"]-1),"end":spatial["total_frames"]}
    (out/"spatial_timeline.json").write_text(json.dumps(spatial,indent=2))
    if getattr(a,"spatial_preview",False):
        from spatial_sound import synchronize
        synchronize(plan,spatial,{k:v for k,v in sounds.items() if k in {"soft_impact","deep_hit","short_whoosh","paper_swipe","digital_ping","glitch_tick","interface_click","comic_pop","comic_drop","riser","sparkle","shutter"}})
        (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    from creative_assets import direct_audio
    music_key=direct_audio(client,plan,inventory,script)
    if not getattr(a,"music",None) and music_key:
        a.music=str(inventory[music_key]["path"])
    (out/"production_plan.json").write_text(json.dumps(plan,indent=2))
    (out/"asset_usage.json").write_text(json.dumps({"catalog_count":len(inventory),"music":str(a.music) if getattr(a,"music",None) else None,"visuals":[{"shot":i,"assets":[s.get(k) for k in ("product_asset","background_asset","overlay_asset") if s.get(k) not in (None,"none")]} for i,s in enumerate(plan["shots"])],"sfx":[e["sfx"] for s in plan["shots"] for e in s["events"] if e["sfx"]!="none"]},indent=2))
    project=workspace/"cdc-benchmark"
    entry=project/("jack-faceless-"+out.name+".html")
    if entry.exists(): raise FileExistsError(entry)
    template=Path(__file__).with_name("composition")/"tech_editorial.html"
    font_css=""
    for role in ("display","body"):
        supplied=getattr(a,role+"_font",None)
        if supplied:
            import hashlib
            font=Path(supplied).expanduser().resolve()
            if font.suffix.lower() not in (".ttf",".otf",".woff",".woff2"): raise ValueError("Unsupported font")
            name=hashlib.sha256(font.read_bytes()).hexdigest()+font.suffix.lower()
            dest=project/"assets"/"jack-fonts"/name
            dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(font,dest)
            font_css+="@font-face{font-family:Editorial"+role.title()+";src:url('assets/jack-fonts/"+name+"');font-display:block;}"
    if getattr(a,"display_font",None): font_css+=".scene[data-layout] .headline{font-family:EditorialDisplay,Inter,sans-serif;}"
    if getattr(a,"body_font",None): font_css+=".detail,.caption,.node{font-family:EditorialBody,Inter,sans-serif;}"
    data=json.dumps(plan["shots"],ensure_ascii=True).replace("<","\\u003c")
    entry.write_text(template.read_text().replace("__FONT_CSS__","").replace("</style>",font_css+"</style>").replace("__DURATION__",str(duration)).replace("__SHOTS__",data).replace("__PRODUCTS__",json.dumps(products).replace("<","\\u003c")).replace("__WORDS__",json.dumps(words).replace("<","\\u003c")))
    if getattr(a,"spatial_preview",False):
        spatial_template=template.with_name("spatial.html").read_text().replace("</style>",font_css+"</style>")
        entry.write_text(spatial_template.replace("__PRODUCTS__",json.dumps(products).replace("<","\\u003c")).replace("__DURATION__",str(duration)).replace("__SPATIAL__",json.dumps(spatial).replace("<","\\u003c")).replace("__WORDS__",json.dumps(words).replace("<","\\u003c")))
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
    args=["ffmpeg","-n","-i",str(base),"-i",str(narration)]
    filters=["[1:a]aresample=48000,apad[narr]"]
    tracks=["[narr]"]
    import re
    def cue_gain(key):
        name=key.lower()
        if re.search(r"impact|hit|thump|drop",name): return .32
        if re.search(r"whoosh|swipe|riser",name): return .25
        return .22
    (out/"audio_cues.json").write_text(json.dumps([{"frame":e["frame"],"seconds":e["frame"]/30,"sound":e["sfx"]} for shot in plan["shots"] for e in shot["events"] if e["sfx"]!="none"],indent=2))
    for shot in plan["shots"]:
        for event in shot["events"]:
            key=event["sfx"]
            if key=="none": continue
            idx=len(tracks)+1
            args+=["-i",str(sounds[key]["path"])]
            filters.append(f"[{idx}:a]aresample=48000,atrim=duration=0.8,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.005,volume={cue_gain(key)},adelay={round(event['frame']*1000/30)}:all=1[s{idx}]")
            tracks.append(f"[s{idx}]")
    if getattr(a,"music",None):
        music=Path(a.music).expanduser().resolve()
        idx=len(tracks)+1
        args+=["-stream_loop","-1","-i",str(music)]
        filters[0]="[1:a]aresample=48000,apad,asplit=2[narr][side]"
        filters.append(f"[{idx}:a]aresample=48000,volume=0.16,afade=t=in:st=0:d=0.35,afade=t=out:st={max(0,duration-.65)}:d=0.65[bed]")
        filters.append("[bed][side]sidechaincompress=threshold=0.018:ratio=10:attack=12:release=350[music]")
        tracks.append("[music]")
    filters.append("".join(tracks)+f"amix=inputs={len(tracks)}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7[a]")
    subprocess.run(args+["-filter_complex",";".join(filters),"-map","0:v:0","-map","[a]","-t",str(duration),"-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-ar","48000",str(final)],cwd=out,check=True)
    print("VIDEO:",final,flush=True)
    print(json.dumps(review(final,out/"qa",client=client),indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("source","workspace","output"): p.add_argument("--"+name,required=True)
    p.add_argument("--spatial-preview",action="store_true",help="Experimental spatial compositor; text and diagram objects only")
    p.add_argument("--mascot-manifest")
    p.add_argument("--assets-root")
    p.add_argument("--product-manifest")
    p.add_argument("--sfx-manifest")
    p.add_argument("--display-font",help="Local licensed headline font")
    p.add_argument("--body-font",help="Local licensed body font")
    p.add_argument("--music",help="Local music file with user-confirmed usage rights")
    p.add_argument("--preview-seconds",type=float)
    p.add_argument("--preview-start",type=float,default=0)
    p.add_argument("--model",default="gpt-4.1-mini")
    run(p.parse_args())
