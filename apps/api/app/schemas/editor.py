from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class GuestQuotaValues(BaseModel):
    uploads: int
    exports: int
    uploaded_bytes: int
    storage_bytes: int
    processing_seconds: float
    concurrent_processing: int


class GuestUsageResponse(BaseModel):
    used: GuestQuotaValues
    reserved: GuestQuotaValues
    remaining: GuestQuotaValues
    limits: GuestQuotaValues


class GuestSessionResponse(BaseModel):
    guest_id: str
    created_at: datetime
    expires_at: datetime
    status: str
    usage: GuestUsageResponse
