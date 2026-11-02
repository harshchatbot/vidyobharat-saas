
"""Dedicated CPU-only Music Studio job worker.

Run as:
    python -m app.services.music_studio_worker
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import shutil
import signal
import subprocess
import sys
import threading
from pathlib import Path

from app.core.config import get_settings
from app.services.music_studio_repository import MusicStudioRepository

logger = logging.getLogger(__name__)

AUDIO_ROOT = Path("/app/data/music_studio")
MUSIC_LAB_SRC = Path("/app/music_lab")

POLL_SECONDS = 2
MAX_ATTEMPTS = 2
PROCESSING_TIMEOUT_SECONDS = 900 if os.getenv('MUSIC_STUDIO_WORKER_KIND') == 'separation' else 300
LEASE_SECONDS = 360
HEARTBEAT_SECONDS = 30

shutdown_requested = threading.Event()


def terminate_process_group(
    process: subprocess.Popen | None,
) -> None:
    """Terminate the processor and its FFmpeg child processes."""
    if process is None:
        return

    try:
        # The processor was launched in a separate process session.
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def handle_shutdown(signum, frame) -> None:
    """Request shutdown; let the active job clean up its subprocess."""
    logger.warning("music_worker_shutdown_requested")
    shutdown_requested.set()


def process_job(
    repo: MusicStudioRepository,
    job: dict,
) -> None:
    job_id = str(job["id"])
    worker_id = job["worker_id"]
    fence = job["fence_token"]

    folder = AUDIO_ROOT / job_id
    attempt_dir = folder / f"attempt-{secrets.token_hex(8)}"

    vocal = folder / job["vocal_filename"]
    instrument = folder / job["instrument_filename"]

    heartbeat_stop = threading.Event()
    lease_lost = threading.Event()

    process: subprocess.Popen | None = None
    published = False

    def heartbeat() -> None:
        while not heartbeat_stop.wait(HEARTBEAT_SECONDS):
            if shutdown_requested.is_set():
                return

            try:
                if not repo.renew_lease(
                    job_id,
                    worker_id,
                    fence,
                    lease_seconds=LEASE_SECONDS,
                ):
                    lease_lost.set()
                    return
            except Exception:
                logger.exception(
                    "music_worker_heartbeat_failed",
                    extra={"job_id": job_id},
                )
                lease_lost.set()
                return

    heartbeat_thread = threading.Thread(
        target=heartbeat,
        daemon=True,
        name=f"music-heartbeat-{job_id}",
    )

    try:
        if shutdown_requested.is_set():
            return

        attempt_dir.mkdir(parents=True, exist_ok=True)

        if not vocal.is_file() or not instrument.is_file():
            raise FileNotFoundError(
                "Source audio files are missing"
            )

        # The single, karaoke, and two-track modes share one producer.
        # Heavy jobs are claimed only by dedicated separation workers.
        script = MUSIC_LAB_SRC / "music_job_processor.py"
        log_path = attempt_dir / "processor.log"

        env = os.environ.copy()
        env["PYTHONPATH"] = str(MUSIC_LAB_SRC)

        processor_log = open(log_path, "w", encoding="utf-8")
        process = subprocess.Popen(
            [
                sys.executable,
                str(script),
                str(vocal),
                str(instrument),
                str(attempt_dir),
                json.dumps(job["settings"]),
            ],
            stdout=subprocess.PIPE,
            stderr=processor_log,
            text=True,
            env=env,
            start_new_session=True,
        )

        processor_log.close()
        heartbeat_thread.start()

        # Poll for completion so SIGTERM and lease loss
        # can interrupt processing without waiting 300 seconds.
        deadline = (
            __import__("time").monotonic()
            + PROCESSING_TIMEOUT_SECONDS
        )

        while process.poll() is None:
            if shutdown_requested.is_set():
                raise InterruptedError(
                    "Music worker is shutting down"
                )

            if lease_lost.is_set():
                raise InterruptedError(
                    "Music worker lost its database lease"
                )

            if __import__("time").monotonic() >= deadline:
                raise subprocess.TimeoutExpired(
                    process.args,
                    PROCESSING_TIMEOUT_SECONDS,
                )

            shutdown_requested.wait(0.5)

        stdout, _ = process.communicate(timeout=10)
        stderr = log_path.read_text(encoding="utf-8", errors="replace")[-4000:] if log_path.exists() else ""

        if shutdown_requested.is_set() or lease_lost.is_set():
            raise InterruptedError(
                "Job interrupted before publication"
            )

        if process.returncode != 0:
            logger.error(
                "music_processor_failed",
                extra={
                    "job_id": job_id,
                    "exit_code": process.returncode,
                    "stderr_tail": stderr[-1500:],
                },
            )
            raise RuntimeError("Audio processor failed")

        output = json.loads(stdout.strip().splitlines()[-1])

        wav = attempt_dir / "produced.wav"
        mp3 = attempt_dir / "produced.mp3"

        if not wav.is_file() or not mp3.is_file():
            raise RuntimeError("Audio exports are missing")

        if wav.stat().st_size == 0 or mp3.stat().st_size == 0:
            raise RuntimeError("Audio exports are empty")

        measurements = output["measurements"]

        if not isinstance(measurements, dict):
            raise ValueError("Invalid audio measurements")

        if shutdown_requested.is_set() or lease_lost.is_set():
            raise InterruptedError(
                "Job interrupted before publication"
            )

        published = repo.complete_job(
            job_id=job_id,
            worker_id=worker_id,
            fence_token=fence,
            measurements=measurements,
            output_dir=attempt_dir.name,
        )

        if not published:
            logger.warning(
                "music_worker_publication_rejected",
                extra={"job_id": job_id},
            )
            return

        logger.info(
            "music_worker_completed",
            extra={"job_id": job_id},
        )

    except subprocess.TimeoutExpired:
        logger.warning(
            "music_worker_processing_timed_out",
            extra={"job_id": job_id},
        )
        repo.fail_job(
            job_id,
            worker_id,
            fence,
            "Processing timed out. Please try a shorter recording.",
        )

    except InterruptedError:
        logger.warning(
            "music_worker_job_interrupted",
            extra={"job_id": job_id},
        )
        # Leave the job for lease-based recovery.
        # The old worker cannot publish after its lease expires.

    except Exception:
        logger.exception(
            "music_worker_processing_failed",
            extra={"job_id": job_id},
        )
        repo.fail_job(
            job_id,
            worker_id,
            fence,
            "Audio processing failed. Please check your recordings.",
        )

    finally:
        # Kill the entire processor process group, including FFmpeg.
        terminate_process_group(process)

        if process is not None:
            try:
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning(
                    "music_worker_process_reap_timed_out",
                    extra={"job_id": job_id},
                )

        heartbeat_stop.set()

        if heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=5)

        # Never delete a successfully published output directory.
        if not published:
            shutil.rmtree(attempt_dir, ignore_errors=True)


def run_forever() -> None:
    settings = get_settings()

    if not settings.music_studio_database_url:
        raise RuntimeError(
            "MUSIC_STUDIO_DATABASE_URL is required"
        )

    repo = MusicStudioRepository(
        settings.music_studio_database_url
    )

    worker_id = f"music-{secrets.token_hex(8)}"

    logger.info(
        "music_worker_started",
        extra={"worker_id": worker_id},
    )

    try:
        while not shutdown_requested.is_set():
            repo.recover_expired_jobs(
                max_attempts=MAX_ATTEMPTS
            )

            if shutdown_requested.is_set():
                break

            job = repo.claim_next(
                worker_id,
                lease_seconds=LEASE_SECONDS,
                separation_worker=(os.getenv("MUSIC_STUDIO_WORKER_KIND") == "separation"),
            )

            if job:
                process_job(repo, job)
            else:
                shutdown_requested.wait(POLL_SECONDS)

    finally:
        repo.close()
        logger.info("music_worker_stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    run_forever()
