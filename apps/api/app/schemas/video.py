from datetime import datetime

from pydantic import BaseModel, Field


class VideoResponse(BaseModel):
    id: str
    user_id: str
    title: str | None
    script: str
    voice: str
    status: str
    progress: int
    image_urls: list[str] = Field(default_factory=list)
    thumbnail_url: str | None
    output_url: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class VideoCreateResponse(BaseModel):
    id: str
    status: str


class VideoRetryResponse(BaseModel):
    id: str
    status: str
