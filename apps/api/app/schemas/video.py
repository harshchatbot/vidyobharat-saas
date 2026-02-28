from datetime import datetime

from pydantic import BaseModel, Field


class VideoResponse(BaseModel):
    id: str
    user_id: str
    title: str | None
    script: str
    voice: str
    aspect_ratio: str
    resolution: str
    duration_mode: str
    duration_seconds: int | None
    captions_enabled: bool
    status: str
    progress: int
    image_urls: list[str] = Field(default_factory=list)
    selected_model: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    music_mode: str
    music_track_id: str | None
    music_file_url: str | None
    music_volume: int
    duck_music: bool
    thumbnail_url: str | None
    output_url: str | None
    error_message: str | None
    auto_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class VideoCreateResponse(BaseModel):
    id: str
    status: str


class VideoRetryResponse(BaseModel):
    id: str
    status: str


class MusicTrackResponse(BaseModel):
    id: str
    name: str
    duration_sec: int | None = None
    preview_url: str
