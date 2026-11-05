"""Creative Director V2.1: validated visual choreography from the V2 narrative.

Pure, read-only plan compiler. It NEVER edits a timeline, downloads media,
fabricates licenses or authorizes a render. Source video + voice always play
continuously, including every pause between transcript phrases.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v2 import ScenePlanV2, validate_scene_plan


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ApprovedAsset(Strict):
    """Snapshot from the *public*, published, verified registry, not raw AI text."""
    id: str
    type: Literal["lut", "emoji", "music", "sfx", "broll"]
    tags: list[str] = Field(default_factory=list)
    sha256: str = Field(min_length=32)
    status: Literal["published"] = "published"
    content_url: str = Field(min_length=1)


class Keyframe(Strict):
    at: float = Field(ge=0)
    opacity: float = Field(ge=0, le=1)
    scale: float = Field(ge=0.5, le=1.15)
    translate_y: float = Field(ge=-0.2, le=0.2)
    easing: Literal["ease_out_cubic", "ease_in_out_cubic"] = "ease_out_cubic"


class CompositionBeat(Strict):
    id: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    kind: Literal["source", "hold_original", "typography", "motion_graphic", "broll_intent", "zoom", "sound_intent"]
    template: str
    phrase_ids: list[str] = Field(default_factory=list)
    text_from_phrase_id: str | None = None
    layout: Literal["full", "caption_safe_upper", "face_safe_graphic"] = "full"
    keyframes: list[Keyframe] = Field(default_factory=list)
    requested_asset_query: str | None = None
    approved_asset_id: str | None = None
    asset_status: Literal["none", "approved", "unresolved"] = "none"
    sound_gain_db: float | None = Field(default=None, ge=-60, le=0)


class CompositionPlanV21(Strict):
    version: Literal["2.1"] = "2.1"
    duration_seconds: float = Field(ge=0, le=65)
    aspect_ratio: str
    base_video_uninterrupted: Literal[True] = True
    source_audio_uninterrupted: Literal[True] = True
    captions_owned_by: Literal["deterministic_editor"] = "deterministic_editor"
    beats: list[CompositionBeat]
    needs_review: bool = True
    ready_to_render: Literal[False] = False
    warnings: list[str] = Field(default_factory=list)


def _entrance(start: float, end: float) -> list[Keyframe]:
    """Bounded, short motion envelope. Times are relative to the beat."""
    duration = end - start
    rise = min(0.25, duration * 0.23)
    fall = min(0.20, duration * 0.20)
    return [
        Keyframe(at=0.0, opacity=0, scale=0.94, translate_y=0.025),
        Keyframe(at=round(rise, 3), opacity=1, scale=1, translate_y=0),
        Keyframe(at=round(max(rise, duration - fall), 3), opacity=1, scale=1, translate_y=0),
        Keyframe(at=round(duration, 3), opacity=0, scale=1, translate_y=-0.008),
    ]


def _sanitize_assets(approved: list[ApprovedAsset]) -> dict[str, list[ApprovedAsset]]:
    """Reject duplicate asset IDs, arbitrary URLs and unpublished entries."""
    by_type: dict[str, list[ApprovedAsset]] = {}
    seen: set[str] = set()
    for asset in approved:
        if asset.id in seen:
            raise ValueError("Duplicate approved asset ID")
        seen.add(asset.id)
        if not asset.content_url.startswith("/api/editor/visual-assets/"):
            raise ValueError("Asset not obtained from the approved public resolver")
        if not asset.sha256 or len(asset.sha256) != 64 or any(c not in "0123456789abcdef" for c in asset.sha256.lower()):
            raise ValueError("Missing verified asset checksum")
        by_type.setdefault(asset.type, []).append(asset)
    return by_type


def _choose_asset(by_type: dict[str, list[ApprovedAsset]], kind: str, words: str) -> ApprovedAsset | None:
    """Conservative tag-based choice; no AI hallucinations of available media."""
    tokens = {v.lower() for v in words.replace(",", " ").split() if len(v) > 3}
    matches = [(len(tokens.intersection({t.lower() for t in a.tags})), a)
               for a in by_type.get(kind, [])]
    matches = [entry for entry in matches if entry[0] > 0]
    return sorted(matches, key=lambda item: (-item[0], item[1].id))[0][1] if matches else None


def compile_composition_v21(
    context: CreativeContext, scene_plan: ScenePlanV2,
    *, approved_assets: list[ApprovedAsset] | None = None,
) -> CompositionPlanV21:
    """Compile validated narrative beats into a deterministic review-only plan.

    Full duration is continuously covered with original video/audio.
    No B-roll replacement, overlay or music can be rendered from intent alone.
    """
    validated = validate_scene_plan(context, scene_plan.model_dump(mode="json"))
    assets = _sanitize_assets(approved_assets or [])
    duration = round(context.media.duration_seconds, 3)
    phrases = {p.id: p for p in context.phrases}
    beats = [CompositionBeat(
        id="source-video", start=0, end=duration, kind="source",
        template="original_video_audio", layout="full",
    )]
    warnings = list(validated.warnings)
    cursor = 0.0
    caption_zones = {z.segment_id for z in context.caption_zones if z.status == "suggested"}
    for index, scene in enumerate(validated.scenes):
        first, last = phrases[scene.first_phrase_id], phrases[scene.last_phrase_id]
        start = max(0.0, min(duration, first.start))
        end = max(start, min(duration, last.end))
        if start + 1e-3 < cursor:
            raise ValueError("Overlapping or out-of-order speech intervals")
        if start > cursor + .001:
            beats.append(CompositionBeat(
                id=f"continuity-{index}", kind="hold_original", template="no_cut_no_overlay",
                start=round(cursor, 3), end=round(start, 3),
            ))
        if end - start < 0.12:
            warnings.append(f"Scene {index + 1} is too short for motion; original footage preserved")
            cursor = end
            continue

        if scene.zoom_scale is not None:
            beats.append(CompositionBeat(
                id=f"zoom-{index}", kind="zoom", template="subtle_camera_push",
                start=round(start, 3), end=round(end, 3),
                phrase_ids=[scene.first_phrase_id, scene.last_phrase_id],
                keyframes=[Keyframe(at=0, opacity=1, scale=1, translate_y=0),
                           Keyframe(at=round(end - start, 3), opacity=1, scale=scene.zoom_scale, translate_y=0)],
            ))
        if scene.emphasis_phrase_id:
            p = phrases[scene.emphasis_phrase_id]
            if p.segment_id not in caption_zones:
                raise ValueError("Unsafe caption emphasis")
            if p.end - p.start >= .12:
                beats.append(CompositionBeat(
                    id=f"type-{index}", kind="typography", template="bold_accent",
                    start=round(p.start, 3), end=round(p.end, 3),
                    phrase_ids=[p.id], text_from_phrase_id=p.id,
                    layout="caption_safe_upper", keyframes=_entrance(p.start, p.end),
                ))
        if scene.visual_mode == "graphic_overlay":
            # Move the graphic only within the face-safe composition system.
            # No free-form AI positioning or fabricated on-screen text.
            graphic_start = round(start, 3)
            graphic_end = round(end, 3)
            beats.append(CompositionBeat(
                id=f"graphic-{index}", kind="motion_graphic",
                template=scene.motion_template, start=graphic_start, end=graphic_end,
                phrase_ids=[scene.first_phrase_id, scene.last_phrase_id],
                layout="face_safe_graphic", keyframes=_entrance(graphic_start, graphic_end),
            ))
        if scene.visual_mode in {"broll_overlay", "split_screen"}:
            resolved = _choose_asset(assets, "broll", scene.broll_query or "")
            beats.append(CompositionBeat(
                id=f"broll-{index}", kind="broll_intent",
                template=scene.visual_mode, start=round(start, 3), end=round(end, 3),
                phrase_ids=[scene.first_phrase_id, scene.last_phrase_id],
                layout="face_safe_graphic",
                requested_asset_query=scene.broll_query,
                approved_asset_id=resolved.id if resolved else None,
                asset_status="approved" if resolved else "unresolved",
            ))
            if not resolved:
                warnings.append(f"Scene {index + 1}: no verified B-roll; keep original visible")
        if scene.sound_cue != "none":
            cue = _choose_asset(assets, "sfx", scene.sound_cue.replace("_", " "))
            beats.append(CompositionBeat(
                id=f"sfx-{index}", kind="sound_intent",
                template=scene.sound_cue, start=round(start, 3),
                end=round(min(end, start + 0.35), 3),
                approved_asset_id=cue.id if cue else None,
                asset_status="approved" if cue else "unresolved",
                sound_gain_db=-24 if cue else None,
            ))
            if not cue:
                warnings.append(f"Scene {index + 1}: SFX is intent only; no audio added")
        cursor = end

    if duration > cursor + .001:
        beats.append(CompositionBeat(
            id="continuity-tail", kind="hold_original",
            template="no_cut_no_overlay", start=round(cursor, 3), end=duration,
        ))
    if context.review_required:
        warnings.append("Speech timing or face guidance requires manual review")
    warnings.append("No export is authorized: motion templates require rendering and frame QA")
    return CompositionPlanV21(
        duration_seconds=duration, aspect_ratio=context.media.aspect_ratio,
        beats=beats, warnings=warnings,
    )
