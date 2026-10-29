from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _AdminModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class AdminMeResponse(_AdminModel):
    uid: str
    email: str | None


class AdminDashboardResponse(_AdminModel):
    total_guest_sessions: int
    active_guest_sessions: int
    accepted_uploads: int
    completed_exports: int
    failed_exports: int
    uploaded_bytes: int
    active_storage_bytes: int
    recent_activity: list[dict[str, Any]]
    coverage_note: str


class AdminGuestSummary(_AdminModel):
    guest_id: str
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    status: str
    uploads_count: int
    exports_count: int
    uploaded_bytes: int
    storage_bytes: int
    processing_seconds: float


class AdminGuestPage(_AdminModel):
    items: list[AdminGuestSummary]
    next_cursor: str | None


class AdminExportSummary(_AdminModel):
    job_id: str
    status: str
    progress_stage: str
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    attempt_count: int
    error_code: str | None
    filename: str | None
    duration_seconds: float | None
    output_bytes: int | None


class AdminExportPage(_AdminModel):
    guest: AdminGuestSummary
    items: list[AdminExportSummary]
    next_cursor: str | None


class AdminConfigResponse(_AdminModel):
    revision: int
    cache_ttl_seconds: float
    config: dict[str, dict[str, Any]]


class AdminConfigUpdateRequest(_AdminModel):
    revision: int = Field(ge=0)
    changes: dict[str, dict[str, Any]]
    reason: str | None = Field(default=None, max_length=500)


class AdminConfigAuditPage(_AdminModel):
    items: list[dict[str, Any]]
    next_cursor: str | None
