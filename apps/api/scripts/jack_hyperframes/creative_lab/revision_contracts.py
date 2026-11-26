"""Allow-listed creative repair operations and immutable-plan checks."""
from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

SCHEMA_VERSION = 1
OPERATION_TYPES = {
    "set_camera", "offset_object", "set_text_layout", "set_lighting",
    "set_transition", "set_visibility_lead_in", "set_audio_gain",
    "set_audio_cue", "restore_asset", "set_render_option",
}
CAMERAS = {"static", "dolly_in", "pull_back", "orbit", "pan_left", "pan_right", "track", "crane"}
TRANSITIONS = {"cut", "match_cut", "occlusion", "continuous", "directional", "dissolve", "spatial"}


class RevisionContractError(ValueError):
    """Raised when a repair is unsafe, invalid, or touches immutable state."""


def operation(*, defect_id: str, operation_type: str, scene: int | None,
              parameters: dict[str, Any], reason: str) -> dict[str, Any]:
    item = {"schema_version": SCHEMA_VERSION, "defect_id": defect_id,
            "operation": operation_type, "scene": scene,
            "parameters": parameters, "reason": reason}
    validate_operation(item)
    return item


def validate_operation(item: dict[str, Any]) -> None:
    if item.get("schema_version") != SCHEMA_VERSION or item.get("operation") not in OPERATION_TYPES:
        raise RevisionContractError("Unsupported revision operation")
    if not isinstance(item.get("defect_id"), str) or not item["defect_id"]:
        raise RevisionContractError("Revision must link to a diagnosed defect")
    if item.get("scene") is not None and (type(item["scene"]) is not int or item["scene"] < 0):
        raise RevisionContractError("Invalid scene index")
    if not isinstance(item.get("parameters"), dict) or not item.get("reason"):
        raise RevisionContractError("Revision parameters and reason are required")
    params = item["parameters"]
    if item["operation"] == "set_camera" and params.get("camera") not in CAMERAS:
        raise RevisionContractError("Invalid camera")
    if item["operation"] == "set_transition" and params.get("transition") not in TRANSITIONS:
        raise RevisionContractError("Invalid transition")
    if item["operation"] == "offset_object":
        offset = params.get("offset")
        if not isinstance(offset, list) or len(offset) != 3 or any(not isinstance(v, (int, float)) or abs(v) > 3 for v in offset):
            raise RevisionContractError("Invalid bounded object offset")
    if item["operation"] == "set_audio_gain" and not -12 <= params.get("decibels", 99) <= 12:
        raise RevisionContractError("Audio correction exceeds bound")


def immutable_snapshot(plan: dict[str, Any]) -> dict[str, Any]:
    sequences = plan.get("sequences", [])
    return {
        "fps": plan.get("fps"), "total_frames": plan.get("total_frames"),
        "target_duration_seconds": plan.get("target_duration_seconds"),
        "claims": plan.get("verified_claims"), "sources": plan.get("approved_sources"),
        "assets": plan.get("approved_assets"), "product_identity": plan.get("product_identity"),
        "sequences": [{key: scene.get(key) for key in (
            "spoken_text", "dialogue", "voice_line", "tts_text", "script_line",
            "start_frame", "end_frame", "first_word", "last_word", "locked")}
            for scene in sequences],
    }


def immutable_digest(plan: dict[str, Any]) -> str:
    payload = json.dumps(immutable_snapshot(plan), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def assert_invariants(before: dict[str, Any], after: dict[str, Any]) -> None:
    if immutable_digest(before) != immutable_digest(after):
        raise RevisionContractError("Revision changed immutable narration, timing, claims, assets, locks, or identity")


def copy_plan(plan: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(plan)
