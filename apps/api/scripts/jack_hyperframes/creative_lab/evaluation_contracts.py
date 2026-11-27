"""Versioned, evidence-backed contracts for rendered-video evaluation."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
SEVERITIES = ("critical", "high", "medium", "low", "advisory")
VERIFICATION_METHODS = ("deterministic", "ai", "human")
SEVERITY_WEIGHT = {"critical": 1000, "high": 100, "medium": 20, "low": 5, "advisory": 0}


class EvaluationContractError(ValueError):
    """Raised when evaluation evidence is malformed or unverifiable."""


def artifact_record(path: str | Path) -> dict[str, Any]:
    resolved = Path(path).resolve()
    if not resolved.is_file():
        raise EvaluationContractError(f"Evidence artifact does not exist: {resolved}")
    digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
    return {"path": str(resolved), "sha256": digest, "bytes": resolved.stat().st_size}


def stable_defect_id(category: str, scene: int | None, timecode_seconds: float | None,
                     capability: str) -> str:
    bucket = "none" if timecode_seconds is None else f"{timecode_seconds:.1f}"
    raw = f"{category}|{scene}|{bucket}|{capability}".encode()
    return "jack-defect-" + hashlib.sha256(raw).hexdigest()[:16]


def defect(*, category: str, severity: str, evidence: list[dict[str, Any]],
           reproduction: dict[str, Any], confidence: float,
           verification_method: str, capability: str,
           suggested_correction: dict[str, Any] | None,
           scene: int | None = None, timecode_seconds: float | None = None,
           actual_correction: dict[str, Any] | None = None,
           before_after: dict[str, Any] | None = None,
           limitations: list[str] | None = None,
           reviewer: str | None = None) -> dict[str, Any]:
    item = {
        "id": stable_defect_id(category, scene, timecode_seconds, capability),
        "category": category, "severity": severity, "scene": scene,
        "timecode_seconds": timecode_seconds, "evidence": evidence,
        "reproduction": reproduction, "confidence": confidence,
        "verification_method": verification_method, "capability": capability,
        "suggested_correction": suggested_correction,
        "actual_correction": actual_correction, "before_after": before_after or {},
        "limitations": limitations or [], "reviewer": reviewer,
    }
    validate_defect(item)
    return item


def validate_defect(item: dict[str, Any]) -> None:
    required = {"id", "category", "severity", "scene", "timecode_seconds", "evidence",
                "reproduction", "confidence", "verification_method", "capability",
                "suggested_correction", "actual_correction", "before_after", "limitations", "reviewer"}
    if not isinstance(item, dict) or set(item) != required:
        raise EvaluationContractError("Defect does not match schema")
    if item["severity"] not in SEVERITIES or item["verification_method"] not in VERIFICATION_METHODS:
        raise EvaluationContractError("Invalid severity or verification method")
    if not isinstance(item["confidence"], (int, float)) or not 0 <= item["confidence"] <= 1:
        raise EvaluationContractError("Confidence must be in [0,1]")
    if not item["category"] or not item["capability"] or not item["evidence"]:
        raise EvaluationContractError("Defect requires category, capability and evidence")
    for evidence in item["evidence"]:
        if not isinstance(evidence, dict) or not Path(evidence.get("path", "")).is_file():
            raise EvaluationContractError("Defect evidence must reference a real file")


def evaluation(*, run_id: str, attempt_id: str, commit: str, config: dict[str, Any],
               video: str | Path, defects: list[dict[str, Any]],
               measurements: dict[str, Any], limitations: list[str],
               reviewer: str = "jack-deterministic-evaluator") -> dict[str, Any]:
    artifact = artifact_record(video)
    report = {
        "schema_version": SCHEMA_VERSION, "run_id": run_id, "attempt_id": attempt_id,
        "commit": commit, "config": config, "artifact": artifact,
        "defects": defects, "measurements": measurements,
        "limitations": limitations, "reviewer": reviewer,
        "technical_status": "pass" if not any(d["severity"] in ("critical", "high") for d in defects) else "fail",
        "creative_status": "human_review_required", "publish_authorized": False,
    }
    validate_evaluation(report)
    return report


def validate_evaluation(report: dict[str, Any]) -> None:
    if report.get("schema_version") != SCHEMA_VERSION:
        raise EvaluationContractError("Unsupported evaluation version")
    if not all(report.get(key) for key in ("run_id", "attempt_id", "commit", "reviewer")):
        raise EvaluationContractError("Evaluation identifiers are required")
    artifact = report.get("artifact", {})
    path = Path(artifact.get("path", ""))
    if not path.is_file() or artifact.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
        raise EvaluationContractError("Evaluation artifact is missing or changed")
    for item in report.get("defects", []):
        validate_defect(item)
    if report.get("publish_authorized") is not False or report.get("creative_status") != "human_review_required":
        raise EvaluationContractError("Technical evaluation cannot authorize publication")


def defect_cost(report: dict[str, Any]) -> tuple[int, int, int]:
    defects = report.get("defects", [])
    severe = sum(d["severity"] in ("critical", "high") for d in defects)
    weighted = sum(SEVERITY_WEIGHT[d["severity"]] for d in defects)
    return severe, weighted, len(defects)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
