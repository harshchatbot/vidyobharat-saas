"""Deterministic defect-to-repair mapping for JACK object storyboards."""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from revision_contracts import (RevisionContractError, assert_invariants, operation,
                                validate_operation)


class RepairBlockedError(RevisionContractError):
    """A diagnosed defect cannot be repaired without new approval."""


REPAIRABLE = {
    "camera_discontinuity", "camera_acceleration", "subject_visibility",
    "geometry_bounds", "text_overflow", "text_safe_area", "caption_timing",
    "missing_asset", "exposure", "contrast", "transition_flash",
    "transition_discontinuity", "unexpected_static", "audio_loudness",
    "audio_peak", "audio_cue_timing", "blank_black_frames",
}


def propose_repairs(plan: dict[str, Any], defects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    proposed = []
    for item in defects:
        category, scene, defect_id = item["category"], item.get("scene"), item["id"]
        if scene is None and item.get("timecode_seconds") is not None:
            frame = round(item["timecode_seconds"] * plan.get("fps", 30))
            scene = next((index for index, candidate in enumerate(plan.get("sequences", []))
                          if candidate["start_frame"] <= frame < candidate["end_frame"]), None)
        if category not in REPAIRABLE or item["severity"] == "advisory":
            continue
        if scene is not None and scene < len(plan.get("sequences", [])) and plan["sequences"][scene].get("locked"):
            raise RepairBlockedError(f"Scene {scene} is locked; {category} requires approval")
        if category in ("camera_discontinuity", "camera_acceleration"):
            if plan.get("render_options", {}).get("camera_jump_x"):
                proposed.append(operation(defect_id=defect_id, operation_type="set_render_option", scene=scene,
                                          parameters={"key": "camera_jump_x", "value": 0},
                                          reason="Remove the diagnosed injected camera discontinuity"))
            else:
                proposed.append(operation(defect_id=defect_id, operation_type="set_camera", scene=scene,
                                          parameters={"camera": "track"}, reason="Smooth the diagnosed camera trajectory"))
        elif category in ("subject_visibility", "geometry_bounds"):
            if plan.get("render_options", {}).get("subject_offset_x"):
                proposed.append(operation(defect_id=defect_id, operation_type="set_render_option", scene=scene,
                                          parameters={"key": "subject_offset_x", "value": 0},
                                          reason="Restore the diagnosed subject to bounded framing"))
            else:
                object_id = item.get("reproduction", {}).get("object_id")
                offset = item.get("reproduction", {}).get("suggested_offset", [0, 0, 0])
                proposed.append(operation(defect_id=defect_id, operation_type="offset_object", scene=scene,
                                          parameters={"object_id": object_id, "offset": offset},
                                          reason="Restore the diagnosed subject to bounded framing"))
        elif category in ("text_overflow", "text_safe_area", "caption_timing"):
            proposed.append(operation(defect_id=defect_id, operation_type="set_text_layout", scene=scene,
                                      parameters={"caption_left": 90, "caption_width": 900,
                                                  "caption_bottom": 155, "title_scale": .82},
                                      reason="Restore caption and title safe-area layout"))
        elif category == "missing_asset":
            approved = item.get("reproduction", {}).get("approved_path")
            if not approved or not Path(approved).is_file():
                raise RepairBlockedError("Approved asset is unavailable; conceptual fallback needs approval")
            proposed.append(operation(defect_id=defect_id, operation_type="restore_asset", scene=scene,
                                      parameters={"path": str(Path(approved).resolve())},
                                      reason="Restore the explicitly approved asset path"))
        elif category in ("exposure", "contrast"):
            proposed.append(operation(defect_id=defect_id, operation_type="set_lighting", scene=scene,
                                      parameters={"lighting": "studio key fill rim"},
                                      reason="Restore readable subject exposure and separation"))
        elif category in ("transition_flash", "transition_discontinuity"):
            proposed.append(operation(defect_id=defect_id, operation_type="set_transition", scene=scene,
                                      parameters={"transition": "continuous", "transition_flash": False},
                                      reason="Remove the measured transition flash or discontinuity"))
        elif category == "unexpected_static":
            proposed.append(operation(defect_id=defect_id, operation_type="set_camera", scene=scene,
                                      parameters={"camera": "dolly_in"},
                                      reason="Restore an intended bounded motion event"))
        elif category == "blank_black_frames":
            proposed.append(operation(defect_id=defect_id, operation_type="set_visibility_lead_in", scene=scene,
                                      parameters={"minimum_opacity": .12, "frames": 6},
                                      reason="Restore a visible lead-in without changing narration or timing"))
        elif category in ("audio_loudness", "audio_peak"):
            measured = item.get("before_after", {}).get("before", {})
            loudness = measured.get("integrated_lufs", -14)
            gain = max(-12, min(12, -14 - loudness)) if isinstance(loudness, (int, float)) else 0
            proposed.append(operation(defect_id=defect_id, operation_type="set_audio_gain", scene=None,
                                      parameters={"decibels": round(gain, 2), "target_lufs": -14, "true_peak": -1.5},
                                      reason="Remaster the measured final-output loudness"))
        elif category == "audio_cue_timing":
            proposed.append(operation(defect_id=defect_id, operation_type="set_audio_cue", scene=scene,
                                      parameters={"offset_ms": 0}, reason="Align the diagnosed cue to its visual anchor"))
    return proposed


def apply_repairs(plan: dict[str, Any], operations: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    before = copy.deepcopy(plan)
    updated = copy.deepcopy(plan)
    applied = []
    options = updated.setdefault("render_options", {})
    for item in operations:
        validate_operation(item)
        scene_index = item["scene"]
        if scene_index is not None and scene_index >= len(updated.get("sequences", [])):
            raise RevisionContractError("Repair scene is outside plan")
        scene = updated["sequences"][scene_index] if scene_index is not None else None
        if scene is not None and scene.get("locked"):
            raise RepairBlockedError(f"Scene {scene_index} is locked")
        kind, params = item["operation"], item["parameters"]
        changes = {}
        if kind == "set_camera":
            changes = {"camera": [scene.get("camera"), params["camera"]]}; scene["camera"] = params["camera"]
        elif kind == "offset_object":
            object_id, offset = params.get("object_id"), params["offset"]
            changed = 0
            for action in scene["actions"]:
                if object_id is None or action["object_id"] == object_id:
                    for key in ("from_position", "to_position"):
                        old = action[key][:]
                        action[key] = [max(-3, min(3, value + offset[i])) for i, value in enumerate(action[key])]
                        changes[f"{action['object_id']}.{key}.{changed}"] = [old, action[key]]
                    changed += 1
            if not changed:
                raise RevisionContractError("Repair object is absent from scene")
        elif kind == "set_text_layout":
            old = {key: options.get(key) for key in params}; options.update(params); changes = {"render_options": [old, params]}
        elif kind == "set_lighting":
            changes = {"lighting": [scene.get("lighting"), params["lighting"]]}; scene["lighting"] = params["lighting"]
            options["exposure"] = 1
        elif kind == "set_transition":
            changes = {"transition": [scene.get("transition"), params["transition"]]}; scene["transition"] = params["transition"]
            options["transition_flash"] = bool(params.get("transition_flash", False))
        elif kind == "set_visibility_lead_in":
            options["visibility_lead_in"] = params; changes = {"visibility_lead_in": params}
        elif kind == "set_audio_gain":
            old = options.get("audio_gain_db"); options["audio_gain_db"] = params["decibels"]; changes = {"audio_gain_db": [old, params["decibels"]]}
        elif kind == "set_audio_cue":
            options.setdefault("audio_cue_offsets_ms", {})[str(scene_index)] = params["offset_ms"]
            changes = {"audio_cue_offset_ms": params["offset_ms"]}
        elif kind == "restore_asset":
            approved = str(Path(params["path"]).resolve())
            if not Path(approved).is_file(): raise RepairBlockedError("Approved asset disappeared")
            options.setdefault("restored_assets", {})[str(scene_index)] = approved; changes = {"restored_asset": approved}
        elif kind == "set_render_option":
            key, value = params.get("key"), params.get("value")
            if key not in {"transition_flash", "exposure", "subject_offset_x", "caption_left", "caption_width", "camera_jump_x"}:
                raise RevisionContractError("Render option is not allow-listed")
            changes = {key: [options.get(key), value]}; options[key] = value
        applied.append({**item, "changes": changes})
    assert_invariants(before, updated)
    return updated, applied
