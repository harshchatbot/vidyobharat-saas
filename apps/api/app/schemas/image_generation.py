from datetime import datetime

from pydantic import BaseModel, Field, field_validator


SUPPORTED_IMAGE_MODELS = {
    'budget_image_model',
    'gpt_image_1_5',
    'recraft',
    'gemini_flash_image',
    'gemini_pro_image',
    'openai_image',
    'recraft_studio',
}
IMAGE_MODEL_ALIASES = {
    'nano_banana': 'gemini_flash_image',
    'budget_image_model': 'budget_image_model',
    'gpt_image_1_5': 'gpt_image_1_5',
    'recraft': 'recraft',
}
SUPPORTED_ASPECT_RATIOS = {'9:16', '1:1', '16:9', '4:5'}
SUPPORTED_RESOLUTIONS = {'1024', '1536', '2048'}


class ImageModelResponse(BaseModel):
    key: str
    label: str
    description: str
    frontend_hint: str
    provider: str
    badge: str
    logo_label: str
    alias_hint: str | None = None
    provider_id: str | None = None
    canonical_model_key: str | None = None
    mode_ids: list[str] = Field(default_factory=list)
    billing_unit: str | None = None


class ImageGenerationResponse(BaseModel):
    id: str
    parent_image_id: str | None = None
    project_id: str | None = None
    mode_id: str | None = None
    template_id: str | None = None
    model_key: str
    prompt: str
    aspect_ratio: str
    resolution: str
    reference_urls: list[str]
    image_url: str
    thumbnail_url: str
    action_type: str | None = None
    status: str
    is_public_inspiration: bool = False
    moderation_status: str = 'draft'
    inspiration_score: int = 0
    like_count: int = 0
    auto_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    tagging_status: str | None = None
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
    like_count: int = 0
    liked_by_user: bool = False
    moderation_status: str = 'approved'


class ImageGenerationCreateRequest(BaseModel):
    model_key: str = Field(min_length=2, max_length=64)
    prompt: str = Field(min_length=3, max_length=2000)
    aspect_ratio: str = Field(min_length=3, max_length=10)
    resolution: str = Field(min_length=3, max_length=10)
    image_count: int = Field(default=1, ge=1, le=4, alias='imageCount')
    reference_urls: list[str] = Field(default_factory=list)
    reference_mode: str = Field(default='inspiration', max_length=24, alias='referenceMode')
    project_id: str | None = Field(default=None, max_length=64, alias='projectId')
    mode_id: str | None = Field(default=None, max_length=80, alias='modeId')
    template_id: str | None = Field(default=None, max_length=120, alias='templateId')

    model_config = {'populate_by_name': True}

    @field_validator('model_key')
    @classmethod
    def validate_model_key(cls, value: str) -> str:
        normalized = IMAGE_MODEL_ALIASES.get(value, value)
        value = normalized
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

    @field_validator('reference_mode')
    @classmethod
    def validate_reference_mode(cls, value: str) -> str:
        if value not in {'inspiration', 'edit'}:
            raise ValueError('Unsupported reference mode')
        return value


class ImagePromptEnhanceRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
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
