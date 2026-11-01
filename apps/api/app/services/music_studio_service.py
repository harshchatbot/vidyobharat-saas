
"""PostgreSQL-backed guest Music Studio job service."""

from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import get_settings
from app.services.music_studio_repository import MusicStudioRepository


class MusicStudioError(RuntimeError):
    pass


class MusicStudioRateLimitError(MusicStudioError):
    pass


class MusicStudioConcurrencyError(MusicStudioError):
    pass


class MusicStudioOwnershipError(MusicStudioError):
    pass


@dataclass
class MusicJob:
    id: str
    status: str
    stage: str
    error: str | None = None
    outputs: dict[str, str] = field(default_factory=dict)
    measurements: dict = field(default_factory=dict)


class MusicStudioService:
    def __init__(self, root: Path | None = None):
        self.root = root or Path("data/music_studio")
        self._repository: MusicStudioRepository | None = None

    @property
    def repository(self) -> MusicStudioRepository:
        if self._repository is None:
            settings = get_settings()

            if not settings.music_studio_database_url:
                raise RuntimeError(
                    "MUSIC_STUDIO_DATABASE_URL must be configured"
                )

            self._repository = MusicStudioRepository(
                settings.music_studio_database_url
            )

        return self._repository

    @staticmethod
    def session_digest(session_token: str) -> str:
        return hashlib.sha256(
            session_token.encode("utf-8")
        ).hexdigest()

    async def create_saved_tracks_job(
        self,
        session_token: str,
        job_id: str,
        vocal_filename: str,
        instrument_filename: str,
        settings: dict,
    ) -> MusicJob:
        """Queue already-saved, validated tracks for the worker."""

        def insert():
            return self.repository.create_job(
                owner_digest=self.session_digest(session_token),
                vocal_filename=vocal_filename,
                instrument_filename=instrument_filename,
                settings=settings,
                retention_seconds=get_settings().music_studio_retention_seconds,
                job_id=job_id,
            )

        try:
            created_id = await asyncio.to_thread(insert)
        except ValueError as exc:
            message = str(exc)

            if "active Music Studio job" in message:
                raise MusicStudioConcurrencyError(message) from exc

            if "3 Music Studio jobs" in message:
                raise MusicStudioRateLimitError(message) from exc

            if "Music Studio is busy" in message:
                raise MusicStudioRateLimitError(message) from exc

            raise

        return MusicJob(
            id=created_id,
            status="queued",
            stage="queued",
        )

    def get(self, job_id: str, session_token: str) -> MusicJob:
        try:
            row = self.repository.get_job(
                job_id,
                self.session_digest(session_token),
            )
        except (ValueError, TypeError):
            raise MusicStudioOwnershipError(
                "Music job not found"
            ) from None

        if row is None:
            raise MusicStudioOwnershipError(
                "Music job not found"
            )

        outputs = {}

        if row["status"] == "completed" and row["output_dir"]:
            outputs = {"wav": "wav", "mp3": "mp3"}

        return MusicJob(
            id=str(row["id"]),
            status=row["status"],
            stage=row["stage"],
            error=row["error"],
            measurements=row["measurements"] or {},
            outputs=outputs,
        )

    def output_path(
        self,
        job_id: str,
        session_token: str,
        kind: str,
    ) -> Path:
        if kind not in {"wav", "mp3"}:
            raise LookupError("Unsupported output format")

        job = self.get(job_id, session_token)

        if job.status != "completed":
            raise LookupError("Output is not ready")

        row = self.repository.get_job(
            job_id,
            self.session_digest(session_token),
        )

        output_dir = row["output_dir"] if row else None

        if not isinstance(output_dir, str) or not re.fullmatch(
            r"attempt-[0-9a-f]{16}", output_dir
        ):
            raise LookupError("Invalid output location")

        path = (
            self.root
            / job.id
            / output_dir
            / f"produced.{kind}"
        )

        if not path.is_file():
            raise LookupError("Output not found")

        return path

    def close(self) -> None:
        if self._repository is not None:
            self._repository.close()
            self._repository = None


music_studio_service = MusicStudioService()
