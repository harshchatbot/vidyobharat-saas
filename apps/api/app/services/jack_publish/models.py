"""Queue item for one approved video and its per-platform publish state."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))
DEFAULT_SLOT_HOUR_IST = 19  # 7 PM IST, channel playbook


class PlatformState:
    PENDING = "pending"          # waiting for its time
    PROCESSING = "processing"    # IG container uploading / processing
    SCHEDULED = "scheduled"      # YT uploaded as private with publishAt
    PUBLISHED = "published"
    FAILED = "failed"
    SKIPPED = "skipped"          # platform not requested


@dataclass
class PlatformStatus:
    state: str = PlatformState.PENDING
    attempts: int = 0
    remote_id: str = ""          # IG media id / YT video id
    container_id: str = ""       # IG only
    container_created_at: str = ""
    upload_mode: str = ""        # IG: url | resumable
    url: str = ""
    last_error: dict[str, Any] = field(default_factory=dict)
    updated_at: str = ""


@dataclass
class Approval:
    by: str
    at: str
    content_hash: str
    note: str = ""


@dataclass
class QueueItem:
    id: str
    slot: str                    # ISO 8601 with offset, e.g. 2026-12-01T19:00:00+05:30
    source_dir: str
    ig_caption: str
    yt_title: str
    yt_description: str
    yt_tags: list[str]
    first_comment: str
    video_sha256: str
    cover_sha256: str
    duration_s: float
    created_at: str
    status: str = "awaiting_approval"  # awaiting_approval | approved | done | failed | cancelled
    approval: Approval | None = None
    instagram: PlatformStatus = field(default_factory=PlatformStatus)
    youtube: PlatformStatus = field(default_factory=PlatformStatus)
    log: list[str] = field(default_factory=list)

    # ------------------------------------------------------------ helpers
    @property
    def slot_dt(self) -> datetime:
        return datetime.fromisoformat(self.slot)

    def content_hash(self) -> str:
        payload = json.dumps({
            "slot": self.slot, "ig_caption": self.ig_caption, "yt_title": self.yt_title,
            "yt_description": self.yt_description, "first_comment": self.first_comment,
            "video": self.video_sha256, "cover": self.cover_sha256,
        }, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()

    def approval_valid(self) -> bool:
        return self.approval is not None and self.approval.content_hash == self.content_hash()

    def note(self, msg: str, now: datetime | None = None) -> None:
        stamp = (now or datetime.now(timezone.utc)).astimezone(IST).strftime("%d %b %H:%M IST")
        self.log.append(f"{stamp}  {msg}")
        self.log = self.log[-50:]

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=1, ensure_ascii=False)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "QueueItem":
        d = dict(d)
        d["instagram"] = PlatformStatus(**d.get("instagram", {}))
        d["youtube"] = PlatformStatus(**d.get("youtube", {}))
        d["approval"] = Approval(**d["approval"]) if d.get("approval") else None
        return cls(**d)


def error(key: str, message: str, recoverable: bool, retry_action: str) -> dict[str, Any]:
    """Error record in the project's standard shape."""
    return {"error": key, "message": message, "recoverable": recoverable, "retry_action": retry_action}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_slot(text: str | None, now: datetime, taken: set[str]) -> datetime:
    """``YYYY-MM-DD [HH:MM]`` in IST, or the next free 7 PM IST slot after now."""
    if text:
        parts = text.strip().replace("T", " ").split()
        hh, mm = (parts[1].split(":") + ["0"])[:2] if len(parts) > 1 else (str(DEFAULT_SLOT_HOUR_IST), "0")
        day = datetime.strptime(parts[0], "%Y-%m-%d")
        return datetime(day.year, day.month, day.day, int(hh), int(mm), tzinfo=IST)
    local = now.astimezone(IST)
    cand = local.replace(hour=DEFAULT_SLOT_HOUR_IST, minute=0, second=0, microsecond=0)
    if cand <= local + timedelta(minutes=30):
        cand += timedelta(days=1)
    while cand.date().isoformat() in taken:
        cand += timedelta(days=1)
    return cand
