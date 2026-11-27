"""B3 production storyboard: report compiled instructions, not imagined execution."""
import json
from pathlib import Path

def compile_storyboard(plan, spatial, words, semantic, bible):
    total=spatial["total_frames"]
    fps=spatial["fps"]
    if fps!=30: raise ValueError("Expected 30 fps")
    shots=plan["shots"]
    keys=[f"beat_{i:02d}" for i in range(len(shots))]
    if set(keys)!=set(semantic): raise ValueError("Semantic beat coverage mismatch")
    result=[]
    previous=0
    for i,shot in enumerate(shots):
        start,end=shot["start_frame"],shot["end_frame"]
        if not 0<=start<end<=total or start<previous:
            raise ValueError("Invalid or overlapping shot bounds")
        previous=end
        oid=f"shot_{i}"
        objects=[o for o in spatial["objects"] if o["id"]==oid or o["id"].startswith(oid+"_")]
        if not any(o["id"]==oid for o in objects): raise ValueError("Missing primary subject")
        for o in objects:
            if not start<=o["start"]<o["end"]<=end: raise ValueError("Object outside shot")
        spoken=[w for w in words if start<=round(w["start"]*fps)<end]
        scene=semantic[keys[i]]
        result.append({"id":oid,"start_frame":start,"end_frame":end,"duration_seconds":(end-start)/fps,
            "spoken_text":" ".join(w["word"] for w in spoken),
            "word_onsets":[{"word":w["word"],"frame":round(w["start"]*fps)} for w in spoken],
            "intent":scene["viewer_takeaway"],"planned_action":scene["action"],
            "planned_object_id":scene["object_id"],"planned_carry_from":scene["carry_from"],
            "layout":shot["template"],"requested_camera":shot.get("camera"),
            "requested_transition":shot.get("transition"),"requested_typography":shot.get("typography"),
            "objects":[dict(o,layer="primary" if o["id"]==oid else "background" if o["position"][2]<-2 else "support") for o in objects],
            "lighting":[x for x in spatial["lighting"] if x["target"]==oid],
            "sound_events":shot.get("events",[]),
            "limitations":{"persistent_objects_executed":False,"planned_action_verified":False,"transition_execution_verified":False,
                "layout_differs_from_hint":shot["template"]!=scene["renderer_hint"]["template"]}})
    return {"version":"B3.0","fps":fps,"total_frames":total,"creative_bible":bible,
        "camera_track":spatial["camera"],"shots":result,"status":"compiled_not_render_verified"}

def write_storyboard(output,plan,spatial,words,semantic,bible):
    result=compile_storyboard(plan,spatial,words,semantic,bible)
    (Path(output)/"shot_storyboard.json").write_text(json.dumps(result,indent=2))
    return result
