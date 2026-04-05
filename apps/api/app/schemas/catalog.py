from datetime import datetime

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
    type: str = 'video'
    subcategory: str | None = None
    slug: str | None = None
    description: str | None = None
    short_description: str | None = None
    preview_image_url: str | None = None
    preview_video_url: str | None = None
    visual_prompt: str | None = None
    inputs: list[dict] = Field(default_factory=list)
    script_hint: str | None = None
    topic_hint: str | None = None
    prompt_template: str | None = None
    active: bool = True
    trending: bool = False
    featured: bool = False
    order: int = 0
    created_by: str | None = None
    source: str | None = None
    generation_defaults: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RecipeComposerFragmentResponse(BaseModel):
    type: str
    value: str | None = None
    slot_id: str | None = None


class RecipeComposerSlotResponse(BaseModel):
    id: str
    kind: str
    label: str
    placeholder: str
    required: bool = False
    options: list[str] = Field(default_factory=list)
    sample_label: str | None = None
    sample_preview_url: str | None = None
    submit_target: str | None = None


class RecipeComposerResponse(BaseModel):
    recipe_label: str
    mode: str
    fragments: list[RecipeComposerFragmentResponse] = Field(default_factory=list)
    slots: list[RecipeComposerSlotResponse] = Field(default_factory=list)
    starter_copy: str | None = None


class RecipeCatalogResponse(BaseModel):
    id: str
    type: str
    title: str
    slug: str
    description: str
    short_label: str | None = None
    preview_video_url: str | None = None
    preview_image_url: str | None = None
    active: bool = True
    featured: bool = False
    trending: bool = False
    order: int = 0
    tags: list[str] = Field(default_factory=list)
    duration_seconds: int
    input: dict = Field(default_factory=dict)
    generation_defaults: dict = Field(default_factory=dict)
    composer: RecipeComposerResponse
