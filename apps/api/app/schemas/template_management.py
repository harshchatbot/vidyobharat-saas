from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TemplateType = Literal['video', 'image']
TemplateInputType = Literal['text', 'textarea', 'select', 'number']


class TemplateInputOption(BaseModel):
    label: str | None = None
    value: str


class TemplateInputField(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=120)
    type: TemplateInputType = 'text'
    required: bool = True
    placeholder: str | None = Field(default=None, max_length=255)
    options: list[TemplateInputOption | str] = Field(default_factory=list)

    @field_validator('key')
    @classmethod
    def normalize_key(cls, value: str) -> str:
        return value.strip()


class TemplateGenerationDefaults(BaseModel):
    model_key: str | None = Field(default=None, max_length=64)
    aspect_ratio: str | None = Field(default=None, max_length=10)
    resolution: str | None = Field(default=None, max_length=20)
    voice: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, max_length=40)
    duration_seconds: int | None = Field(default=None, ge=3, le=300)
    quality: str | None = Field(default=None, max_length=20)


class TemplateRecommendedModel(BaseModel):
    mode: str | None = None
    label: str | None = None
    description: str | None = None
    group: str | None = None
    internal_model_key: str | None = None


class UnifiedTemplateResponse(BaseModel):
    id: str
    type: TemplateType
    medium: TemplateType | None = None
    category: str
    subcategory: str | None = None
    name: str
    title: str | None = None
    slug: str
    description: str
    short_description: str
    thumbnail_url: str
    preview_image_url: str | None = None
    preview_video_url: str | None = None
    visual_prompt: str | None = None
    aspect_ratio: str = '9:16'
    inputs: list[TemplateInputField] = Field(default_factory=list)
    script_hint: str | None = None
    topic_hint: str | None = None
    prompt_template: str
    active: bool = True
    trending: bool = False
    featured: bool = False
    order: int = 0
    created_by: str | None = None
    source: str | None = None
    generation_defaults: TemplateGenerationDefaults = Field(default_factory=TemplateGenerationDefaults)
    badge: str | None = None
    is_featured: bool = False
    is_quick_start: bool = False
    default_model_mode: str | None = None
    prompt_assembler_key: str | None = None
    input_schema: list[TemplateInputField] = Field(default_factory=list)
    legacy_mappings: list[str] = Field(default_factory=list)
    suggested_platforms: list[str] = Field(default_factory=list)
    suggested_durations: list[int] = Field(default_factory=list)
    suggested_styles: list[str] = Field(default_factory=list)
    safety_profile: str | None = None
    recommended_model: TemplateRecommendedModel = Field(default_factory=TemplateRecommendedModel)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TemplateUpsertRequest(BaseModel):
    id: str | None = Field(default=None, max_length=120)
    type: TemplateType
    category: str = Field(min_length=2, max_length=80)
    subcategory: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=3, max_length=500)
    short_description: str = Field(min_length=3, max_length=160)
    thumbnail_url: str = Field(min_length=1, max_length=5000)
    preview_image_url: str | None = Field(default=None, max_length=5000)
    preview_video_url: str | None = Field(default=None, max_length=5000)
    visual_prompt: str | None = Field(default=None, max_length=2000)
    aspect_ratio: str = Field(default='9:16', max_length=10)
    inputs: list[TemplateInputField] = Field(default_factory=list)
    script_hint: str | None = Field(default=None, max_length=600)
    topic_hint: str | None = Field(default=None, max_length=600)
    prompt_template: str = Field(min_length=3, max_length=4000)
    active: bool = True
    trending: bool = False
    featured: bool = False
    order: int = 0
    generation_defaults: TemplateGenerationDefaults = Field(default_factory=TemplateGenerationDefaults)
    badge: str | None = Field(default=None, max_length=80)
    is_featured: bool = False
    is_quick_start: bool = False
    default_model_mode: str | None = Field(default=None, max_length=80)
    prompt_assembler_key: str | None = Field(default=None, max_length=120)
    legacy_mappings: list[str] = Field(default_factory=list)
    suggested_platforms: list[str] = Field(default_factory=list)
    suggested_durations: list[int] = Field(default_factory=list)
    suggested_styles: list[str] = Field(default_factory=list)
    safety_profile: str | None = Field(default=None, max_length=120)


class TemplateStatusUpdateRequest(BaseModel):
    active: bool
    trending: bool | None = None
    featured: bool | None = None


class TemplateGenerateRequest(BaseModel):
    template_id: str = Field(min_length=2, max_length=120, alias='templateId')
    inputs: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    model_key: str | None = Field(default=None, max_length=64, alias='modelKey')
    aspect_ratio: str | None = Field(default=None, max_length=10, alias='aspectRatio')
    resolution: str | None = Field(default=None, max_length=20)
    language: str | None = Field(default=None, max_length=40)
    voice: str | None = Field(default=None, max_length=120)
    duration_seconds: int | None = Field(default=None, ge=3, le=300, alias='durationSeconds')
    quality: str | None = Field(default=None, max_length=20)
    prompt_override: str | None = Field(default=None, max_length=6000, alias='promptOverride')

    model_config = {'populate_by_name': True}


class TemplatePreviewResponse(BaseModel):
    template_id: str = Field(alias='templateId')
    content_type: TemplateType = Field(alias='contentType')
    prompt_preview: str = Field(alias='promptPreview')
    script_preview: str | None = Field(default=None, alias='scriptPreview')
    recommended_model: TemplateRecommendedModel = Field(default_factory=TemplateRecommendedModel, alias='recommendedModel')

    model_config = {'populate_by_name': True}


class TemplateGenerateResponse(BaseModel):
    template_id: str = Field(alias='templateId')
    content_type: TemplateType = Field(alias='contentType')
    asset_id: str = Field(alias='assetId')
    status: str
    image_url: str | None = Field(default=None, alias='imageUrl')
    video_url: str | None = Field(default=None, alias='videoUrl')
    thumbnail_url: str | None = Field(default=None, alias='thumbnailUrl')
    applied_credits: int = Field(default=0, alias='appliedCredits')
    remaining_credits: int | None = Field(default=None, alias='remainingCredits')
    provider: str | None = None
    model_key: str | None = Field(default=None, alias='modelKey')

    model_config = {'populate_by_name': True}
