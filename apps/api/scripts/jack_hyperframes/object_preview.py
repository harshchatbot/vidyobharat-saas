"""Render an isolated illustrative object storyboard with deterministic SVG frames.
No product UI, no publication, no changes to existing compositor.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path
from collections import Counter
from xml.sax.saxutils import escape

def diagnostics(plan):
    actions=[a for s in plan["sequences"] for a in s["actions"]]
    counts=Counter(a["action"] for a in actions)
    kinds={o["id"]:o["kind"] for o in plan["objects"]}
    issues=[]
    if counts["reveal"]>len(actions)/2: issues.append("Reveal-heavy choreography")
    if all(a["to_position"][2]==0 and a["from_position"][2]==0 for a in actions): issues.append("No authored depth")
    if len({s["lighting"] for s in plan["sequences"]})==1: issues.append("Uniform lighting direction")
    for s in plan["sequences"]:
        for a in s["actions"]:
            if a["action"] in ("unlock","assemble","disassemble","rotate"): issues.append("Unsupported semantic action: "+a["action"])
    return {"action_counts":dict(counts),"object_kinds":dict(Counter(kinds.values())),"issues":issues,"status":"technical_diagnostics_not_creative_approval"}

def smooth(t):
    t=max(0,min(1,t))
    return t*t*(3-2*t)

def state(actions,frame):
    if frame<actions[0]["start_frame"]: return None
    a=actions[0]
    for candidate in actions:
        if candidate["start_frame"]<=frame: a=candidate
    t=smooth((frame-a["start_frame"])/max(1,a["end_frame"]-a["start_frame"]))
    lerp=lambda x,y:x+(y-x)*t
    return ([lerp(x,y) for x,y in zip(a["from_position"],a["to_position"])],lerp(a["from_scale"],a["to_scale"]),lerp(a["from_opacity"],a["to_opacity"]))

def shape(kind,c):
    if kind=="key": return f'<circle cx="-42" cy="0" r="29" fill="none" stroke="{c}" stroke-width="16"/><path d="M-13 0 H76 V24 H57 V12 H38 V24 H22 V0" fill="none" stroke="{c}" stroke-width="14" stroke-linejoin="round"/>'
    if kind=="vault": return f'<rect x="-72" y="-65" width="144" height="130" rx="16" fill="{c}"/><rect x="-54" y="-47" width="108" height="94" rx="8" fill="none" stroke="white" stroke-width="4"/><circle r="23" fill="none" stroke="white" stroke-width="6"/><path d="M-20 0 H20 M0 -20 V20" stroke="white" stroke-width="5"/>'
    if kind=="database": return f'<path d="M-65 -40 V45 Q0 80 65 45 V-40" fill="{c}"/><ellipse cy="-40" rx="65" ry="24" fill="{c}" stroke="white" stroke-width="3"/><path d="M-65 0 Q0 40 65 0" fill="none" stroke="white" stroke-width="3"/>'
    if kind in ("document","repository"): return f'<rect x="-48" y="-68" width="96" height="136" rx="8" fill="{c}"/><path d="M-30 -30 H30 M-30 -8 H30 M-30 14 H15" stroke="white" stroke-width="5"/>'
    if kind=="computer": return f'<rect x="-78" y="-55" width="156" height="104" rx="9" fill="{c}"/><rect x="-65" y="-42" width="130" height="77" fill="white" opacity=".8"/><path d="M0 49 V70 H-38 H38" stroke="{c}" stroke-width="8"/>'
    if kind in ("node","model"): return f'<circle r="53" fill="{c}"/><path d="M-28 0 L0 -28 L28 0 L0 28 Z" fill="none" stroke="white" stroke-width="5"/>'
    if kind=="connector": return f'<path d="M-70 0 H70 L48 -20 M70 0 L48 20" fill="none" stroke="{c}" stroke-width="8"/>'
    return f'<rect x="-100" y="-38" width="200" height="76" rx="12" fill="{c}" opacity=".12"/>'

def frame_svg(plan,frame):
    seq=next(s for s in plan["sequences"] if s["start_frame"]<=frame<s["end_frame"])
    registry={o["id"]:o for o in plan["objects"]}
    groups={}
    for a in seq["actions"]: groups.setdefault(a["object_id"],[]).append(a)
    t=smooth((frame-seq["start_frame"])/(seq["end_frame"]-seq["start_frame"]))
    cam=seq["camera"]
    zoom=1+(.09*t if cam=="dolly_in" else -.07*t if cam=="pull_back" else 0)
    pan=18*t*(1 if cam=="pan_right" else -1 if cam=="pan_left" else 0)
    layers=[]
    for oid,actions in groups.items():
        st=state(sorted(actions,key=lambda a:a["start_frame"]),frame)
        if st is None: continue
        (x,y,z),scale,opacity=st
        o=registry[oid]; c=escape(o["color"]); label=escape(o["label"][:42])
        px=270+max(-1,min(1,x/10))*150*zoom+pan
        py=430-max(-1,min(1,y/10))*240*zoom
        size=min(1.15,max(.25,scale*.8*zoom*(1+z*.025)))
        layers.append((z,f'<g transform="translate({px:.2f} {py:.2f}) scale({size:.3f})" opacity="{opacity:.3f}"><ellipse cy="83" rx="76" ry="12" fill="#14243a" opacity=".10"/>{shape(o["kind"],c)}<text y="110" text-anchor="middle" font-size="15" fill="#1B2A41">{label}</text></g>'))
    title=escape(seq["title"][:65])
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960"><rect width="540" height="960" fill="{escape(plan["background"])}"/><g font-family="sans-serif"><text x="270" y="80" text-anchor="middle" font-size="15" fill="#1B2A41">ILLUSTRATIVE PREVIEW</text><text x="270" y="125" text-anchor="middle" font-size="14" fill="#1B2A41">{title}</text>{"".join(v for _,v in sorted(layers))}<rect x="40" y="905" width="460" height="4" fill="#1B2A41" opacity=".15"/><rect x="40" y="905" width="{460*frame/plan["total_frames"]}" height="4" fill="#3A7CA5"/></g></svg>'

def main():
    import cairosvg
    p=argparse.ArgumentParser()
    for name in ("storyboard","source","output"): p.add_argument("--"+name,required=True)
    a=p.parse_args()
    plan=json.loads(Path(a.storyboard).expanduser().read_text())
    out=Path(a.output).expanduser(); out.mkdir(parents=True,exist_ok=False)
    (out/"creative_diagnostics.json").write_text(json.dumps(diagnostics(plan),indent=2))
    frames=out/"frames"; frames.mkdir()
    for i in range(plan["total_frames"]):
        cairosvg.svg2png(bytestring=frame_svg(plan,i).encode(),write_to=str(frames/f"{i:06d}.png"))
    subprocess.run(["ffmpeg","-n","-framerate","30","-i",str(frames/"%06d.png"),"-i",str(Path(a.source).expanduser()/"narration.wav"),"-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-af","apad","-t",str(plan["total_frames"]/30),str(out/"review.mp4")],check=True)
    print("Preview:",out/"review.mp4")
if __name__=="__main__": main()
