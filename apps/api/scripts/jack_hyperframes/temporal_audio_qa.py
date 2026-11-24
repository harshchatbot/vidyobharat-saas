"""Objective diagnostics; proxies are not perceptual quality scores."""
import json, math, re, subprocess
from pathlib import Path

def inspect(video, root):
    root=Path(root)
    raw=subprocess.check_output(["ffmpeg","-v","error","-i",str(video),"-an","-vf","fps=10,scale=96:170,format=gray","-f","rawvideo","-"])
    size=96*170
    frames=[raw[i:i+size] for i in range(0,len(raw)-size+1,size)]
    changes=[sum(abs(x-y) for x,y in zip(a,b))/size for a,b in zip(frames,frames[1:])]
    log=subprocess.run(["ffmpeg","-hide_banner","-i",str(video),"-vn","-af","loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json","-f","null","-"],capture_output=True,text=True,check=True).stderr
    match=re.findall(r'\{\s*"input_i".*?\}',log,re.S)
    metrics=json.loads(match[-1]) if match else {}
    def number(key):
        try:
            v=float(metrics[key])
            return v if math.isfinite(v) else None
        except (KeyError,ValueError,TypeError): return None
    loudness,peak=number("input_i"),number("input_tp")
    ir=json.loads((root/"spatial_timeline.json").read_text()) if (root/"spatial_timeline.json").exists() else {}
    cues=json.loads((root/"audio_cues.json").read_text()) if (root/"audio_cues.json").exists() else []
    anchors=[o["start"] for o in ir.get("objects",[]) if o["kind"] in ("stat","panel","terminal","media")]
    anchors.extend(k["frame"] for k in ir.get("camera",[]))
    if ir.get("cta"): anchors.append(ir["cta"]["start"])
    offsets=[min(abs(c["frame"]-a) for a in anchors)*1000/30 for c in cues] if anchors else []
    issues=[]
    if loudness is None or abs(loudness+14)>2: issues.append("Integrated loudness outside target -14 +/-2 LUFS or unavailable")
    if peak is None or peak>-1: issues.append("True peak above -1 dBTP or unavailable")
    return {"temporal":{"sample_fps":10,"frames":len(frames),"mean_frame_change":sum(changes)/len(changes) if changes else None,"near_static_timestamps":[round((i+1)/10,2) for i,v in enumerate(changes) if v<.15],"large_change_timestamps":[round((i+1)/10,2) for i,v in enumerate(changes) if v>35],"interpretation":"Frame differences are motion proxies, not camera or animation quality scores."},"audio":{"integrated_lufs":loudness,"true_peak_dbtp":peak,"loudness_range_lu":number("input_lra"),"cue_count":len(cues),"scheduled_cues_within_200ms_of_visual_anchor":sum(v<=200 for v in offsets),"cue_offsets_ms":offsets,"interpretation":"Scheduled alignment only; audible onset, masking and perceptual suitability require further review."},"issues":issues}
