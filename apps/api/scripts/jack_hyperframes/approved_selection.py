"""Select only locally approved, checksum-matched assets; no network access."""
import hashlib,json,re
from pathlib import Path
def tokens(text):
    return set(re.findall(r"[a-z0-9]+",text.lower()))-{"the","a","an","and","of","for","to","in"}
def select(manifest,query,kinds,used=(),minimum=.4):
    root=Path(manifest).resolve()
    q=tokens(query)
    candidates=[]
    for key,a in json.loads(root.read_text())["assets"].items():
        if a.get("approved") is not True or a.get("kind") not in kinds or key in used: continue
        if not all(isinstance(a.get(k),str) and a[k].strip() for k in ("license","source","sha256","evidence","path")): continue
        if a["license"].strip().lower() in ("unknown","unverified","pending"): continue
        if a.get("kind")=="music" and a.get("instrumental") is not True: continue
        path=(root.parent/a["path"]).resolve()
        if not path.is_relative_to(root.parent) or not path.is_file(): continue
        with path.open("rb") as f:
            if hashlib.file_digest(f,"sha256").hexdigest()!=a["sha256"].lower(): continue
        tags=tokens(str(a.get("tags",""))+" "+str(a.get("description","")))
        score=len(q&tags)/max(1,len(q))
        if score>=minimum:
            candidates.append((score,key,dict(a,path=str(path),id=key,relevance=score)))
    return sorted(candidates,key=lambda x:(-x[0],x[1]))[0][2] if candidates else None
