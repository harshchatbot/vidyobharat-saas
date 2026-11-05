"""Deterministic, evidence-bound creative guidance for talking-head footage.

No LLM, no media mutations, no autonomous edits. Coordinates refer to original
full-frame normalized positions; sparse 1 FPS detections cannot guarantee every
intermediate frame is face-free. Consumer must verify export/UI safe areas.
"""
from __future__ import annotations

from app.schemas.video_analysis import (
    CaptionPlacementGuidance, CreativeGuidance, FaceSample, SpeechSegment,
    ZoomFramingGuidance,
)

_CAPTION_WIDTH = 0.84
_CAPTION_HEIGHT = 0.12  # rough caption *envelope*, not a measured glyph box
_MARGIN = 0.035
_LANES = (("top", 0.19), ("bottom", 0.78))


def _overlaps_face(center_y: float, samples: list[FaceSample]) -> bool:
    x1, x2 = 0.5 - _CAPTION_WIDTH / 2, 0.5 + _CAPTION_WIDTH / 2
    y1, y2 = center_y - _CAPTION_HEIGHT / 2, center_y + _CAPTION_HEIGHT / 2
    for sample in samples:
        box = sample.box
        left = max(0.0, box.x - _MARGIN)
        right = min(1.0, box.x + box.width + _MARGIN)
        top = max(0.0, box.y - _MARGIN)
        bottom = min(1.0, box.y + box.height + _MARGIN)
        if x1 < right and x2 > left and y1 < bottom and y2 > top:
            return True
    return False


def build_creative_guidance(
    segments: list[SpeechSegment],
    face_samples: list[FaceSample],
    face_status: str,
) -> CreativeGuidance:
    captions: list[CaptionPlacementGuidance] = []
    zooms: list[ZoomFramingGuidance] = []
    for segment in segments[:120]:
        relevant = [
            sample for sample in face_samples
            if segment.start - 0.5 <= sample.time <= segment.end + 0.5
        ]
        # Do not claim a safe zone if the detector did not observe this span.
        usable = face_status == "complete" and bool(relevant)
        preferred_y = 0.78
        caption_status = "review_required"
        reason = "Face information missing for this speech interval; check placement manually."
        if usable:
            available = [(name, y) for name, y in _LANES if not _overlaps_face(y, relevant)]
            if available:
                # Prefer conventional lower-third captions when clear.
                name, preferred_y = next(
                    ((name, y) for name, y in available if name == "bottom"), available[0],
                )
                caption_status = "suggested"
                reason = f"{name.title()} placement avoids observed face boxes; review unobserved frames and platform safe areas."
            else:
                reason = "Both caption lanes overlap detected face positions; manual placement required."
        captions.append(CaptionPlacementGuidance(
            segment_id=segment.id, start=segment.start, end=segment.end,
            status=caption_status, x=0.5, y=preferred_y,
            width=_CAPTION_WIDTH, estimated_height=_CAPTION_HEIGHT,
            face_sample_count=len(relevant), reason=reason,
        ))

        center_x, center_y = 0.5, 0.5
        zoom_status = "review_required"
        zoom_reason = "No adequate face observations; do not auto-reframe or zoom."
        max_scale = 1.0
        if usable:
            center_x = sum(s.box.x + s.box.width / 2 for s in relevant) / len(relevant)
            center_y = sum(s.box.y + s.box.height / 2 for s in relevant) / len(relevant)
            center_x = min(1.0, max(0.0, center_x))
            center_y = min(1.0, max(0.0, center_y))
            # A centered zoom can clip a subject at an edge. Only recommend
            # a very subtle centered 1.06x zoom if ALL observed face boxes
            # would fit within the visible full-frame viewport with padding.
            view_half = 0.5 / 1.06
            safe_center_zoom = all(
                s.box.x >= 0.5 - view_half + _MARGIN
                and s.box.x + s.box.width <= 0.5 + view_half - _MARGIN
                and s.box.y >= 0.5 - view_half + _MARGIN
                and s.box.y + s.box.height <= 0.5 + view_half - _MARGIN
                for s in relevant
            )
            if safe_center_zoom:
                zoom_status = "suggested"
                max_scale = 1.06
                zoom_reason = "Small centered zoom preserves observed face boxes; check intervening frames."
            else:
                zoom_reason = "Observed face nears a crop boundary; avoid default centered zoom."
        zooms.append(ZoomFramingGuidance(
            segment_id=segment.id, status=zoom_status,
            center_x=round(center_x, 4), center_y=round(center_y, 4),
            max_scale=max_scale, reason=zoom_reason,
        ))
    return CreativeGuidance(
        caption_placements=captions,
        zoom_framing=zooms,
        notes=[
            "Guidance is not an edit plan and is never applied by the backend.",
            "Face samples are sparse (1 FPS); intermediate positions and rendering must be reviewed.",
            "Captions use an estimated rectangle; actual font wrapping and platform safe zones may differ.",
            "Zoom center coordinates are advisory; existing zoom effects may not support repositioning.",
        ],
    )
