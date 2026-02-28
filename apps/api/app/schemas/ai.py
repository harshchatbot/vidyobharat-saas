from pydantic import BaseModel, Field, field_validator


SUPPORTED_REEL_TEMPLATES = {
    'History_POV',
    'Mythology_POV',
    'Titanic_POV',
    'Roman_Soldier_POV',
    'Historical_Fact_Reel',
}
SUPPORTED_VIDEO_MODELS = {'sora2', 'veo3'}


class ReelScriptRequest(BaseModel):
    templateId: str = Field(min_length=3, max_length=64)
    topic: str = Field(min_length=2, max_length=300)
    tone: str = Field(min_length=2, max_length=80)
    language: str = Field(min_length=2, max_length=40)

    @field_validator('templateId')
    @classmethod
    def validate_template(cls, value: str) -> str:
        if value not in SUPPORTED_REEL_TEMPLATES:
            raise ValueError('Unsupported templateId')
        return value


class ReelScriptResponse(BaseModel):
    hook: str
    body_lines: list[str]
    cta: str
    caption: str
    hashtags: list[str]


class AIVideoGenerateRequest(BaseModel):
    templateId: str = Field(min_length=2, max_length=64)
    topic: str = Field(min_length=2, max_length=300)
    tone: str = Field(min_length=2, max_length=80)
    language: str = Field(min_length=2, max_length=40)
    selectedModel: str = Field(min_length=2, max_length=64)
    voice: str | None = Field(default=None, max_length=80)
    referenceImages: list[str] = Field(default_factory=list, max_length=8)

    @field_validator('selectedModel')
    @classmethod
    def validate_model(cls, value: str) -> str:
        if value not in SUPPORTED_VIDEO_MODELS:
            raise ValueError('Unsupported selectedModel')
        return value


class AIVideoGenerateResponse(BaseModel):
    videoUrl: str
    provider: str
    duration: int
    quality: str


class AIVideoModelResponse(BaseModel):
    key: str
    label: str
    description: str
    frontendHint: str
    apiAdapter: str


class AIVideoCreateRequest(BaseModel):
    imageUrl: str | None = Field(default=None, max_length=255)
    script: str = Field(min_length=1, max_length=6000)
    modelKey: str = Field(min_length=2, max_length=64)
    aspectRatio: str = Field(min_length=3, max_length=10)
    resolution: str = Field(min_length=3, max_length=20)
    durationSeconds: int = Field(ge=4, le=60)
    voice: str = Field(min_length=1, max_length=120)

    @field_validator('aspectRatio')
    @classmethod
    def validate_aspect_ratio(cls, value: str) -> str:
        if value not in {'9:16', '16:9', '1:1'}:
            raise ValueError('Unsupported aspectRatio')
        return value

    @field_validator('resolution')
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in {'720p', '1080p'}:
            raise ValueError('Unsupported resolution')
        return value

    @field_validator('modelKey')
    @classmethod
    def validate_selected_model(cls, value: str) -> str:
        if value not in SUPPORTED_VIDEO_MODELS:
            raise ValueError('Unsupported modelKey')
        return value


class AIVideoCreateResponse(BaseModel):
    videoUrl: str
    provider: str
    modelKey: str
