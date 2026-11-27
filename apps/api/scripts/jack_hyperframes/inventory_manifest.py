"""Build a verified manifest from explicitly approved inventory sidecars."""
import hashlib,json
from pathlib import Path
from index_local_assets import index
def build(root,output):
    result={}
    rejected=[]
    reasons={}
    for item in index(root)["assets"]:
        path=Path(item["path"])
        side=Path(str(path)+".asset.json")
        try:
            meta=json.loads(side.read_text()) if side.is_file() else {}
            if not isinstance(meta,dict): raise ValueError("Expected object")
        except (ValueError,OSError):
            rejected.append(item["id"])
            reasons[item["id"]]="invalid_sidecar"
            continue
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if meta.get("approved") is not True or meta.get("sha256")!=digest or not all(meta.get(k) for k in ("source_url","license","license_evidence")) or meta["license"].lower() in ("unknown","pending","unverified"):
            rejected.append(item["id"])
            reasons[item["id"]]="missing_approval_or_license_evidence_or_hash_mismatch"
            continue
        result[item["id"]]={**item,"approved":True,"sha256":digest,"source":meta["source_url"],"license":meta["license"],"evidence":meta["license_evidence"]}
    Path(output).write_text(json.dumps({"assets":result,"excluded":rejected,"exclusion_reasons":reasons},indent=2))
    return result
