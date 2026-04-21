from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.services.video.ltx_service import LtxService


class LtxVideoService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._service = LtxService(self.settings)

    def submit_ltx_job(
        self,
        *,
        render_id: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._service.submit_ltx_job(
            render_id=render_id,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            metadata=metadata,
        )

    def get_ltx_job_status(self, *, job_id: str | None = None, status_url: str | None = None) -> dict[str, Any]:
        return self._service.get_ltx_job_status(job_id=job_id, status_url=status_url)

    def generate_scene(
        self,
        *,
        render_id: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        return self._service.generate_scene(
            render_id=render_id,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            metadata=metadata,
        )

    def _build_output_name(self, *, render_id: str, metadata: dict[str, Any] | None) -> str:
        return self._service._build_output_name(render_id=render_id, metadata=metadata)  # noqa: SLF001
