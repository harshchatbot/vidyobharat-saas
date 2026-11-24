"""Experimental spatial IR adapter; preserves existing editorial plan."""
from cinematography import compile_camera
import re

def compile_spatial(plan, words, total_frames):
    objects=[]
    beats=[]
    for i,s in enumerate(plan["shots"]):
        start,end=s["start_frame"],s["end_frame"]
        if not 0<=start<end<=total_frames:
            raise ValueError("Invalid shot bounds")
        labels=s.get("graphic_labels") or s.get("items") or []
        if s.get("motion_graphic")=="none" and s["template"] not in ("workflow","comparison"):
            labels=[]
        labels=labels[:4]
        oid=f"shot_{i}"
        objects.append({"id":oid,"position":[0,0,0],"start":start,"end":end,"kind":"subject","text":s["headline"]})
        subject=objects[-1]
        subject["position"]=[0,1.25,0]
        subject["rotation"]=[0,-5,0]
        # Only use numbers already present in the editorial headline.
        match=re.match(r"^(\d[\d,.]*%?)\s+(.+)$",s["headline"])
        if match:
            subject.update(kind="stat",text=match.group(1),subtitle=match.group(2))
        if s["template"]=="github_reveal" and s.get("detail"):
            objects.append({"id":oid+"_repo","position":[0,-1.2,-.5],"start":min(start+8,end-1),"end":end,"kind":"terminal","text":s["detail"],"rotation":[-4,8,-2]})
        if s.get("motion_graphic") in ("network","orbit","signal") and labels:
            objects.append({"id":oid+"_wire","position":[-2.3,.1,-3],"start":start,"end":end,"kind":"wireframe","text":"","rotation":[12,18,-8]})
            for j,label in enumerate(labels):
                objects.append({"id":f"{oid}_ambient_{j}","position":[(j%2*2-1)*3.5,1.7-(j//2)*1.2,-4-j*.25],"start":start,"end":end,"kind":"ambient_tag","text":label,"rotation":[0,12,-5+j*3]})
        for field,kind,pos in (("product_asset","media",[0,-1.5,-1]),("background_asset","background",[0,0,-5]),("overlay_asset","overlay",[0,0,1])):
            asset=s.get(field,"none")
            if asset!="none":
                objects.append({"id":f"{oid}_{kind}","position":pos,"start":start,"end":end,"kind":kind,"asset":asset,"text":"","parent":oid})
        intent={"github_reveal":"introduce","product_demo":"detail","comparison":"compare","workflow":"explain","reaction":"humour"}.get(s["template"],"reveal")
        beats.append({"frame":start,"target":oid,"intent":intent})
        for j,label in enumerate(labels):
            x=(-1.65 if j%2==0 else 1.65) if len(labels)>1 else 0
            onset=start+min(end-start-1,round((j+1)*(end-start)/(len(labels)+1)))
            # Prefer an actual spoken label onset when available.
            tokens=set(label.lower().split())
            matches=[round(w["start"]*30) for w in words if w["word"].lower().strip(".,!?") in tokens and start<=round(w["start"]*30)<end]
            if matches: onset=matches[0]
            nid=f"{oid}_node_{j}"
            objects.append({"id":nid,"position":[x,-.65-(j//2)*1.35,-1.5],"rotation":[-5,(-1 if j%2==0 else 1)*12,(-1 if j%2==0 else 1)*4],"start":onset,"end":end,"kind":"panel","entrance":"pop","text":label,"parent":oid})
        nodes=[o for o in objects if o.get("parent")==oid and o["kind"]=="panel"]
        for o in sorted(nodes,key=lambda x:x["start"]):
            if o["start"]-beats[-1]["frame"]>=18 and end-o["start"]>=12:
                beats.append({"frame":o["start"],"target":o["id"],"intent":"explain"})
    return {"style":"cinematic_editorial_2_5d","version":2,"fps":30,"total_frames":total_frames,"objects":objects,"camera":compile_camera(objects,beats,total_frames)}
