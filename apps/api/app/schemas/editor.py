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


class GuestMediaResponse(BaseModel):
    media_id: str
    media_type: str
    content_type: str
    original_filename: str
    file_size: int
    duration_seconds: float | None
    width: int
    height: int
    created_at: datetime
    expires_at: datetime
    status: str


class GuestMediaListResponse(BaseModel):
    items: list[GuestMediaResponse]
