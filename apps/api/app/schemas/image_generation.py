from datetime import datetime

from pydantic import BaseModel, Field, field_validator


SUPPORTED_IMAGE_MODELS = {'nano_banana', 'openai_image', 'seedream', 'flux_spark', 'recraft_studio'}
SUPPORTED_ASPECT_RATIOS = {'9:16', '1:1', '16:9', '4:5'}
SUPPORTED_RESOLUTIONS = {'1024', '1536', '2048'}


class ImageModelResponse(BaseModel):
    key: str
    label: str
    description: str
    frontend_hint: str


class ImageGenerationResponse(BaseModel):
    id: str
    parent_image_id: str | None = None
    model_key: str
    prompt: str
    aspect_ratio: str
    resolution: str
    reference_urls: list[str]
    image_url: str
    thumbnail_url: str
    action_type: str | None = None
    status: str
    auto_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    applied_credits: int = 0
    remaining_credits: int | None = None
    created_at: datetime


class InspirationImageResponse(BaseModel):
    id: str
    creator_name: str
    model_key: str
    title: str
    prompt: str
    image_url: str
    aspect_ratio: str
    resolution: str
    created_at: datetime
    reference_urls: list[str]
    tags: list[str] = Field(default_factory=list)


class ImageGenerationCreateRequest(BaseModel):
    model_key: str = Field(min_length=2, max_length=64)
    prompt: str = Field(min_length=3, max_length=2000)
    aspect_ratio: str = Field(min_length=3, max_length=10)
    resolution: str = Field(min_length=3, max_length=10)
    reference_urls: list[str] = Field(default_factory=list)

    @field_validator('model_key')
    @classmethod
    def validate_model_key(cls, value: str) -> str:
        if value not in SUPPORTED_IMAGE_MODELS:
            raise ValueError('Unsupported image model')
        return value

    @field_validator('aspect_ratio')
    @classmethod
    def validate_aspect_ratio(cls, value: str) -> str:
        if value not in SUPPORTED_ASPECT_RATIOS:
            raise ValueError('Unsupported aspect ratio')
        return value

    @field_validator('resolution')
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in SUPPORTED_RESOLUTIONS:
            raise ValueError('Unsupported resolution')
        return value


class ImagePromptEnhanceRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1000)
    model_key: str | None = Field(default=None, max_length=64)


class ImagePromptEnhanceResponse(BaseModel):
    prompt: str


class ImageActionRequest(BaseModel):
    image_id: str = Field(min_length=8, max_length=64)
    action_type: str = Field(min_length=3, max_length=40)

    @field_validator('action_type')
    @classmethod
    def validate_action(cls, value: str) -> str:
        if value not in {'remove_background', 'upscale', 'variation'}:
            raise ValueError('Unsupported action')
        return value


class ImageActionResponse(BaseModel):
    action_type: str
    items: list[ImageGenerationResponse]
