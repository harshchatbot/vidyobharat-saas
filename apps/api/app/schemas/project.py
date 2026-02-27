from datetime import datetime

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    user_id: str = Field(min_length=2, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    script: str = Field(default='', max_length=5000)
    language: str = Field(default='hi-IN', max_length=20)
    voice: str = Field(default='Aarav', max_length=80)
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
