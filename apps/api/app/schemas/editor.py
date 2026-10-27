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


class GuestMediaListResponse(BaseModel):
    items: list[GuestMediaResponse]


class TimelineCropMode(str, Enum):
    cover = 'cover'
    contain = 'contain'


class TimelineClip(BaseModel):
    media_id: Annotated[str, Field(pattern=r'^[a-f0-9]{32}$')]
    order: Annotated[int, Field(ge=0, strict=True)]
    start_seconds: Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)] = 0
    duration_seconds: Annotated[float, Field(gt=0, le=120, allow_inf_nan=False, strict=True)]
    crop_mode: TimelineCropMode = TimelineCropMode.cover


class TimelineComposition(BaseModel):
    aspect_ratio: Literal['9:16'] = '9:16'
    width: Annotated[int, Field(ge=2, le=2160, multiple_of=2, strict=True)] = 720
    height: Annotated[int, Field(ge=2, le=3840, multiple_of=2, strict=True)] = 1280
    fps: Annotated[int, Field(ge=1, le=60, strict=True)] = 30
    clips: Annotated[list[TimelineClip], Field(min_length=1, max_length=100)]

    @model_validator(mode='after')
    def validate_timeline(self) -> 'TimelineComposition':
        if self.width * 16 != self.height * 9:
            raise ValueError('Output dimensions must use an exact 9:16 aspect ratio.')
        orders = sorted(clip.order for clip in self.clips)
        if orders != list(range(len(self.clips))):
            raise ValueError('Clip order values must be unique and contiguous from zero.')
        if math.fsum(clip.duration_seconds for clip in self.clips) > 120:
            raise ValueError('Timeline duration exceeds the schema maximum of 120 seconds.')
        return self
