"""Versioned, strictly typed evidence for future (not yet implemented) AI edit planning."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Interval(StrictModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("Interval end must exceed start")
        return self


class Word(Interval):
    text: str = Field(min_length=1, max_length=100)


class SpeechSegment(Interval):
    id: str = Field(pattern=r"^seg_[0-9]{3}$")
    text: str = Field(min_length=1)
    word_start_index: int = Field(ge=0)
    word_end_index: int = Field(ge=0)
    timing_status: Literal["estimated", "review"]

    @model_validator(mode="after")
    def ordered_indices(self):
        if self.word_end_index < self.word_start_index:
            raise ValueError("Segment word indices must be ordered")
        return self


class TimingConflict(StrictModel):
    word_index: int = Field(ge=0)
    word_text: str
    word_start: float = Field(ge=0)
    word_end: float = Field(gt=0)
    silence_start: float = Field(ge=0)
    silence_end: float = Field(gt=0)
    overlap_seconds: float = Field(gt=0)


class TimingQuality(StrictModel):
    status: Literal["unavailable", "review_required", "no_detected_conflicts"]
    conflict_count: int = Field(ge=0)
    conflicts: list[TimingConflict] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SafeCutCandidate(StrictModel):
    id: str = Field(pattern=r"^cut_[0-9]{3}$")
    remove_start: float = Field(ge=0)
    remove_end: float = Field(gt=0)
    anchor_time: float = Field(ge=0)
    source_silence: Interval
    confidence: Literal["conservative"]
    reason: str

    @model_validator(mode="after")
    def valid_cut(self):
        if not (self.source_silence.start <= self.remove_start < self.anchor_time < self.remove_end <= self.source_silence.end):
            raise ValueError("Candidate cut must be bounded within measured silence")
        return self


class BoundingBox(StrictModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def inside_frame(self):
        if self.x + self.width > 1.001 or self.y + self.height > 1.001:
            raise ValueError("Face box must fit the normalized video frame")
        return self


class FaceSample(StrictModel):
    time: float = Field(ge=0)
    box: BoundingBox
    confidence: float = Field(ge=0, le=1)


class MediaInfo(StrictModel):
    media_id: str
    duration_seconds: float = Field(gt=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    fps: float = Field(gt=0)
    aspect_ratio: str
    has_audio: bool


class AlignmentShift(StrictModel):
    word_index: int = Field(ge=0)
    word_text: str
    original_start: float = Field(ge=0)
    original_end: float = Field(gt=0)
    aligned_start: float = Field(ge=0)
    aligned_end: float = Field(gt=0)
    start_delta_seconds: float
    end_delta_seconds: float
    max_abs_shift_seconds: float = Field(ge=0)


class AlignmentDiagnostics(StrictModel):
    max_abs_shift_seconds: float = Field(ge=0)
    median_max_abs_shift_seconds: float = Field(ge=0)
    words_over_750ms: int = Field(ge=0)
    original_conflicts: int = Field(ge=0)
    candidate_conflicts: int = Field(ge=0)
    original_strict_conflicts: int = Field(ge=0)
    candidate_strict_conflicts: int = Field(ge=0)
    largest_shifts: list[AlignmentShift] = Field(default_factory=list)


class SpeechEvidence(StrictModel):
    status: Literal["complete", "unavailable", "no_speech"]
    language: str | None = None
    words: list[Word] = Field(default_factory=list)
    segments: list[SpeechSegment] = Field(default_factory=list)
    alignment_status: Literal["not_requested", "candidate_available", "review_required", "rejected", "unavailable"] = "not_requested"
    aligned_words_candidate: list[Word] = Field(default_factory=list)
    alignment_notes: list[str] = Field(default_factory=list)
    alignment_diagnostics: AlignmentDiagnostics | None = None


class AudioEvidence(StrictModel):
    status: Literal["complete", "unavailable", "no_audio"]
    silence_intervals: list[Interval] = Field(default_factory=list)
    strict_silence_intervals: list[Interval] = Field(default_factory=list)
    speech_pause_intervals: list[Interval] = Field(default_factory=list)
    timing_quality: TimingQuality = Field(default_factory=lambda: TimingQuality(status='unavailable', conflict_count=0))
    safe_cut_candidates: list[SafeCutCandidate] = Field(default_factory=list)


class VisualEvidence(StrictModel):
    face_status: Literal["complete", "unavailable", "no_faces"]
    scene_status: Literal["complete", "unavailable"]
    face_samples: list[FaceSample] = Field(default_factory=list)
    scene_changes_seconds: list[float] = Field(default_factory=list)


class StylePreset(StrictModel):
    name: Literal["elegant", "energetic", "cinematic"]
    pacing: Literal["relaxed", "fast", "measured"]
    preferred_zoom: Literal["zoom-in", "zoom-out"]
    transition: Literal["crossfade", "slide-left"]
    effect_amount: float = Field(ge=0, le=2)


class EditingCapabilities(StrictModel):
    selected_style: str
    available_styles: list[StylePreset]
    supported_effects: list[str]
    max_timeline_seconds: float
    max_plan_operations: int
    rules: list[str]


class VideoAnalysisReport(StrictModel):
    schema_version: Literal["2.0"] = "2.0"
    media: MediaInfo
    speech: SpeechEvidence
    audio: AudioEvidence
    visual: VisualEvidence
    editing: EditingCapabilities
    warnings: list[str] = Field(default_factory=list)
