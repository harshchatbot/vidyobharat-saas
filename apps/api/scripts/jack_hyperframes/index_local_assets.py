"""Read-only local inventory; never approves assets based on filenames."""
import argparse
import json
from pathlib import Path
from collections import Counter

EXTENSIONS={".wav",".mp3",".m4a",".aac",".ogg",".flac",".mp4",".mov",".webm",".png",".jpg",".jpeg",".webp",".gif"}
KINDS={"sfx":"sfx","overlays":"overlay","broll":"broll","greenscreen":"overlay","music":"music"}

def index(root):
    root=Path(root).resolve()
    entries=[]
    for folder,kind in KINDS.items():
        for path in sorted((root/folder).rglob("*")):
            if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
                continue
            if not path.resolve().is_relative_to(root):
                continue
            sidecar=Path(str(path)+".asset.json")
            meta=json.loads(sidecar.read_text()) if sidecar.is_file() else {}
            rel=path.relative_to(root)
            tags=sorted(set([*rel.parts[:-1],*meta.get("tags",[])]))
            entries.append({"id":rel.as_posix(),"path":str(path),"kind":kind,"title":path.stem,"tags":tags,"description":meta.get("description",""),"source":meta.get("source_url",""),"license_status":meta.get("license_status","unverified"),"evidence":meta.get("license_evidence",""),"allowed_uses":meta.get("allowed_uses",[]),"approved":False,"bytes":path.stat().st_size})
    return {"assets":entries,"counts":dict(Counter(a["kind"] for a in entries)),"approval_required":True}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--assets",required=True)
    p.add_argument("--output",required=True)
    a=p.parse_args()
    report=index(a.assets)
    output=Path(a.output).expanduser()
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2))
    print(json.dumps({"counts":report["counts"],"total":len(report["assets"]),"output":str(output)},indent=2))
