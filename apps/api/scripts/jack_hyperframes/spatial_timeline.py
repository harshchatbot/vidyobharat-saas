"""Experimental spatial IR adapter; preserves existing editorial plan."""
from cinematography import compile_camera

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
        for field,kind,pos in (("product_asset","media",[0,-1.5,-1]),("background_asset","background",[0,0,-5]),("overlay_asset","overlay",[0,0,1])):
            asset=s.get(field,"none")
            if asset!="none":
                objects.append({"id":f"{oid}_{kind}","position":pos,"start":start,"end":end,"kind":kind,"asset":asset,"text":"","parent":oid})
        intent={"github_reveal":"introduce","product_demo":"detail","comparison":"compare","workflow":"explain","reaction":"humour"}.get(s["template"],"reveal")
        beats.append({"frame":start,"target":oid,"intent":intent})
        for j,label in enumerate(labels):
            x=(j-(len(labels)-1)/2)*2.8
            onset=start+min(end-start-1,round((j+1)*(end-start)/(len(labels)+1)))
            # Prefer an actual spoken label onset when available.
            tokens=set(label.lower().split())
            matches=[round(w["start"]*30) for w in words if w["word"].lower().strip(".,!?") in tokens and onset<=round(w["start"]*30)<end]
            if matches: onset=matches[0]
            nid=f"{oid}_node_{j}"
            objects.append({"id":nid,"position":[x,-1.4,-1.5],"start":onset,"end":end,"kind":"panel","text":label,"parent":oid})
        nodes=[o for o in objects if o.get("parent")==oid and o["kind"]=="panel"]
        for o in sorted(nodes,key=lambda x:x["start"]):
            if o["start"]-beats[-1]["frame"]>=18 and end-o["start"]>=12:
                beats.append({"frame":o["start"],"target":o["id"],"intent":"explain"})
    return {"version":1,"fps":30,"total_frames":total_frames,"objects":objects,"camera":compile_camera(objects,beats,total_frames)}
