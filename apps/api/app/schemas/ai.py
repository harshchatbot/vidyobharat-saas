from pydantic import BaseModel, Field, field_validator


SUPPORTED_REEL_TEMPLATES = {
    'History_POV',
    'Mythology_POV',
    'Titanic_POV',
    'Roman_Soldier_POV',
    'Historical_Fact_Reel',
}
SUPPORTED_VIDEO_MODELS = {'sora2', 'veo3', 'kling3'}


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


class VideoMusicSettings(BaseModel):
    type: str = Field(default='none', max_length=16)
    url: str | None = Field(default=None, max_length=5000)

    @field_validator('type')
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in {'library', 'upload', 'none'}:
            raise ValueError('Unsupported music type')
        return value


class VideoAudioSettings(BaseModel):
    volume: int = Field(default=20, ge=0, le=100)
    ducking: bool = True
    sampleRateHz: int = Field(default=22050, ge=8000, le=48000)


class AIVideoCreateRequest(BaseModel):
    template: str = Field(min_length=2, max_length=80)
    script: str = Field(min_length=1, max_length=6000)
    tags: list[str] = Field(default_factory=list)
    modelKey: str = Field(min_length=2, max_length=64)
    language: str = Field(min_length=2, max_length=40)
    aspectRatio: str = Field(min_length=3, max_length=10)
    resolution: str = Field(min_length=3, max_length=20)
    durationMode: str = Field(min_length=4, max_length=10)
    durationSeconds: int | None = Field(default=None, ge=3, le=300)
    voice: str = Field(min_length=1, max_length=120)
    imageUrls: list[str] = Field(default_factory=list)
    music: VideoMusicSettings = Field(default_factory=VideoMusicSettings)
    audioSettings: VideoAudioSettings = Field(default_factory=VideoAudioSettings)
    captionsEnabled: bool = True
    captionStyle: str = Field(default='classic', max_length=40)

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

    @field_validator('durationMode')
    @classmethod
    def validate_duration_mode(cls, value: str) -> str:
        if value not in {'auto', 'custom'}:
            raise ValueError('Unsupported durationMode')
        return value

    @field_validator('modelKey')
    @classmethod
    def validate_selected_model(cls, value: str) -> str:
        if value not in SUPPORTED_VIDEO_MODELS:
            raise ValueError('Unsupported modelKey')
        return value


class AIVideoCreateResponse(BaseModel):
    id: str
    status: str
    videoUrl: str | None = None
    provider: str | None = None
    modelKey: str


class AIVideoStatusResponse(BaseModel):
    id: str
    status: str
    videoUrl: str | None = None
    modelKey: str | None = None
    modelLabel: str | None = None
    provider: str | None = None
    resolution: str
    aspectRatio: str
    durationSeconds: int | None = None
    tags: list[str] = Field(default_factory=list)
    errorMessage: str | None = None
    thumbnailUrl: str | None = None


class ScriptGenerateRequest(BaseModel):
    template: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=300)
    language: str = Field(min_length=2, max_length=40)


class ScriptEnhanceRequest(BaseModel):
    script: str = Field(min_length=3, max_length=6000)
    template: str | None = Field(default=None, max_length=80)
    language: str = Field(default='English', max_length=40)


class ScriptTagsRequest(BaseModel):
    script: str = Field(min_length=3, max_length=6000)


class ScriptResponse(BaseModel):
    script: str
    tags: list[str]


class ScriptTranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=6000)
    target_language: str = Field(min_length=2, max_length=40)


class TextResponse(BaseModel):
    text: str
