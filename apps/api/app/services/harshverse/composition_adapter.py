"""Review-only bridge from Creative Director V2.1 to HarshVerse V1 scenes.

V2.1's beats are intents, not downloadable media or render authorization.
Only visual beats backed by session-verified animation media can become
presenter/animation split scenes. Original source audio is never cut or moved.

This module performs no I/O and cannot itself establish a media file's license,
checksum, ownership, or existence. The caller must obtain AnimationPlate
and PreparedVisual records from the authenticated media/asset pipeline,
not from model-generated JSON. No export is authorized by this adapter.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import TYPE_CHECKING, Sequence

from .scene_plan import Scene, ScenePlan

if TYPE_CHECKING:
    from app.services.video_creative_director_v21 import CompositionPlanV21


_VISUAL_KINDS = frozenset({'motion_graphic', 'broll_intent'})
_DEFERRED_KINDS = frozenset({
    'typography', 'zoom', 'sound_intent', 'emoji_intent',
    'lut_intent', 'music_intent',
})
_PASS_THROUGH_KINDS = frozenset({'source', 'hold_original'})
_MOTION_TEMPLATES = frozenset({'keyword_card', 'data_flow', 'human_vs_ai', 'source_stack'})
_EPSILON = 0.001


@dataclass(frozen=True)
class AnimationPlate:
    """One resolved animation video, verified by the trusted caller upstream.

    The renderer has only one animation input. Its SHA is metadata, not
    proof that this adapter has checked the underlying media bytes or rights.
    """

    asset_id: str
    duration: float
    sha256: str


@dataclass(frozen=True)
class PreparedVisual:
    """Explicit mapping of a single V2.1 beat to a segment in the plate.

    source_asset_id must match V2.1's published asset for B-roll, and must
    be None for locally rendered motion graphics (which have no registry ID).
    """

    beat_id: str
    asset_offset: float
    source_asset_id: str | None = None


@dataclass(frozen=True)
class HarshVerseDraft:
    scene_plan: ScenePlan
    animation_asset_id: str | None
    deferred_beat_ids: tuple[str, ...]
    needs_review: bool = True
    ready_to_render: bool = False


def compile_harshverse_draft(
    composition: CompositionPlanV21,
    *,
    plate: AnimationPlate | None = None,
    prepared_visuals: Sequence[PreparedVisual] = (),
    fps: int = 30,
    width: int = 720,
    height: int = 1280,
) -> HarshVerseDraft:
    """Create validated split-screen recipes without approving an export.

    Source and gaps retain the full presenter video. Approved, already
    generated visual media use presenter_split; V1 cannot produce a
    transparent overlay or support multiple separate animation inputs.

    Typography, zoom, LUT, SFX, emoji and music beats are returned as deferred
    IDs for independent editor handling, not silently claimed to be rendered.
    Unresolved visual requests fail closed; caller can use the existing
    deterministic Auto Edit fallback.
    """
    if (composition.version != '2.1' or not composition.needs_review
            or composition.ready_to_render is not False
            or not composition.base_video_uninterrupted
            or not composition.source_audio_uninterrupted):
        raise ValueError('expected an unchanged review-only V2.1 composition')
    if composition.aspect_ratio != '9:16':
        raise ValueError('HarshVerse V1 only supports 9:16 source compositions')
    duration = composition.duration_seconds
    if not math.isfinite(duration) or not (0 < duration <= 60):
        raise ValueError('HarshVerse requires source duration in (0, 60] seconds')

    seen_ids: set[str] = set()
    source_beats = []
    visual_beats = []
    deferred_ids = []
    for beat in composition.beats:
        if not beat.id or beat.id in seen_ids:
            raise ValueError('duplicate or empty composition beat ID')
        seen_ids.add(beat.id)
        if (not math.isfinite(beat.start) or not math.isfinite(beat.end)
                or beat.start < 0 or beat.end <= beat.start
                or beat.end > duration + _EPSILON):
            raise ValueError(f'invalid beat timing: {beat.id}')
        if beat.kind == 'source':
            source_beats.append(beat)
        elif beat.kind in _VISUAL_KINDS:
            visual_beats.append(beat)
        elif beat.kind in _DEFERRED_KINDS:
            deferred_ids.append(beat.id)
        elif beat.kind not in _PASS_THROUGH_KINDS:
            raise ValueError(f'unsupported composition beat kind: {beat.kind}')

    if (len(source_beats) != 1 or abs(source_beats[0].start) > _EPSILON
            or abs(source_beats[0].end - duration) > _EPSILON):
        raise ValueError('one uninterrupted full-duration source beat is required')

    if plate is not None:
        if (not plate.asset_id or not math.isfinite(plate.duration)
                or plate.duration <= 0 or not re.fullmatch(r'[0-9a-fA-F]{64}', plate.sha256)):
            raise ValueError('invalid verified animation plate metadata')
    if visual_beats and plate is None:
        raise ValueError('visual beats require a verified animation plate')
    if not visual_beats and plate is not None:
        raise ValueError('animation plate supplied without visual beats')

    prepared: dict[str, PreparedVisual] = {}
    for item in prepared_visuals:
        if not item.beat_id or item.beat_id in prepared:
            raise ValueError('duplicate or empty prepared visual beat ID')
        if not math.isfinite(item.asset_offset) or item.asset_offset < 0:
            raise ValueError('invalid animation asset offset')
        prepared[item.beat_id] = item
    if set(prepared) != {b.id for b in visual_beats}:
        raise ValueError('every visual beat must have exactly one resolved animation segment')

    scenes: list[Scene] = []
    cursor = 0.0
    minimum_frame = 1 / fps if fps > 0 else float('inf')
    for beat in sorted(visual_beats, key=lambda b: (b.start, b.end)):
        resolved = prepared[beat.id]
        if beat.kind == 'broll_intent':
            if (beat.asset_status != 'approved' or not beat.approved_asset_id
                    or resolved.source_asset_id != beat.approved_asset_id
                    or beat.template not in ('broll_overlay', 'split_screen')):
                raise ValueError(f'B-roll beat is not backed by its approved source: {beat.id}')
        elif (beat.kind == 'motion_graphic'
              and (beat.template not in _MOTION_TEMPLATES
                   or resolved.source_asset_id is not None)):
            raise ValueError(f'motion graphic lacks a supported rendered template: {beat.id}')

        if beat.start < cursor - _EPSILON:
            raise ValueError(f'overlapping visual beats: {beat.id}')
        if beat.end - beat.start < minimum_frame - _EPSILON:
            raise ValueError(f'visual beat shorter than one output frame: {beat.id}')
        if beat.start - cursor > _EPSILON:
            if beat.start - cursor < minimum_frame - _EPSILON:
                raise ValueError(f'source gap shorter than one output frame: {beat.id}')
            scenes.append(Scene('presenter_hook', cursor, beat.start))
        if plate is None or resolved.asset_offset + beat.end - beat.start > plate.duration + 0.05:
            raise ValueError(f'animation plate too short for visual beat: {beat.id}')
        scenes.append(Scene(
            'presenter_split', beat.start, beat.end,
            asset_offset=resolved.asset_offset, title=beat.template,
        ))
        cursor = beat.end

    if not scenes:
        scenes.append(Scene('presenter_hook', 0, duration))
    elif duration - cursor > _EPSILON:
        if duration - cursor < minimum_frame - _EPSILON:
            raise ValueError('final source tail shorter than one output frame')
        scenes.append(Scene('presenter_outro', cursor, duration))
    else:
        # Avoid a tiny unrenderable tail caused by sub-millisecond rounding.
        last = scenes[-1]
        scenes[-1] = Scene(last.recipe, last.start, duration, last.asset_offset, last.title)

    result = ScenePlan(duration=duration, scenes=tuple(scenes), fps=fps, width=width, height=height)
    result.validate(asset_duration=plate.duration if plate is not None else None)
    return HarshVerseDraft(
        scene_plan=result,
        animation_asset_id=plate.asset_id if plate is not None else None,
        deferred_beat_ids=tuple(deferred_ids),
    )
