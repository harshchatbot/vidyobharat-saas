"""Deterministic, side-effect-free Content Autopilot state transitions.

No network calls, rendering, credit deductions or publishing occur here.
The caller persists every transition atomically with a version check.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
from hashlib import sha256
import json
from typing import Optional


class Stage(str, Enum):
    RESEARCHING = "researching"
    WRITING = "writing"
    GENERATING = "generating"
    QUALITY_CHECK = "quality_check"
    AWAITING_APPROVAL = "awaiting_approval"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"


class InvalidTransition(ValueError):
    pass


_ALLOWED = {
    Stage.RESEARCHING: {Stage.WRITING, Stage.FAILED, Stage.CANCELLED},
    Stage.WRITING: {Stage.GENERATING, Stage.FAILED, Stage.CANCELLED},
    Stage.GENERATING: {Stage.QUALITY_CHECK, Stage.FAILED, Stage.CANCELLED},
    Stage.QUALITY_CHECK: {Stage.AWAITING_APPROVAL, Stage.GENERATING, Stage.FAILED, Stage.CANCELLED},
    Stage.AWAITING_APPROVAL: {Stage.SCHEDULED, Stage.GENERATING, Stage.CANCELLED},
    Stage.SCHEDULED: {Stage.PUBLISHING, Stage.CANCELLED},
    Stage.PUBLISHING: {Stage.PUBLISHED, Stage.FAILED},
    Stage.FAILED: {Stage.RESEARCHING, Stage.GENERATING, Stage.CANCELLED},
    Stage.PUBLISHED: set(),
    Stage.CANCELLED: set(),
}


@dataclass(frozen=True)
class PublishManifest:
    video_sha256: str
    caption: str
    account_id: str
    scheduled_at: str

    def fingerprint(self) -> str:
        if not self.video_sha256 or not self.account_id or not self.scheduled_at:
            raise ValueError("Video hash, account and schedule are required")
        payload = {
            "video_sha256": self.video_sha256,
            "caption": self.caption,
            "account_id": self.account_id,
            "scheduled_at": self.scheduled_at,
        }
        return sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


@dataclass(frozen=True)
class Job:
    id: str
    stage: Stage = Stage.RESEARCHING
    version: int = 0
    approved_fingerprint: Optional[str] = None
    publishing_key: Optional[str] = None


def advance(job: Job, target: Stage, *, manifest: Optional[PublishManifest] = None,
            approval_fingerprint: Optional[str] = None) -> Job:
    """Advance one step. Scheduling requires approval of the exact publish manifest.

    Approval must be captured by authenticated API code, not supplied by an agent.
    """
    if target not in _ALLOWED[job.stage]:
        raise InvalidTransition(f"{job.stage.value} -> {target.value} not allowed")
    approved = job.approved_fingerprint
    key = job.publishing_key
    if target == Stage.SCHEDULED:
        if manifest is None or not approval_fingerprint:
            raise InvalidTransition("Explicit human approval and manifest required")
        fingerprint = manifest.fingerprint()
        if approval_fingerprint != fingerprint:
            raise InvalidTransition("Approval does not match the exact video, caption, account and time")
        approved = fingerprint
        key = sha256(f"{job.id}:{fingerprint}".encode()).hexdigest()
    elif target in {Stage.GENERATING, Stage.RESEARCHING}:
        approved = None
        key = None
    elif target == Stage.PUBLISHING:
        if manifest is None or approved != manifest.fingerprint() or not key:
            raise InvalidTransition("Manifest changed after approval")
    return replace(job, stage=target, version=job.version + 1,
                   approved_fingerprint=approved, publishing_key=key)


def authorized_generation(*, estimated_credits: int, remaining_budget: int,
                          prepaid_budget_enabled: bool) -> bool:
    """No paid generation without a previously authorized credit budget."""
    return (prepaid_budget_enabled and estimated_credits >= 0
            and remaining_budget >= estimated_credits)
