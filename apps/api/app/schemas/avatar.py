from typing import Literal, Optional
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