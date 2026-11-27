"""Stage approved reusable mascot PNGs into the isolated HyperFrames project."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

POSES=("idle_cool","point_at","arms_crossed","thumbs_up","shrug","facepalm","celebrate","explain")

def stage(manifest, project):
    manifest=Path(manifest).resolve()
    data=json.loads(manifest.read_text())
    target=Path(project).resolve()/"assets"/"jack-v2"
    prepared=[]
    for pose, item in data["poses"].items():
        if pose not in POSES or item.get("approved") is not True:
            raise ValueError("Unknown or unapproved pose: "+pose)
        if not all(item.get(k) for k in ("source","license","evidence","sha256")) or item["license"].lower() in ("unknown","unverified","pending"):
            raise ValueError("Missing provenance: "+pose)
        path=(manifest.parent/item["path"]).resolve()
        if hashlib.sha256(path.read_bytes()).hexdigest()!=item["sha256"].lower():
            raise ValueError("Checksum mismatch: "+pose)
        with Image.open(path) as im:
            if im.format!="PNG" or "A" not in im.getbands() or min(im.size)<512:
                raise ValueError("Expected transparent high-resolution PNG: "+pose)
            lo,hi=im.getchannel("A").getextrema()
            if lo!=0 or hi<200:
                raise ValueError("Missing usable alpha: "+pose)
        prepared.append((pose,path))
    if not prepared:
        raise ValueError("No approved mascot poses")
    target.mkdir(parents=True,exist_ok=True)
    for pose,path in prepared:
        dest=target/(pose+".png")
        if dest.exists() and dest.read_bytes()!=path.read_bytes():
            raise FileExistsError(dest)
        if not dest.exists(): shutil.copyfile(path,dest)
    return {pose:"assets/jack-v2/"+pose+".png" for pose,_ in prepared}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",required=True)
    p.add_argument("--project",required=True)
    a=p.parse_args()
    print(json.dumps(stage(a.manifest,a.project),indent=2))
