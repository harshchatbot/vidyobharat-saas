from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class VideoSubmitResult:
    provider_job_id: str | None
    status: str
    progress: int | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None


@dataclass
class VideoStatusResult:
    provider_job_id: str | None
    status: str
    progress: int | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None


class VideoProvider(ABC):
    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def healthcheck(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def submit_generation(
        self,
        *,
        render_id: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> VideoSubmitResult:
        raise NotImplementedError

    @abstractmethod
    def get_status(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        raise NotImplementedError

    @abstractmethod
    def get_result(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        raise NotImplementedError
