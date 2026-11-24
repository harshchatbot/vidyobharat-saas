"""Local owner-curated library. No licensing checks or asset modifications."""
import hashlib, json, math, re
from pathlib import Path

def catalog(root):
    root=Path(root).resolve()
    result={}
    folders={"sfx":"sfx","music":"music","broll":"broll","overlays":"overlay","greenscreen":"greenscreen"}
    audio={".wav",".mp3",".m4a",".aac",".ogg",".flac"}
    visual={".mp4",".mov",".webm",".png",".jpg",".jpeg",".webp"}
    for folder,kind in folders.items():
        for p in sorted((root/folder).rglob("*")):
            if not p.is_file() or not p.resolve().is_relative_to(root): continue
            if p.suffix.lower() not in (audio if kind in ("sfx","music") else visual): continue
            rel=p.relative_to(root)
            if any(re.search(r"green[ _-]*screen|chroma[ _-]*key", part, re.I) for part in rel.parts): continue
            meta={}
            try:
                side=Path(str(p)+".asset.json")
                if side.is_file():
                    value=json.loads(side.read_text())
                    if isinstance(value,dict): meta=value
            except (ValueError,OSError): pass
            tags=meta.get("tags",[])
            if not isinstance(tags,list): tags=[]
            result[rel.as_posix()]={"path":p,"kind":kind,"title":p.stem,"description":str(meta.get("description","")),"tags":[*rel.parts[:-1],*map(str,tags)],"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"origin":"owner_curated"}
    return result

def rank(client, queries, assets):
    if not assets or not queries: return [[] for _ in queries]
    keys=list(assets)
    descriptions=[" ".join([assets[k]["kind"],assets[k]["title"],assets[k].get("description","")," ".join(assets[k].get("tags",[]))]) for k in keys]
    vectors=[]
    inputs=queries+descriptions
    for i in range(0,len(inputs),128):
        vectors.extend(x.embedding for x in sorted(client.embeddings.create(model="text-embedding-3-small",input=inputs[i:i+128]).data,key=lambda x:x.index))
    def cosine(a,b):
        return sum(x*y for x,y in zip(a,b))/(math.sqrt(sum(x*x for x in a)*sum(y*y for y in b)) or 1)
    return [sorted(((k,cosine(q,v)) for k,v in zip(keys,vectors[len(queries):])),key=lambda x:-x[1]) for q in vectors[:len(queries)]]

def direct_audio(client, plan, inventory, script):
    """Restrained editorial sound: preserve cue intent, never substitute memes."""
    allowed={"soft_impact","deep_hit","short_whoosh","paper_swipe","digital_ping","glitch_tick","interface_click","comic_pop","comic_drop","riser","sparkle","shutter"}
    last=-90
    counts={}
    for shot in plan["shots"]:
        for e in sorted(shot["events"],key=lambda e:e["frame"]):
            key=e["sfx"]
            if key=="none": continue
            if key not in allowed or e["frame"]-last<90 or counts.get(key,0)>=3:
                e["sfx"]="none"
                continue
            last=e["frame"]
            counts[key]=counts.get(key,0)+1
    music={k:v for k,v in inventory.items() if v["kind"]=="music"}
    ranked=rank(client,["subtle instrumental background music for engaging technology explainer, clear narration, "+script[:700]],music)[0]
    return ranked[0][0] if ranked and ranked[0][1]>=.30 else None
