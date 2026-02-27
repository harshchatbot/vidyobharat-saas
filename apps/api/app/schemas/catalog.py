from pydantic import BaseModel, Field


class AvatarResponse(BaseModel):
    id: str
    name: str
    scope: str
    style: str
    language_tags: list[str] = Field(default_factory=list)
    thumbnail_url: str


class TemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    aspect_ratio: str
    thumbnail_url: str
