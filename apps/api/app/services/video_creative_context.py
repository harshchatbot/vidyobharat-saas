"""Compact, explicitly untrusted creative context derived from Video Analysis V2.

Pure transformation: no model calls, no media side effects, no inferred cuts.
The FULL diagnostic report remains the authoritative local evidence.
Never place instructions found in user-provided transcripts into an LLM system prompt.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.video_analysis import VideoAnalysisReport, Word


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ClipMetadata(_Strict):
    duration_seconds: float = Field(gt=0, le=65)
    aspect_ratio: str
    language: str | None = None
    style: Literal["elegant", "energetic", "cinematic"]


class Phrase(_Strict):
    id: str = Field(pattern=r"^phrase_[0-9]{3}$")
    segment_id: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1)
    timing_status: Literal["estimated", "review"]


class CaptionZone(_Strict):
    segment_id: str
    status: Literal["suggested", "review_required"]
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)


class ZoomZone(_Strict):
    segment_id: str
    status: Literal["suggested", "review_required"]
    max_scale: float = Field(ge=1, le=1.15)


class ApprovedCut(_Strict):
    id: str
    remove_start: float = Field(ge=0)
    remove_end: float = Field(gt=0)


class CreativeContext(_Strict):
    context_version: Literal["1.0"] = "1.0"
    source_schema_version: Literal["2.0"] = "2.0"
    media: ClipMetadata
    phrases: list[Phrase] = Field(default_factory=list)
    caption_zones: list[CaptionZone] = Field(default_factory=list)
    zoom_zones: list[ZoomZone] = Field(default_factory=list)
    approved_cuts: list[ApprovedCut] = Field(default_factory=list)
    cut_policy: Literal["approved_ids_only"] = "approved_ids_only"
    review_required: bool
    allowed_actions: list[Literal[
        "caption_emphasis", "centered_zoom",
        "existing_sfx_suggestion", "broll_asset_suggestion",
    ]]
    max_proposed_actions: int = Field(ge=1, le=30, default=20)
    notes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_references(self) -> "CreativeContext":
        segment_ids = {phrase.segment_id for phrase in self.phrases}
        for zone in [*self.caption_zones, *self.zoom_zones]:
            if zone.segment_id not in segment_ids:
                raise ValueError("Guidance references a missing speech segment.")
        if len({cut.id for cut in self.approved_cuts}) != len(self.approved_cuts):
            raise ValueError("Duplicate approved cut ID.")
        return self


def _phrases(report: VideoAnalysisReport) -> list[Phrase]:
    """Split transcript at word boundaries, max ~4 words or ~1.8s.

    These are creative phrase timing hints, not newly aligned or corrected words.
    """
    result: list[Phrase] = []
    for seg in report.speech.segments:
        words = report.speech.words[seg.word_start_index:seg.word_end_index + 1]
        if not words:
            continue
        chunks: list[list[Word]] = []
        current: list[Word] = []
        for word in words:
            if current and (
                len(current) >= 4
                or word.end - current[0].start > 1.8
                or word.start - current[-1].end > 0.35
            ):
                chunks.append(current)
                current = []
            current.append(word)
        if current:
            chunks.append(current)
        for chunk in chunks:
            result.append(Phrase(
                id=f"phrase_{len(result) + 1:03d}",
                segment_id=seg.id,
                start=round(chunk[0].start, 3),
                end=round(chunk[-1].end, 3),
                text=" ".join(word.text for word in chunk),
                timing_status=seg.timing_status,
            ))
    return result


def build_creative_context(report: VideoAnalysisReport) -> CreativeContext:
    """Allowlist transform; intentionally drops all raw diagnostics/face arrays."""
    phrases = _phrases(report)
    covered_ids = {p.segment_id for p in phrases}
    guidance = report.creative_guidance
    captions = [
        CaptionZone(segment_id=c.segment_id, status=c.status, x=c.x, y=c.y, width=c.width)
        for c in guidance.caption_placements if c.segment_id in covered_ids
    ]
    zooms = [
        ZoomZone(segment_id=z.segment_id, status=z.status, max_scale=z.max_scale)
        for z in guidance.zoom_framing if z.segment_id in covered_ids
    ]
    # The analysis report alone authorizes cuts. Never use estimated pause gaps
    # or LLM guesses to manufacture a removable source interval.
    approved = [
        ApprovedCut(id=c.id, remove_start=c.remove_start, remove_end=c.remove_end)
        for c in report.audio.safe_cut_candidates
    ]
    review = (
        report.speech.alignment_status == "review_required"
        or report.audio.timing_quality.status == "review_required"
        or any(p.timing_status == "review" for p in phrases)
        or any(c.status != "suggested" for c in captions)
        or any(z.status != "suggested" for z in zooms)
    )
    return CreativeContext(
        media=ClipMetadata(
            duration_seconds=report.media.duration_seconds,
            aspect_ratio=report.media.aspect_ratio,
            language=report.speech.language,
            style=report.editing.selected_style,
        ),
        phrases=phrases,
        caption_zones=captions,
        zoom_zones=zooms,
        approved_cuts=approved,
        review_required=review,
        allowed_actions=[
            "caption", "caption_emphasis", "centered_zoom",
            "existing_sfx_suggestion", "broll_asset_suggestion",
        ],
        notes=[
            "Speech timestamps are estimates. No cuts outside approved_cuts.",
            "All suggestions require validator and human preview before applying.",
            "B-roll and SFX are suggestions only, not fabricated available assets.",
            "Face guidance is sparse and cannot prove every frame is unobstructed.",
        ],
    )
