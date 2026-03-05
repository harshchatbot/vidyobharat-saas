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
    is_public_inspiration: bool = False
    moderation_status: str = 'draft'
    inspiration_score: int = 0
    like_count: int = 0


class AssetSearchResponse(BaseModel):
    items: list[AssetSearchResponseItem]
    total: int
    page: int
    page_size: int


class InspirationPublishRequest(BaseModel):
    content_type: str
    asset_id: str
    publish: bool = True


class InspirationPublishResponse(BaseModel):
    asset_id: str
    content_type: str
    is_public_inspiration: bool
    moderation_status: str
    inspiration_score: int
    like_count: int


class InspirationLikeRequest(BaseModel):
    content_type: str
    asset_id: str
    liked: bool | None = None


class InspirationLikeResponse(BaseModel):
    asset_id: str
    content_type: str
    liked: bool
    like_count: int
