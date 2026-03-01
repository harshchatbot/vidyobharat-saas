from datetime import datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator


class CreditBreakdownItem(BaseModel):
    feature: str
    cost: int


class EstimateBreakdownItem(BaseModel):
    component: str
    value: float
    label: str | None = None


class CreditWalletResponse(BaseModel):
    currentCredits: int
    monthlyCredits: int
    usedCredits: int
    planName: str
    lastReset: datetime


class CreditHistoryItemResponse(BaseModel):
    id: int
    featureName: str
    creditsUsed: int
    remainingBalance: int
    transactionType: str
    source: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime


class CreditHistoryResponse(BaseModel):
    items: list[CreditHistoryItemResponse] = Field(default_factory=list)


class TopUpCreditsRequest(BaseModel):
    credits: int = Field(ge=1, le=100000)


class CreditTopUpOrderRequest(BaseModel):
    planName: str = Field(min_length=3, max_length=32)


class CreditTopUpOrderResponse(BaseModel):
    provider: str
    region: str
    country: str
    planName: str
    orderId: str | None = None
    keyId: str | None = None
    checkoutSessionId: str | None = None
    checkoutUrl: str | None = None
    amountMinor: int
    currency: str
    credits: int
    message: str | None = None


class CreditTopUpVerifyRequest(BaseModel):
    provider: str = Field(min_length=3, max_length=24)
    providerOrderId: str = Field(min_length=4, max_length=160)
    providerPaymentId: str = Field(min_length=4, max_length=160)
    providerSignature: str = Field(min_length=8, max_length=255)


class TopUpCreditsResponse(BaseModel):
    wallet: CreditWalletResponse
    addedCredits: int


class EstimateCreditsRequest(BaseModel):
    action: str = Field(min_length=2, max_length=80)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator('action')
    @classmethod
    def validate_action(cls, value: str) -> str:
        allowed = {
            'tts_preview',
            'image_generate',
            'image_action',
            'video_create',
            'script_enhance',
            'script_generate',
            'video_retry',
        }
        if value not in allowed:
            raise ValueError('Unsupported action')
        return value

    @model_validator(mode='after')
    def validate_payload(self) -> 'EstimateCreditsRequest':
        payload = self.payload or {}
        if self.action == 'video_create':
            self.payload = VideoEstimatePayload.model_validate(payload).model_dump()
        elif self.action == 'image_generate':
            self.payload = ImageEstimatePayload.model_validate(payload).model_dump()
        elif self.action == 'tts_preview':
            self.payload = VoiceEstimatePayload.model_validate(payload).model_dump()
        return self


class EstimateCreditsResponse(BaseModel):
    estimatedCredits: int
    breakdown: list[EstimateBreakdownItem] = Field(default_factory=list)
    currentCredits: int
    remainingCredits: int
    sufficient: bool
    premium: bool


class PricingResponse(BaseModel):
    region: str
    country: str
    currency: str
    paymentProvider: str
    plans: dict[str, int]
    creditAllocation: dict[str, int]
    actionCosts: list[CreditBreakdownItem] = Field(default_factory=list)


class VideoEstimatePayload(BaseModel):
    model: str = Field(validation_alias=AliasChoices('model', 'modelKey', 'selectedModel'))
    resolution: str
    durationSeconds: int = Field(validation_alias=AliasChoices('durationSeconds'))
    quality: str = 'standard'

    @field_validator('model')
    @classmethod
    def validate_model(cls, value: str) -> str:
        if value not in {'sora2', 'veo3', 'kling3'}:
            raise ValueError('Unsupported model')
        return value

    @field_validator('resolution')
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in {'720p', '1080p'}:
            raise ValueError('Unsupported resolution')
        return value

    @field_validator('quality')
    @classmethod
    def validate_quality(cls, value: str) -> str:
        if value not in {'standard', 'high'}:
            raise ValueError('Unsupported quality')
        return value


class ImageEstimatePayload(BaseModel):
    resolution: str
    model: str = Field(validation_alias=AliasChoices('model', 'model_key', 'modelKey'))

    @field_validator('resolution')
    @classmethod
    def validate_resolution(cls, value: str) -> str:
        if value not in {'512', '1024', '1536', '2048'}:
            raise ValueError('Unsupported resolution')
        return value


class VoiceEstimatePayload(BaseModel):
    provider: str = Field(validation_alias=AliasChoices('provider'))
    sampleRate: int = Field(validation_alias=AliasChoices('sampleRate', 'sample_rate_hz', 'sampleRateHz'))

    @field_validator('provider')
    @classmethod
    def validate_provider(cls, value: str) -> str:
        if value not in {'free', 'sarvam', 'elevenlabs'}:
            raise ValueError('Unsupported provider')
        return value

    @field_validator('sampleRate')
    @classmethod
    def validate_sample_rate(cls, value: int) -> int:
        if value not in {8000, 22050, 48000}:
            raise ValueError('Unsupported sample rate')
        return value
