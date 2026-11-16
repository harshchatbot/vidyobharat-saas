"""Generate a fail-closed license evidence manifest for the faceless finance catalog.

Never infer rights from filenames, URLs, file presence or AI output.
An attestation must be independently reviewed before publishing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(catalog: dict) -> dict:
    if not isinstance(catalog.get("assets"), list):
        raise ValueError("Catalog must contain assets array")
    records = []
    ids = set()
    for item in catalog["assets"]:
        asset_id = item["id"]
        if asset_id in ids:
            raise ValueError(f"Duplicate asset ID: {asset_id}")
        ids.add(asset_id)
        path = Path(item["path"]).expanduser().resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Missing asset {asset_id}: {path}")
        records.append({
            "asset_id": asset_id,
            "type": item["kind"],
            "local_path": str(path),
            "sha256": file_hash(path),
            "source_url": None,
            "source_author": None,
            "license_name": None,
            "license_url": None,
            "evidence_file": None,
            "evidence_sha256": None,
            "attribution_required": None,
            "attribution_text": None,
            "commercial_use_permitted": None,
            "modification_permitted": None,
            "redistribution_permitted": None,
            "sublicensing_permitted": None,
            "ai_generated_or_synthetic": None,
            "restricted_uses": [],
            "reviewed_by": None,
            "reviewed_at_utc": None,
            "review_status": "unverified",
            "notes": "Requires human verification of original source, terms, and intended use.",
        })
    return {
        "schema": "rangmanch_asset_license_manifest_v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "policy": "deny_publish_unless_verified",
        "assets": records,
    }


def evaluate(manifest: dict, *, repo_root: Path | None = None) -> dict:
    if manifest.get("schema") != "rangmanch_asset_license_manifest_v1":
        raise ValueError("Unknown license manifest schema")
    failures = []
    approved = []
    for asset in manifest.get("assets", []):
        asset_id = asset.get("asset_id", "<missing>")
        problems = []
        path = Path(asset.get("local_path", ""))
        if not path.is_file():
            problems.append("file_missing")
        elif file_hash(path) != asset.get("sha256"):
            problems.append("asset_checksum_changed")
        for field in ("source_url", "source_author", "license_name", "license_url",
                      "reviewed_by", "reviewed_at_utc"):
            if not asset.get(field):
                problems.append("missing_" + field)
        if asset.get("review_status") != "verified":
            problems.append("not_verified")
        if asset.get("commercial_use_permitted") is not True:
            problems.append("commercial_use_not_confirmed")
        if asset.get("modification_permitted") is not True:
            problems.append("modification_not_confirmed")
        if asset.get("redistribution_permitted") is not True:
            problems.append("redistribution_not_confirmed")
        if asset.get("attribution_required") is not False and not asset.get("attribution_text"):
            problems.append("attribution_unresolved")
        evidence = asset.get("evidence_file")
        if not evidence:
            problems.append("evidence_missing")
        else:
            ep = Path(evidence)
            if not ep.is_absolute() and repo_root:
                ep = repo_root / ep
            if not ep.is_file():
                problems.append("evidence_file_missing")
            elif not asset.get("evidence_sha256") or file_hash(ep) != asset["evidence_sha256"]:
                problems.append("evidence_checksum_invalid")
        if problems:
            failures.append({"asset_id": asset_id, "reasons": sorted(set(problems))})
        else:
            approved.append(asset_id)
    return {
        "publish_gate": "pass" if not failures and bool(approved) else "blocked",
        "approved_asset_ids": approved,
        "blocked_assets": failures,
        "note": "Licensing gate only; creative, financial-claims and video QA are separate gates.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="Evaluate existing evidence")
    args = parser.parse_args()
    if args.check:
        report = evaluate(json.loads(args.manifest.read_text(encoding="utf-8")))
        print(json.dumps(report, indent=2))
        return 0 if report["publish_gate"] == "pass" else 2
    if not args.catalog:
        parser.error("--catalog is required when creating a manifest")
    if args.manifest.exists():
        parser.error("Manifest already exists: refusing to overwrite review evidence")
    doc = build_manifest(json.loads(args.catalog.read_text(encoding="utf-8")))
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"Created unverified rights manifest: {args.manifest}")
    print("Publish gate BLOCKED until original licensing evidence is reviewed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
