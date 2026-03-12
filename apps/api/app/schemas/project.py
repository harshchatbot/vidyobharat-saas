from datetime import datetime

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    user_id: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    script: str = Field(default='', max_length=5000)
    language: str = Field(default='hi-IN', max_length=20)
    voice: str = Field(default='Shubh', max_length=80)
    template: str = Field(default='clean-corporate', max_length=80)


class UpdateProjectRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    script: str | None = Field(default=None, max_length=5000)
    language: str | None = Field(default=None, max_length=20)
    voice: str | None = Field(default=None, max_length=80)
    template: str | None = Field(default=None, max_length=80)


class ProjectResponse(BaseModel):
    id: str
    user_id: str
    title: str
    script: str
    language: str
    voice: str
    template: str
    created_at: datetime
    updated_at: datetime | None = None
    last_activity_at: datetime | None = None
    image_count: int = 0
    video_count: int = 0
    last_output_thumbnail_url: str | None = None
    last_prompt_snippet: str | None = None

    class Config:
        from_attributes = True


class CreateProjectAssetRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=120)
    kind: str = Field(default='brand_asset', max_length=40)


class ProjectAssetResponse(BaseModel):
    asset_id: str
    project_id: str
    kind: str
    upload_url: str
    public_url: str


class AssignAssetProjectRequest(BaseModel):
    project_id: str = Field(min_length=2, max_length=64, alias='projectId')


class AssetProjectAssignmentResponse(BaseModel):
    asset_id: str
    content_type: str
    project_id: str
    previous_project_id: str | None = None
