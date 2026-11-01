
"""Dedicated CPU-only Music Studio job worker.

Run as:
    python -m app.services.music_studio_worker
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path
import threading

from app.core.config import get_settings
from app.services.music_studio_repository import MusicStudioRepository

logger = logging.getLogger(__name__)

AUDIO_ROOT = Path("/app/data/music_studio")
MUSIC_LAB_SRC = Path("/app/music_lab")
POLL_SECONDS = 2
MAX_ATTEMPTS = 2


def process_job(repo: MusicStudioRepository, job: dict) -> None:
    job_id = str(job["id"])
    worker_id = job["worker_id"]
    fence = job["fence_token"]

    heartbeat_stop = threading.Event()
    lease_lost = threading.Event()

    def heartbeat() -> None:
        while not heartbeat_stop.wait(30):
            try:
                if not repo.renew_lease(job_id, worker_id, fence):
                    lease_lost.set()
                    return
            except Exception:
                logger.exception("music_worker_heartbeat_failed")
                lease_lost.set()
                return

    heartbeat_thread = threading.Thread(
        target=heartbeat,
        daemon=True,
        name=f"music-heartbeat-{job_id}",
    )
    heartbeat_thread.start()

    folder = AUDIO_ROOT / job_id
    attempt_dir = folder / f"attempt-{secrets.token_hex(8)}"
    attempt_dir.mkdir(parents=True, exist_ok=True)

    vocal = folder / job["vocal_filename"]
    instrument = folder / job["instrument_filename"]

    try:
        if not vocal.is_file() or not instrument.is_file():
            raise FileNotFoundError("Source audio files are missing")

        script = """
import json
import sys
from pathlib import Path
from produce import produce

vocal = Path(sys.argv[1])
instrument = Path(sys.argv[2])
output = Path(sys.argv[3])
settings = json.loads(sys.argv[4])

result = produce(vocal, instrument, output, **settings)
print(json.dumps(result))
"""

        
        env = os.environ.copy()
        env["PYTHONPATH"] = str(MUSIC_LAB_SRC)

        result = subprocess.run(
            [
                sys.executable,
                "-c",
                script,
                str(vocal),
                str(instrument),
                str(attempt_dir),
                json.dumps(job["settings"]),
            ],
            capture_output=True,
            text=True,
            timeout=300,
            check=True,
            env=env,
        )

        # Check whether the worker lost its lease
        if lease_lost.is_set():
            logger.warning(
                "music_worker_lease_lost_during_processing",
                extra={"job_id": job_id},
            )
            return

        output = json.loads(result.stdout.strip().splitlines()[-1])

    

        # Only the current lease owner may publish this result.
        if not repo.renew_lease(job_id, worker_id, fence):
            logger.warning("music_worker_lease_lost", extra={"job_id": job_id})
            return

        # Verify both exported files exist before publishing.
        wav = attempt_dir / "produced.wav"
        mp3 = attempt_dir / "produced.mp3"

        if not wav.is_file() or not mp3.is_file():
            raise RuntimeError("Audio exports are missing")

        if wav.stat().st_size == 0 or mp3.stat().st_size == 0:
            raise RuntimeError("Audio exports are empty")

        # Publish only this worker's attempt through PostgreSQL.
        published = repo.complete_job(
            job_id=job_id,
            worker_id=worker_id,
            fence_token=fence,
            measurements=output["measurements"],
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
        repo.fail_job(
            job_id, worker_id, fence,
            "Processing timed out. Please try a shorter recording.",
        )

    except (OSError, subprocess.CalledProcessError, ValueError, KeyError) as exc:
        logger.exception("music_worker_processing_failed")
        repo.fail_job(
            job_id, worker_id, fence,
            "Audio processing failed. Please check your recordings.",
        )

    finally:
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=5)    


def run_forever() -> None:
    settings = get_settings()

    if not settings.music_studio_database_url:
        raise RuntimeError("MUSIC_STUDIO_DATABASE_URL is required")

    repo = MusicStudioRepository(settings.music_studio_database_url)
    worker_id = f"music-{secrets.token_hex(8)}"

    logger.info("music_worker_started", extra={"worker_id": worker_id})

    try:
        while True:
            repo.recover_expired_jobs(max_attempts=MAX_ATTEMPTS)
            job = repo.claim_next(worker_id)

            if job:
                process_job(repo, job)
            else:
                time.sleep(POLL_SECONDS)
    finally:
        repo.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_forever()
