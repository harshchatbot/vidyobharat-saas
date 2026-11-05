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


class SpeechEvidence(StrictModel):
    status: Literal["complete", "unavailable", "no_speech"]
    language: str | None = None
    words: list[Word] = Field(default_factory=list)


class AudioEvidence(StrictModel):
    status: Literal["complete", "unavailable", "no_audio"]
    silence_intervals: list[Interval] = Field(default_factory=list)
    speech_pause_intervals: list[Interval] = Field(default_factory=list)


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
    schema_version: Literal["1.0"] = "1.0"
    media: MediaInfo
    speech: SpeechEvidence
    audio: AudioEvidence
    visual: VisualEvidence
    editing: EditingCapabilities
    warnings: list[str] = Field(default_factory=list)
