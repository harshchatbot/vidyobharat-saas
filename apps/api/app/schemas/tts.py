from pydantic import BaseModel, Field


class TTSLanguageOptionResponse(BaseModel):
    code: str
    label: str
    native_label: str


class TTSVoiceOptionResponse(BaseModel):
    key: str
    label: str
    tone: str
    gender: str
    provider_voice: str
    supported_language_codes: list[str] = Field(default_factory=list)
    description: str


class TTSCatalogResponse(BaseModel):
    provider: str
    model: str
    languages: list[TTSLanguageOptionResponse] = Field(default_factory=list)
    voices: list[TTSVoiceOptionResponse] = Field(default_factory=list)


class TTSPreviewRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    language: str = Field(min_length=2, max_length=40)
    voice: str = Field(min_length=1, max_length=80)
    sample_rate_hz: int = Field(default=22050, ge=8000, le=48000)


class TTSPreviewResponse(BaseModel):
    preview_url: str
    provider: str
    resolved_voice: str
    cached: bool
    preview_limit: str
    provider_message: str | None = None
    applied_credits: int = 0
    remaining_credits: int | None = None
