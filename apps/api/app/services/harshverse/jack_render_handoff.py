"""JACK V0.6 production handoff: validated, format-aware asset requirements.

No renderer invocation. Explicitly distinguishes supported V1 presenter recipes
from faceless/screen-demo formats requiring new adapters.
"""
from __future__ import annotations

from app.services.harshverse.scene_plan import Scene, ScenePlan

REQUIRED_ASSETS = {
    "talking_head": ("presenter_video_with_audio", "animation_plate_video"),
    "faceless": ("approved_voice_track", "licensed_visual_assets"),
    "screen_demo": ("screen_recording", "approved_voice_track"),
}


def prepare_render_handoff(storyboard: dict, *, approved_assets: dict[str, str] | None = None,
                           script_approved: bool = False) -> dict:
    fmt = storyboard.get("format")
    if fmt not in REQUIRED_ASSETS:
        raise ValueError("Unsupported JACK format")
    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or len(scenes) != 4:
        raise ValueError("Expected four JACK storyboard scenes")
    if [s.get("beat") for s in scenes] != ["hook", "value", "takeaway", "cta"]:
        raise ValueError("Unexpected storyboard beat order")
    assets = approved_assets or {}
    if not isinstance(assets, dict):
        raise ValueError("approved_assets must be a dictionary")
    required = REQUIRED_ASSETS[fmt]
    missing = [key for key in required if not isinstance(assets.get(key), str)
               or not assets[key].strip()]
    duration = scenes[-1].get("estimated_end_seconds")
    if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not 0 < duration <= 60:
        raise ValueError("Existing V1 renderer requires 0 < duration <= 60")
    # Validate temporal continuity; no false claim of audio alignment.
    cursor = 0.0
    for scene in scenes:
        start, end = scene.get("estimated_start_seconds"), scene.get("estimated_end_seconds")
        if any(not isinstance(v, (int, float)) or isinstance(v, bool) for v in (start, end)):
            raise ValueError("Invalid estimated timestamps")
        if abs(start - cursor) > 0.035 or end <= start:
            raise ValueError("Storyboard has gaps, overlaps or invalid scenes")
        cursor = end
    if fmt == "talking_head":
        # Safe baseline: presenter-only scenes, no fabricated animation timing.
        plan = ScenePlan(duration=duration, scenes=(
            Scene("presenter_hook", 0, scenes[1]["estimated_end_seconds"]),
            Scene("presenter_outro", scenes[1]["estimated_end_seconds"], duration),
        ))
        plan.validate()
        adapter = "harshverse_v1_presenter_baseline"
        plan_summary = {
            "duration": plan.duration,
            "scenes": [{"recipe": s.recipe, "start": s.start, "end": s.end} for s in plan.scenes],
        }
    else:
        adapter = "not_implemented"
        plan_summary = None
    return {
        "schema_version": "jack-render-handoff/v0.6",
        "format": fmt,
        "script_approved": script_approved is True,
        "required_assets": list(required),
        "missing_assets": missing,
        "asset_references": {k: assets[k] for k in required if k not in missing},
        "renderer_adapter": adapter,
        "renderer_supported": fmt == "talking_head",
        "scene_plan": plan_summary,
        "timing_status": "estimated_requires_audio_alignment",
        "status": "review_required",
        "render_ready": False,
        "render_executed": False,
        "reason": "Assets, source media durations, audio alignment and final creative approval have not been verified",
    }
