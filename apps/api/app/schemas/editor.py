from __future__ import annotations

from datetime import datetime
from enum import Enum
import math
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class GuestQuotaValues(BaseModel):
    uploads: int
    exports: int
    uploaded_bytes: int
    storage_bytes: int
    processing_seconds: float
    concurrent_processing: int


class GuestUsageResponse(BaseModel):
    used: GuestQuotaValues
    reserved: GuestQuotaValues
    remaining: GuestQuotaValues
    limits: GuestQuotaValues


class GuestSessionResponse(BaseModel):
    guest_id: str
    created_at: datetime
    expires_at: datetime
    status: str
    usage: GuestUsageResponse


class GuestMediaResponse(BaseModel):
    media_id: str
    media_type: str
    content_type: str
    original_filename: str
    file_size: int
    duration_seconds: float | None
    width: int
    height: int
    created_at: datetime
    expires_at: datetime
    status: str
    availability: Literal['available', 'unavailable', 'unknown'] = 'available'


class GuestMediaListResponse(BaseModel):
    items: list[GuestMediaResponse]


class PublicGuestAppConfig(BaseModel):
    max_uploads: int
    max_exports: int


class PublicMediaAppConfig(BaseModel):
    max_file_bytes: int
    max_video_duration_seconds: float


class PublicEditorAppConfig(BaseModel):
    max_clips: int
    max_duration_seconds: float


class PublicFeatureAppConfig(BaseModel):
    guest_editor_enabled: bool


class PublicAppConfigResponse(BaseModel):
    guest: PublicGuestAppConfig
    media: PublicMediaAppConfig
    editor: PublicEditorAppConfig
    features: PublicFeatureAppConfig


class TimelineCropMode(str, Enum):
    cover = 'cover'
    contain = 'contain'


class TimelineTextPosition(str, Enum):
    top = 'top'
    center = 'center'
    bottom = 'bottom'


class TimelineTextAlignment(str, Enum):
    left = 'left'
    center = 'center'
    right = 'right'


class TimelineTextInAnimation(str, Enum):
    none = 'none'
    fade_in = 'fade-in'
    slide_up = 'slide-up'
    pop_in = 'pop-in'


class TimelineTextOutAnimation(str, Enum):
    none = 'none'
    fade_out = 'fade-out'
    slide_down = 'slide-down'


class TimelineTextLoopAnimation(str, Enum):
    none = 'none'
    pulse = 'pulse'
    float = 'float'


class TimelineAudioKind(str, Enum):
    music = 'music'
    sfx = 'sfx'
    voice = 'voice'


class TimelineEffectPreset(str, Enum):
    fade_in = 'fade-in'
    fade_out = 'fade-out'
    zoom_in = 'zoom-in'
    grayscale = 'grayscale'
    blur = 'blur'
    brightness = 'brightness'
    contrast = 'contrast'
    vibrance = 'vibrance'
    vignette = 'vignette'
    saturation = 'saturation'


TimelineFontFamily = Literal['Inter', 'Lato', 'Roboto', 'Noto Sans', 'Noto Serif']


class TimelineClip(BaseModel):
    media_id: Annotated[str, Field(pattern=r'^[a-f0-9]{32}$')]
    order: Annotated[int, Field(ge=0, strict=True)]
    start_seconds: Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)] = 0
    timeline_start_seconds: Annotated[float | None, Field(ge=0, le=60, allow_inf_nan=False, strict=True)] = None
    duration_seconds: Annotated[float, Field(gt=0, le=120, allow_inf_nan=False, strict=True)]
    crop_mode: TimelineCropMode = TimelineCropMode.cover
    muted: bool = False
    volume: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)] = 1


class TimelineTextOverlay(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    text: Annotated[str, Field(min_length=1, max_length=500)]
    start_seconds: Annotated[float, Field(ge=0, le=60, allow_inf_nan=False, strict=True)]
    duration_seconds: Annotated[float, Field(gt=0, le=60, allow_inf_nan=False, strict=True)]
    font_family: TimelineFontFamily = 'Inter'
    font_size: Annotated[int, Field(ge=12, le=120, strict=True)] = 44
    color: Annotated[str, Field(pattern=r'^#[0-9a-fA-F]{6}$')] = '#ffffff'
    bold: bool = False
    position: TimelineTextPosition | None = None
    x: Annotated[float | None, Field(ge=0.02, le=0.98, allow_inf_nan=False, strict=True)] = None
    y: Annotated[float | None, Field(ge=0.02, le=0.98, allow_inf_nan=False, strict=True)] = None
    width: Annotated[float, Field(ge=0.1, le=0.96, allow_inf_nan=False, strict=True)] = 0.8
    rotation_degrees: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False, strict=True)] = 0
    alignment: TimelineTextAlignment = TimelineTextAlignment.center
    outline_color: Annotated[str, Field(pattern=r'^#[0-9a-fA-F]{6}$')] = '#000000'
    outline_width: Annotated[int, Field(ge=0, le=12, strict=True)] = 0
    shadow: bool = True
    background_color: Annotated[str, Field(pattern=r'^#[0-9a-fA-F]{6}$')] = '#000000'
    background_opacity: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)] = 0
    in_animation: TimelineTextInAnimation = TimelineTextInAnimation.none
    out_animation: TimelineTextOutAnimation = TimelineTextOutAnimation.none
    loop_animation: TimelineTextLoopAnimation = TimelineTextLoopAnimation.none
    in_animation_duration: Annotated[float, Field(ge=0.1, le=3, allow_inf_nan=False, strict=True)] = 0.5
    out_animation_duration: Annotated[float, Field(ge=0.1, le=3, allow_inf_nan=False, strict=True)] = 0.5

    @model_validator(mode='after')
    def normalize_coordinates(self) -> 'TimelineTextOverlay':
        if self.x is None:
            self.x = 0.5
        if self.y is None:
            self.y = {
                TimelineTextPosition.top: 0.12,
                TimelineTextPosition.bottom: 0.88,
            }.get(self.position, 0.5)
        if self.in_animation_duration > self.duration_seconds:
            raise ValueError('Text in-animation duration exceeds the text duration.')
        if self.out_animation_duration > self.duration_seconds:
            raise ValueError('Text out-animation duration exceeds the text duration.')
        if (
            self.in_animation != TimelineTextInAnimation.none
            and self.out_animation != TimelineTextOutAnimation.none
            and self.in_animation_duration + self.out_animation_duration > self.duration_seconds
        ):
            raise ValueError('Text in and out animations overlap.')
        return self


class TimelineAudioItem(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    media_id: Annotated[str, Field(pattern=r'^[a-f0-9]{32}$')]
    kind: TimelineAudioKind
    start_seconds: Annotated[float, Field(ge=0, le=60, allow_inf_nan=False, strict=True)]
    duration_seconds: Annotated[float, Field(gt=0, le=60, allow_inf_nan=False, strict=True)]
    source_start_seconds: Annotated[float, Field(ge=0, le=60, allow_inf_nan=False, strict=True)] = 0
    volume: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)] = 1
    muted: bool = False


class TimelineEffect(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=128)]
    preset: TimelineEffectPreset
    start_seconds: Annotated[float, Field(ge=0, le=60, allow_inf_nan=False, strict=True)]
    duration_seconds: Annotated[float, Field(gt=0, le=60, allow_inf_nan=False, strict=True)]
    amount: Annotated[float, Field(ge=0, le=2, allow_inf_nan=False, strict=True)] = 1


class TimelineComposition(BaseModel):
    aspect_ratio: Literal['9:16', '16:9', '1:1', '4:5'] = '9:16'
    width: Annotated[int, Field(ge=2, le=2160, multiple_of=2, strict=True)] = 720
    height: Annotated[int, Field(ge=2, le=3840, multiple_of=2, strict=True)] = 1280
    fps: Annotated[int, Field(ge=1, le=60, strict=True)] = 30
    quality: Literal['standard', 'high'] = 'high'
    output_filename: Annotated[str, Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$')] = 'rangmanch-export.mp4'
    duration_seconds: Annotated[float | None, Field(gt=0, le=60, allow_inf_nan=False, strict=True)] = None
    clips: Annotated[list[TimelineClip], Field(min_length=1, max_length=100)]
    text_overlays: Annotated[list[TimelineTextOverlay], Field(max_length=50)] = Field(default_factory=list)
    audio_items: Annotated[list[TimelineAudioItem], Field(max_length=24)] = Field(default_factory=list)
    effects: Annotated[list[TimelineEffect], Field(max_length=50)] = Field(default_factory=list)

    @model_validator(mode='after')
    def validate_timeline(self) -> 'TimelineComposition':
        ratios = {'9:16': (9, 16), '16:9': (16, 9), '1:1': (1, 1), '4:5': (4, 5)}
        ratio_width, ratio_height = ratios[self.aspect_ratio]
        if self.width * ratio_height != self.height * ratio_width:
            raise ValueError('Output dimensions do not match the selected aspect ratio.')
        if not self.output_filename.lower().endswith('.mp4'):
            self.output_filename += '.mp4'
        orders = sorted(clip.order for clip in self.clips)
        if orders != list(range(len(self.clips))):
            raise ValueError('Clip order values must be unique and contiguous from zero.')
        # Older API clients only send clip order; preserve their sequential behavior.
        cursor = 0.0
        ordered_clips = sorted(self.clips, key=lambda clip: clip.order)
        for clip in ordered_clips:
            if clip.timeline_start_seconds is None:
                clip.timeline_start_seconds = cursor
            if clip.duration_seconds < 1 / self.fps - 1e-9:
                raise ValueError('Each visual clip must be at least one output frame long.')
            clip.timeline_start_seconds = self._frame_time(clip.timeline_start_seconds)
            cursor = clip.timeline_start_seconds + clip.duration_seconds
        for previous, current in zip(ordered_clips, ordered_clips[1:]):
            if current.timeline_start_seconds < previous.timeline_start_seconds + previous.duration_seconds - 1e-6:
                raise ValueError('Overlapping visual clips require transition support.')
        visual_duration = max(clip.timeline_start_seconds + clip.duration_seconds for clip in ordered_clips)
        timeline_duration = (
            visual_duration
            if self.duration_seconds is None
            else self._frame_duration(self.duration_seconds)
        )
        if timeline_duration + 1e-9 < visual_duration:
            raise ValueError('Project duration cannot end before the visual timeline.')
        if timeline_duration > 60 + 1e-6:
            raise ValueError('Timeline duration exceeds the 60-second editor limit.')
        self.duration_seconds = timeline_duration
        item_ids = [item.id for item in (*self.text_overlays, *self.audio_items, *self.effects)]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError('Timeline overlay, audio, and effect IDs must be unique.')
        for item in (*self.text_overlays, *self.audio_items, *self.effects):
            item.start_seconds = self._frame_time(item.start_seconds)
            if not isinstance(item, TimelineAudioItem):
                item.duration_seconds = self._frame_duration(item.duration_seconds)
            if item.start_seconds + item.duration_seconds > timeline_duration + 1e-6:
                raise ValueError('Timeline item extends beyond the project duration.')
        return self

    def _frame_time(self, value: float) -> float:
        return round(value * self.fps) / self.fps

    def _frame_duration(self, value: float) -> float:
        return max(1 / self.fps, self._frame_time(value))


class GuestExportResponse(BaseModel):
    job_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    progress_stage: str
    status_url: str
    output: dict | None = None
    error_code: str | None = None
    message: str | None = None


class GuestExportListResponse(BaseModel):
    items: list[GuestExportResponse]
