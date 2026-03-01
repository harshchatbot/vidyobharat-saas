from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class CreditBreakdownItem(BaseModel):
    feature: str
    cost: int


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
    credits: int = Field(ge=1, le=100000)


class CreditTopUpOrderResponse(BaseModel):
    provider: str
    orderId: str
    keyId: str
    amountPaise: int
    currency: str
    credits: int


class CreditTopUpVerifyRequest(BaseModel):
    credits: int = Field(ge=1, le=100000)
    razorpayOrderId: str = Field(min_length=4, max_length=160)
    razorpayPaymentId: str = Field(min_length=4, max_length=160)
    razorpaySignature: str = Field(min_length=8, max_length=255)


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


class EstimateCreditsResponse(BaseModel):
    estimatedCredits: int
    breakdown: list[CreditBreakdownItem] = Field(default_factory=list)
    currentCredits: int
    remainingCredits: int
    sufficient: bool
    premium: bool
