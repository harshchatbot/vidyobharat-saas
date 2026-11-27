"""Bridge JACK storyboards into the existing HarshVerse Creative Scene Planner.

Narration timings from JACK are estimates, never Whisper alignment.
No effects, assets, cuts or publication are automatically authorized.
"""
from __future__ import annotations

from app.services.harshverse.creative_scene_planner import propose_scene_plan
from app.services.video_creative_context import CreativeContext, ClipMetadata, Phrase

CAMERA_BY_BEAT = {
    "hook": "wide_to_push_in",
    "value": "three_quarter_orbit",
    "takeaway": "tracking_follow_event",
    "cta": "pull_back_to_end_card",
}
MODULE_BY_BEAT = {
    "hook": "kinetic_typography",
    "value": "layered_hyperframe",
    "takeaway": "layered_hyperframe",
    "cta": "kinetic_typography",
}


def bridge_jack_to_creative_director(storyboard: dict, *, reference_blueprint: dict | None = None) -> dict:
    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or len(scenes) != 4:
        raise ValueError("JACK requires four scenes")
    if [s.get("beat") for s in scenes] != ["hook", "value", "takeaway", "cta"]:
        raise ValueError("JACK beat order invalid")
    duration = scenes[-1].get("estimated_end_seconds")
    if type(duration) not in (int, float) or not 0 < duration <= 65:
        raise ValueError("CreativeContext supports duration up to 65 seconds")
    phrases = []
    cursor = 0.0
    for i, scene in enumerate(scenes):
        start, end = scene.get("estimated_start_seconds"), scene.get("estimated_end_seconds")
        narration = scene.get("narration")
        if type(start) not in (int, float) or type(end) not in (int, float) or (
            abs(start-cursor) > .035 or end <= start or end > duration + .01
        ):
            raise ValueError("Invalid scene timing")
        if not isinstance(narration, str) or not narration.strip():
            raise ValueError("Missing narration")
        phrases.append(Phrase(
            id=f"phrase_{i+1:03d}", segment_id=f"jack_segment_{i+1:03d}",
            start=float(start), end=float(end), text=narration.strip(),
            timing_status="estimated",
        ))
        cursor = end
    context = CreativeContext(
        media=ClipMetadata(duration_seconds=float(duration), aspect_ratio="9:16",
                           language=storyboard.get("language") or "en", style="cinematic"),
        phrases=phrases,
        caption_zones=[], zoom_zones=[], approved_cuts=[],
        review_required=True,
        allowed_actions=["caption_emphasis", "centered_zoom",
                         "existing_sfx_suggestion", "broll_asset_suggestion"],
        notes=["JACK timing is estimated, not Whisper aligned.",
               "No source video cuts are authorized.",
               "Original generated content; requires editorial and asset approval."],
    )
    existing = propose_scene_plan(context, reference_blueprint=reference_blueprint, max_scenes=4)
    hyperframes = []
    for i, scene in enumerate(scenes):
        beat = scene["beat"]
        hyperframes.append({
            "scene_id": scene.get("id", f"jack_scene_{i+1:03d}"),
            "beat": beat,
            "start_seconds_estimated": scene["estimated_start_seconds"],
            "end_seconds_estimated": scene["estimated_end_seconds"],
            "visual_module_proposal": MODULE_BY_BEAT[beat],
            "camera_proposal": CAMERA_BY_BEAT[beat],
            "depth_layers": ["background", "midground", "foreground"],
            "typography_text": scene["narration"][:120],
            "sfx_cue_proposal": "soft_whoosh" if beat in ("hook", "cta") else "subtle_event_tick",
            "sfx_asset_id": None,
            "asset_status": "unresolved",
            "review_required": True,
        })
    return {
        "schema_version": "jack-creative-director-bridge/v1",
        "status": "review_only",
        "existing_harshverse_scene_proposals": existing,
        "hyperframe_proposals": hyperframes,
        "transcription": {"engine": "faster_whisper", "status": "not_run",
                          "timing_source": "jack_estimates"},
        "render": {"engine": "ffmpeg", "status": "not_run"},
        "sfx": {"catalog_lookup": "not_run", "assets_resolved": False},
        "safety": {"render_ready": False, "publish_authorized": False,
                   "creative_approved": False, "word_alignment_verified": False},
    }
