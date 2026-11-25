"""Compile existing AI object storyboard into explicitly supported motion tracks."""
import math
from capabilities import KINDS,ACTIONS,REGISTRY,validate_action
def compile_motion(plan):
    if plan["fps"]!=30 or not 0<plan["total_frames"]<=2700: raise ValueError("Expected 30fps, max 90 seconds")
    objects={o["id"]:dict(o,tracks=[]) for o in plan["objects"]}
    if len(objects)!=len(plan["objects"]): raise ValueError("Duplicate object")
    cursor=0
    scenes=[]
    for s in plan["sequences"]:
        if s["start_frame"]!=cursor or not cursor<s["end_frame"]<=plan["total_frames"]: raise ValueError("Invalid sequence coverage")
        cursor=s["end_frame"]
        scenes.append({k:s[k] for k in ("title","spoken_text","start_frame","end_frame","camera","transition","lighting")})
        ids=list(dict.fromkeys(a["object_id"] for a in s["actions"]))
        if not ids or len(ids)>REGISTRY["max_objects"]: raise ValueError("Scene requires one to four objects")
        scenes[-1]["active_ids"]=ids
        scenes[-1]["primary_id"]=max(ids,key=lambda oid: sum(a["end_frame"]-a["start_frame"] for a in s["actions"] if a["object_id"]==oid))
        for a in s["actions"]:
            o=objects[a["object_id"]]
            validate_action(o["kind"],a["action"])
            if not s["start_frame"]<=a["start_frame"]<a["end_frame"]<=cursor: raise ValueError("Invalid action bounds")
            tracks=o["tracks"]
            prev=tracks[-1] if tracks else None
            if prev and (prev["end_frame"]>a["start_frame"] or any(prev["to_"+k]!=a["from_"+k] for k in ("position","scale","opacity"))): raise ValueError("Discontinuous track")
            spread=prev["spreadTo"] if prev else (1 if a["action"]=="assemble" else 0)
            rotation=prev["rotationTo"] if prev else 0
            tracks.append(dict(a,spreadFrom=spread,spreadTo=1 if a["action"]=="disassemble" else 0 if a["action"]=="assemble" else spread,rotationFrom=rotation,rotationTo=rotation+math.tau if a["action"]=="rotate" else rotation+math.pi/2 if a["action"]=="unlock" else rotation))
    if cursor!=plan["total_frames"] or any(not o["tracks"] for o in objects.values()): raise ValueError("Incomplete plan")
    return dict(fps=30,total_frames=cursor,background=plan["background"],capabilities=REGISTRY,objects=list(objects.values()),scenes=scenes,limitations=["Camera and lighting use renderer presets; requested transitions not executed","Illustrative geometry only","Unlock is a key-turn gesture, not a linked vault-opening animation"])

def preview(plan,seconds):
    import copy
    p=copy.deepcopy(plan)
    end=min(p["total_frames"],round(seconds*30))
    if end<1: raise ValueError("Empty preview")
    p["total_frames"]=end
    p["scenes"]=[dict(s,end_frame=min(s["end_frame"],end)) for s in p["scenes"] if s["start_frame"]<end]
    return p

def diagnostics(plan):
    findings=[]
    for i,s in enumerate(plan["scenes"]):
        tracks=[a for o in plan["objects"] for a in o["tracks"] if a["start_frame"]>=s["start_frame"] and a["start_frame"]<s["end_frame"]]
        if all(a["action"] in ("hold","reveal","fade") for a in tracks):
            findings.append({"scene":i,"issue":"Limited choreography","revision":"Add meaningful movement or transformation"})
        if s["end_frame"]-s["start_frame"]>180:
            findings.append({"scene":i,"issue":"Long scene","revision":"Consider shorter visual beats"})
    return {"findings":findings,"status":"advisory_not_creative_approval"}
