from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class InfluencerPersonaBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    gender_identity: str | None = Field(default=None, max_length=80)
    niche: str | None = Field(default=None, max_length=120)
    tone: str | None = Field(default=None, max_length=80)
    catchphrase: str | None = Field(default=None, max_length=255)
    personality_traits: list[str] = Field(default_factory=list)
    backstory: str | None = Field(default=None, max_length=4000)
    visual_description: str = Field(min_length=3, max_length=2000)
    character_locked: bool = True

    @field_validator('personality_traits')
    @classmethod
    def normalize_traits(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item and item.strip()][:12]


class InfluencerPersonaCreateRequest(InfluencerPersonaBase):
    pass


class InfluencerPersonaUpdateRequest(InfluencerPersonaBase):
    pass


class InfluencerPersonaResponse(BaseModel):
    id: str
    user_id: str
    name: str
    gender_identity: str | None = None
    niche: str | None = None
    tone: str | None = None
    catchphrase: str | None = None
    personality_traits: list[str] = Field(default_factory=list)
    backstory: str | None = None
    visual_description: str
    reference_image_url: str | None = None
    style_embedding_vector: list[float] = Field(default_factory=list)
    system_prompt_template: str | None = None
    character_locked: bool = True
    created_at: datetime
    updated_at: datetime


class InfluencerContentGenerateRequest(BaseModel):
    persona_id: str = Field(min_length=8, max_length=64)
    intent: str = Field(min_length=3, max_length=2000)
    platform: str = Field(min_length=2, max_length=32)

    @field_validator('platform')
    @classmethod
    def validate_platform(cls, value: str) -> str:
        allowed = {'linkedin', 'reels', 'twitter', 'youtube'}
        if value not in allowed:
            raise ValueError('Unsupported platform')
        return value


class InfluencerContentResponse(BaseModel):
    title: str
    intro: str
    content_blocks: list[str] = Field(default_factory=list)
    motivational_close: str
    cta: str
    tags: list[str] = Field(default_factory=list)
    applied_credits: int = 0
    remaining_credits: int | None = None


class InfluencerReferenceLockResponse(BaseModel):
    persona: InfluencerPersonaResponse
    message: str


class InfluencerImageGenerateRequest(BaseModel):
    persona_id: str = Field(min_length=8, max_length=64)
    pose: str = Field(min_length=2, max_length=120)
    scene: str = Field(min_length=2, max_length=120)
    custom_pose: str | None = Field(default=None, max_length=255)
    model_key: str = Field(default='openai_image', max_length=64)
    aspect_ratio: str = Field(default='9:16', max_length=10)
    resolution: str = Field(default='1536', max_length=10)


class InfluencerScenePresetResponse(BaseModel):
    id: str | None = None
    key: str
    label: str
    description: str
    environment: str | None = None
    props: str | None = None
    lighting: str | None = None
    mood: str | None = None
    negative_constraints: str | None = None
    is_system: bool = False


class InfluencerScenePresetCreateRequest(BaseModel):
    persona_id: str | None = Field(default=None, min_length=8, max_length=64)
    label: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=3, max_length=255)
    environment: str = Field(min_length=3, max_length=500)
    props: str | None = Field(default=None, max_length=255)
    lighting: str | None = Field(default=None, max_length=120)
    mood: str | None = Field(default=None, max_length=120)
    negative_constraints: str | None = Field(default=None, max_length=500)


class InfluencerPoseOptionResponse(BaseModel):
    key: str
    label: str
    description: str
