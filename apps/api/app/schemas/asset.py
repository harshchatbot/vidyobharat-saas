from datetime import datetime

from pydantic import BaseModel, Field


class AssetTagItem(BaseModel):
    tag: str
    source: str


class AssetTagFacet(BaseModel):
    tag: str
    count: int


class AssetTagUpdateRequest(BaseModel):
    user_tags: list[str] = Field(default_factory=list)


class AssetSearchResponseItem(BaseModel):
    id: str
    content_type: str
    title: str
    model_key: str
    resolution: str
    aspect_ratio: str
    prompt: str
    thumbnail_url: str | None = None
    asset_url: str | None = None
    status: str
    created_at: datetime
    reference_urls: list[str] = Field(default_factory=list)
    auto_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)


class AssetSearchResponse(BaseModel):
    items: list[AssetSearchResponseItem]
    total: int
    page: int
    page_size: int
