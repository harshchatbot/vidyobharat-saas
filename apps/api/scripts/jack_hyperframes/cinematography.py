"""Experimental camera IR compiler. Pure, deterministic, independent of rendering."""
import math

def compile_camera(objects, beats, total_frames):
    """Objects have id, position [x,y,z]; beats have frame, target, intent.
    Coordinates are world units. Output is a continuous keyframe track.
    """
    if not isinstance(total_frames,int) or total_frames<2:
        raise ValueError("Invalid duration")
    positions={}
    for obj in objects:
        p=obj["position"]
        if obj["id"] in positions or len(p)!=3 or not all(isinstance(x,(int,float)) and math.isfinite(x) and abs(x)<=20 for x in p):
            raise ValueError("Invalid object position or duplicate id")
        positions[obj["id"]]=list(p)
    offsets={"introduce":(0,2,10),"explain":(3,2,10),"compare":(4,2,12),
             "detail":(0,1,7),"reveal":(0,3,13),"humour":(0,1,8),"hold":(0,2,10)}
    keys=[]
    for beat in beats:
        frame=beat["frame"]
        if not isinstance(frame,int) or not 0<=frame<total_frames or (keys and frame<=keys[-1]["frame"]):
            raise ValueError("Camera anchors must be ordered and in range")
        target=positions[beat["target"]]
        offset=offsets[beat["intent"]]
        position=[a+b for a,b in zip(target,offset)]
        if beat["intent"]=="hold" and keys:
            position=keys[-1]["position"][:]
            target=keys[-1]["look_at"][:]
        keys.append({"frame":frame,"position":position,"look_at":target,
                     "target_id":beat["target"],"easing":"smoothstep","fov":45})
    if not keys: raise ValueError("Camera requires at least one anchor")
    if keys[0]["frame"]!=0: keys.insert(0,{**keys[0],"frame":0})
    if keys[-1]["frame"]!=total_frames-1: keys.append({**keys[-1],"frame":total_frames-1})
    return keys

def sample_camera(keys, frame):
    """Interpolate without accumulated state, including arbitrary frame seeks."""
    if frame<=keys[0]["frame"]: return dict(keys[0])
    if frame>=keys[-1]["frame"]: return dict(keys[-1])
    for a,b in zip(keys,keys[1:]):
        if a["frame"]<=frame<=b["frame"]:
            t=(frame-a["frame"])/(b["frame"]-a["frame"])
            t=t*t*(3-2*t)
            return {"frame":frame,**{k:[x+(y-x)*t for x,y in zip(a[k],b[k])] for k in ("position","look_at")},"fov":a["fov"]+(b["fov"]-a["fov"])*t}
    raise ValueError("Invalid camera track")
