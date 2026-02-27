from pydantic import BaseModel, Field, field_validator


SUPPORTED_REEL_TEMPLATES = {
    'History_POV',
    'Mythology_POV',
    'Titanic_POV',
    'Roman_Soldier_POV',
    'Historical_Fact_Reel',
}
SUPPORTED_VIDEO_MODELS = {'heygen', 'runway', 'genericTextVideoAPI', 'fallback'}


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
