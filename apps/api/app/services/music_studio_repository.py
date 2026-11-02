
"""Persistent PostgreSQL job queue for guest Music Studio."""

from __future__ import annotations

import json
import secrets
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


SCHEMA = """
CREATE TABLE IF NOT EXISTS music_studio_jobs (
    id UUID PRIMARY KEY,
    owner_session_digest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT 'queued',
    settings JSONB NOT NULL,
    vocal_filename TEXT NOT NULL,
    instrument_filename TEXT NOT NULL,
    measurements JSONB,
    output_dir TEXT,
    error TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    worker_id TEXT,
    fence_token TEXT,
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_music_jobs_claim
ON music_studio_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_music_jobs_owner
ON music_studio_jobs (owner_session_digest, created_at);
"""


class MusicStudioRepository:
    def __init__(self, database_url: str):
        if not database_url:
            raise ValueError("Music Studio database URL is required")

        self.engine: Engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=0,
        )

    def initialize(self) -> None:
        # Run schema creation as a controlled initialization step,
        # never automatically during each API request.
        with self.engine.begin() as conn:
            for statement in SCHEMA.split(";"):
                if statement.strip():
                    conn.execute(text(statement))

    def create_job(
        self,
        owner_digest: str,
        vocal_filename: str,
        instrument_filename: str,
        settings: dict,
        retention_seconds: int = 3600,
        job_id: str | None = None,
    ) -> str:
        job_id = job_id or str(uuid4())

        with self.engine.begin() as conn:
                        # Serialize concurrent submissions from the same guest session.
            conn.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:owner, 0))"),
                {"owner": owner_digest},
            )

            limits = conn.execute(
                text("""
                    SELECT
                        COUNT(*) FILTER (
                            WHERE created_at > NOW() - INTERVAL '1 hour'
                        ) AS hourly_jobs,
                        COUNT(*) FILTER (
                            WHERE status IN ('queued', 'processing')
                              AND expires_at > NOW()
                        ) AS active_jobs
                    FROM music_studio_jobs
                    WHERE owner_session_digest = :owner
                """),
                {"owner": owner_digest},
            ).mappings().one()

            if limits["hourly_jobs"] >= 3:
                raise ValueError(
                    "You can create up to 3 Music Studio jobs per hour."
                )

            if limits["active_jobs"] >= 1:
                raise ValueError(
                    "You already have an active Music Studio job."
                )

            # Limit how many jobs can wait on our small EC2 instance.
            conn.execute(
                text("SELECT pg_advisory_xact_lock(784513920)")
            )

            queued = conn.execute(
                text("""
                    SELECT COUNT(*)
                    FROM music_studio_jobs
                    WHERE status = 'queued'
                      AND expires_at > NOW()
                """)
            ).scalar_one()

            if queued >= 5:
                raise ValueError(
                    "Music Studio is busy. Please try again shortly."
                )
            conn.execute(
                text("""
                    INSERT INTO music_studio_jobs (
                        id, owner_session_digest, settings,
                        vocal_filename, instrument_filename, expires_at
                    )
                    VALUES (
                        CAST(:id AS uuid),
                        :owner,
                        CAST(:settings AS jsonb),
                        :vocal,
                        :instrument,
                        NOW() + (:retention * INTERVAL '1 second')
                    )
                """),
                {
                    "id": job_id,
                    "owner": owner_digest,
                    "settings": json.dumps(settings),
                    "vocal": vocal_filename,
                    "instrument": instrument_filename,
                    "retention": retention_seconds,
                },
            )

        return job_id

    def get_job(self, job_id: str, owner_digest: str) -> dict | None:
        with self.engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT id, status, stage, measurements, error,
                    output_dir, created_at, expires_at
                    FROM music_studio_jobs
                    WHERE id = CAST(:id AS uuid)
                      AND owner_session_digest = :owner
                      AND expires_at > NOW()
                """),
                {"id": job_id, "owner": owner_digest},
            ).mappings().first()

            return dict(row) if row else None

    def claim_next(
        self,
        worker_id: str,
        lease_seconds: int = 360,
        separation_worker: bool = False,
    ) -> dict | None:
        fence = secrets.token_hex(16)

        with self.engine.begin() as conn:
            row = conn.execute(
                text("""
                    SELECT id, settings, vocal_filename,
                           instrument_filename, owner_session_digest
                    FROM music_studio_jobs
                    WHERE status = 'queued'
                      AND expires_at > NOW()
                      AND (
                        (COALESCE(settings->>'_mode', 'separate') = 'karaoke'
                         OR (settings->>'_mode' = 'single' AND settings->>'_recording_kind' = 'mixed'))
                        = :separation_worker
                      )
                    ORDER BY created_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                """), {"separation_worker": separation_worker}
            ).mappings().first()

            if not row:
                return None

            conn.execute(
                text("""
                    UPDATE music_studio_jobs
                    SET status = 'processing',
                        stage = 'processing_mix_master_export',
                        attempt_count = attempt_count + 1,
                        worker_id = :worker,
                        fence_token = :fence,
                        lease_until =
                            NOW() + (:lease * INTERVAL '1 second'),
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {
                    "id": row["id"],
                    "worker": worker_id,
                    "fence": fence,
                    "lease": lease_seconds,
                },
            )

            return {
                **dict(row),
                "fence_token": fence,
                "worker_id": worker_id,
            }

    
    def complete_job(
        self,
        job_id: str,
        worker_id: str,
        fence_token: str,
        measurements: dict,
        output_dir: str,
    ) -> bool:
        """Atomically publish the successful attempt's output reference."""
        if not output_dir.startswith("attempt-") or "/" in output_dir or "\\" in output_dir:
            raise ValueError("Invalid output directory")

        with self.engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE music_studio_jobs
                    SET status = 'completed',
                        stage = 'completed',
                        measurements = CAST(:measurements AS jsonb),
                        output_dir = :output_dir,
                        updated_at = NOW(),
                        lease_until = NULL
                    WHERE id = CAST(:id AS uuid)
                      AND worker_id = :worker
                      AND fence_token = :fence
                      AND status = 'processing'
                      AND lease_until > NOW()
                      AND expires_at > NOW()
                """),
                {
                    "id": job_id,
                    "worker": worker_id,
                    "fence": fence_token,
                    "measurements": json.dumps(measurements),
                    "output_dir": output_dir,
                },
            )
            return result.rowcount == 1


    def renew_lease(
        self,
        job_id: str,
        worker_id: str,
        fence_token: str,
        lease_seconds: int = 360,
    ) -> bool:
        """Extend the lease only for the worker that owns the job."""
        with self.engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE music_studio_jobs
                    SET lease_until = NOW() + (:lease * INTERVAL '1 second'),
                        updated_at = NOW()
                    WHERE id = CAST(:id AS uuid)
                      AND worker_id = :worker
                      AND fence_token = :fence
                      AND status = 'processing'
                      AND lease_until > NOW()
                      AND expires_at > NOW()
                """),
                {
                    "id": job_id,
                    "worker": worker_id,
                    "fence": fence_token,
                    "lease": lease_seconds,
                },
            )
            return result.rowcount == 1

    def fail_job(
        self,
        job_id: str,
        worker_id: str,
        fence_token: str,
        error: str,
    ) -> bool:
        """Record failure only if the worker still owns the job."""
        with self.engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE music_studio_jobs
                    SET status = 'failed',
                        stage = 'failed',
                        error = :error,
                        lease_until = NULL,
                        updated_at = NOW()
                    WHERE id = CAST(:id AS uuid)
                      AND worker_id = :worker
                      AND fence_token = :fence
                      AND status = 'processing'
                      AND lease_until > NOW()
                """),
                {
                    "id": job_id,
                    "worker": worker_id,
                    "fence": fence_token,
                    "error": error[:500],
                },
            )
            return result.rowcount == 1



    def recover_expired_jobs(self, max_attempts: int = 2) -> int:
        """Recover jobs whose processing lease has expired.

        Retry eligible jobs, and fail jobs that exhausted retries
        or have passed their retention deadline.
        """
        with self.engine.begin() as conn:
            result = conn.execute(
                text("""
                    UPDATE music_studio_jobs
                    SET
                        status = CASE
                            WHEN attempt_count < :max_attempts
                                 AND expires_at > NOW()
                            THEN 'queued'
                            ELSE 'failed'
                        END,
                        stage = CASE
                            WHEN attempt_count < :max_attempts
                                 AND expires_at > NOW()
                            THEN 'queued'
                            ELSE 'failed'
                        END,
                        error = CASE
                            WHEN attempt_count < :max_attempts
                                 AND expires_at > NOW()
                            THEN NULL
                            ELSE 'Processing interrupted or timed out.'
                        END,
                        worker_id = NULL,
                        fence_token = NULL,
                        lease_until = NULL,
                        updated_at = NOW()
                    WHERE status = 'processing'
                      AND lease_until < NOW()
                """),
                {"max_attempts": max_attempts},
            )
            return result.rowcount





    def has_valid_lease(
        self,
        job_id: str,
        worker_id: str,
        fence_token: str,
    ) -> bool:
        """Check whether this worker still owns an active job."""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT EXISTS (
                        SELECT 1
                        FROM music_studio_jobs
                        WHERE id = CAST(:id AS uuid)
                          AND worker_id = :worker
                          AND fence_token = :fence
                          AND status = 'processing'
                          AND lease_until > NOW()
                          AND expires_at > NOW()
                    )
                """),
                {
                    "id": job_id,
                    "worker": worker_id,
                    "fence": fence_token,
                },
            )
            return bool(result.scalar())



    def get_job_by_id(self, job_id: str) -> dict | None:
        """Internal job lookup. Never expose this directly to guests."""
        with self.engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT id, status, stage, settings,
                        vocal_filename, instrument_filename,
                        output_dir, measurements, error, expires_at
                    FROM music_studio_jobs
                    WHERE id = CAST(:id AS uuid)
                """),
                {"id": job_id},
            ).mappings().first()

            return dict(row) if row else None


    def close(self) -> None:
        self.engine.dispose()
