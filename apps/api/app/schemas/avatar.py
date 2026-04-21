from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, HttpUrl


class CreateAvatarRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    reference_image_url: HttpUrl
    preferred_voice: Optional[str] = "shubh"


class CreateAvatarResponse(BaseModel):
    avatar_id: str
    name: str
    reference_image_url: str
    preferred_voice: str
    status: Literal["ready_for_preview"]


class GenerateAvatarPreviewRequest(BaseModel):
    script: str = Field(min_length=1, max_length=500)
    voice: Optional[str] = "shubh"
    language_code: Optional[str] = "en-IN"


class GenerateAvatarPreviewResponse(BaseModel):
    job_id: str
    avatar_id: str
    status: Literal["queued", "processing", "completed", "failed"]


class AvatarPreviewStatusResponse(BaseModel):
    job_id: str
    avatar_id: str
    status: Literal["queued", "processing", "completed", "failed"]
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    error_message: Optional[str] = None


class ActorCreateResponse(BaseModel):
    actor_id: str
    status: str


class ActorVisibilityUpdateRequest(BaseModel):
    scope: Literal["own", "public"]


class ActorVisibilityUpdateResponse(BaseModel):
    actor_id: str
    scope: Literal["own", "public"]
    status: str


class ActorDetailResponse(BaseModel):
    id: str
    name: str
    thumbnail_url: str
    reference_images: list[str] = Field(default_factory=list)
    primary_image: str | None = None
    preview_video_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    category: str | None = None
    language_support: list[str] = Field(default_factory=list)
    prompt_template: str | None = None
    negative_prompt: str | None = None
    recommended_voice: str | None = None
    created_at: Any | None = None
    status: str
    scope: str = "own"


class TestAvatarRequest(BaseModel):
    actor_id: str = Field(min_length=1, max_length=120)
    script_text: str = Field(min_length=1, max_length=1200)


class TestAvatarResponse(BaseModel):
    status: str
    video_url: str
    actor_id: str
    duration: float | None = None
    audio_url: str | None = None
    selected_reference_image: str | None = None
    retry_attempts: int = 0
