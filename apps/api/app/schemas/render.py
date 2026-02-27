from datetime import datetime

from pydantic import BaseModel, Field


class CreateRenderRequest(BaseModel):
    project_id: str = Field(min_length=2, max_length=64)
    user_id: str = Field(min_length=2, max_length=64)
    include_broll: bool = False


class RenderResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    status: str
    progress: int
    video_url: str | None
    thumbnail_url: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
