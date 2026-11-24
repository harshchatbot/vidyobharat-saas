"""Stage approved local assets and JS dependencies without modifying production.
Manifest entries require path, sha256, license, source, and approved=true.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

REQUIRED = {
    "mascot_master": "mascot.png",
    "digital_ping": "digital_ping.wav",
    "event_whoosh": "event_whoosh.wav",
    "soft_impact": "soft_impact.wav",
}

def prepare(manifest_path, workspace):
    manifest_path = Path(manifest_path).expanduser().resolve()
    workspace = Path(workspace).expanduser().resolve()
    manifest = json.loads(manifest_path.read_text())
    entries = manifest["assets"]
    verified = {}
    for key, filename in REQUIRED.items():
        entry = entries.get(key, {})
        if entry.get("approved") is not True or not all(entry.get(k) for k in ("path","sha256","license","source")):
            raise ValueError(f"Missing approved provenance for {key}")
        source = (manifest_path.parent / entry["path"]).resolve()
        if not source.is_file():
            raise FileNotFoundError(source)
        if hashlib.sha256(source.read_bytes()).hexdigest() != entry["sha256"].lower():
            raise ValueError(f"Checksum mismatch: {key}")
        if source.suffix.lower() != Path(filename).suffix:
            raise ValueError(f"Unexpected format: {key}")
        verified[filename] = source
    deps = {
        "gsap.min.js": workspace / "node_modules/gsap/dist/gsap.min.js",
        "three.module.js": workspace / "node_modules/three/build/three.module.js",
        "three.core.js": workspace / "node_modules/three/build/three.core.js",
    }
    for source in deps.values():
        if not source.is_file():
            raise FileNotFoundError(source)
    target = workspace / "cdc-benchmark"
    if not target.is_dir():
        raise FileNotFoundError("Run bootstrap first")
    for folder, mapping in (("assets",verified),("vendor",deps)):
        dest = target / folder
        dest.mkdir(exist_ok=True)
        for filename, source in mapping.items():
            shutil.copy2(source, dest / filename)
    shutil.copy2(Path(__file__).with_name("composition") / "index.html", target / "index.html")
    print("Approved assets staged. Narration, rendering and QA remain separate steps.")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", required=True)
    p.add_argument("--workspace", required=True)
    a = p.parse_args()
    prepare(a.manifest, a.workspace)
