from datetime import datetime

from pydantic import BaseModel, Field


class VideoResponse(BaseModel):
    id: str
    user_id: str
    project_id: str | None = None
    mode_id: str | None = None
    template_id: str | None = None
    title: str | None
    template: str | None = None
    language: str | None = None
    script: str
    voice: str
    aspect_ratio: str
    resolution: str
    duration_mode: str
    duration_seconds: int | None
    captions_enabled: bool
    caption_style: str | None = None
    audio_sample_rate_hz: int | None = None
    status: str
    progress: int
    image_urls: list[str] = Field(default_factory=list)
    selected_model: str | None = None
    provider_name: str | None = None
    tts_provider: str | None = None
    tts_resolved_voice: str | None = None
    tts_provider_message: str | None = None
    tts_fallback_used: bool = False
    source_image_url: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    music_mode: str
    music_track_id: str | None
    music_file_url: str | None
    music_volume: int
    duck_music: bool
    thumbnail_url: str | None
    output_url: str | None
    error_message: str | None
    is_public_inspiration: bool = False
    moderation_status: str = 'draft'
    inspiration_score: int = 0
    like_count: int = 0
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


class InspirationVideoResponse(BaseModel):
    id: str
    creator_name: str
    model_key: str
    provider_name: str
    title: str
    prompt: str
    video_url: str
    thumbnail_url: str
    aspect_ratio: str
    resolution: str
    duration_seconds: int
    created_at: datetime
    tags: list[str] = Field(default_factory=list)
    like_count: int = 0
    liked_by_user: bool = False
    moderation_status: str = 'approved'
