from __future__ import annotations

import json
import os
import secrets

from fastapi import APIRouter, Cookie, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse

from app.services.music_studio_service import (
    MusicStudioConcurrencyError,
    MusicStudioOwnershipError,
    MusicStudioRateLimitError,
    music_studio_service,
)
from app.services.music_studio_turnstile_service import TurnstileError, music_studio_turnstile_service
import asyncio
import shutil
from pathlib import Path
from uuid import uuid4

from app.services.music_studio_audio_validation import (
    SUPPORTED_EXTENSIONS,
    save_upload_limited,
    validate_audio,
)


router = APIRouter(prefix="/api/music-studio", tags=["music-studio"])
GUEST_SESSION_COOKIE = "rangmanch_music_session"
GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60


def error_response(status_code: int, error: str, message: str, retry_action: str | None = None) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": error, "message": message, "recoverable": True, "retry_action": retry_action})


def _set_guest_session_cookie(response: Response, request: Request, session_token: str) -> None:
    response.set_cookie(
        key=GUEST_SESSION_COOKIE,
        value=session_token,
        max_age=GUEST_SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        path="/api/music-studio",
    )




@router.post("/jobs")
async def create_job(
    request: Request,
    response: Response,
    vocal: UploadFile | None = File(default=None),
    instrument: UploadFile | None = File(default=None),
    single_recording: UploadFile | None = File(default=None),
    settings: str = Form("{}"),
    mode: str = Form("separate"),
    recording_kind: str = Form("mixed"),
    turnstile_token: str | None = Form(default=None),
    guest_session: str | None = Cookie(
        default=None, alias=GUEST_SESSION_COOKIE
    ),
):
    if mode not in {"separate", "single", "karaoke"}:
        raise error_response(422, "invalid_mode", "Choose a valid Music Studio mode.")
    if recording_kind not in {"mixed", "vocals_only", "instrument_only"}:
        raise error_response(422, "invalid_recording_kind", "Invalid recording type.")
    if mode == "separate":
        if vocal is None or instrument is None or single_recording is not None:
            raise error_response(422, "missing_tracks", "Upload two separate tracks.")
    else:
        if single_recording is None or vocal is not None or instrument is not None:
            raise error_response(422, "missing_recording", "Upload exactly one recording.")
    needs_separation = mode == "karaoke" or (mode == "single" and recording_kind == "mixed")
    if needs_separation and os.getenv("MUSIC_STUDIO_SEPARATION_ENABLED", "false").lower() != "true":
        raise error_response(503, "separation_unavailable", "AI separation is not enabled on this server yet.")

    session_token = guest_session or secrets.token_urlsafe(32)

    # Verify anti-abuse challenge before saving audio.
    try:
        await music_studio_turnstile_service.verify(
            turnstile_token,
            request.client.host if request.client else None,
        )
    except TurnstileError as exc:
        raise error_response(
            403, "anti_abuse_verification_failed", str(exc)
        ) from exc

    try:
        parsed_settings = json.loads(settings)
        if not isinstance(parsed_settings, dict):
            raise ValueError("Settings must be an object.")

        if mode == "separate":
            vocal_ext = Path(vocal.filename or "").suffix.lower()
            instrument_ext = Path(instrument.filename or "").suffix.lower()
            if vocal_ext not in SUPPORTED_EXTENSIONS or instrument_ext not in SUPPORTED_EXTENSIONS:
                raise ValueError("Use WAV, AIFF, MP3, or M4A audio.")
        else:
            recording_ext = Path(single_recording.filename or "").suffix.lower()
            if recording_ext not in SUPPORTED_EXTENSIONS:
                raise ValueError("Use WAV, AIFF, MP3, or M4A audio.")
        # Server-owned routing fields: never accept these from clients.
        parsed_settings.pop("_mode", None)
        parsed_settings.pop("_recording_kind", None)
        parsed_settings["_mode"] = mode
        parsed_settings["_recording_kind"] = recording_kind

    except (ValueError, json.JSONDecodeError) as exc:
        raise error_response(
            422, "invalid_audio_settings", str(exc)
        ) from exc

    job_id = str(uuid4())
    folder = music_studio_service.root / job_id

    vocal_filename = f"vocal{vocal_ext}" if mode == "separate" else f"single{recording_ext}"
    instrument_filename = f"instrument{instrument_ext}" if mode == "separate" else vocal_filename

    queued = False

    try:
        if mode == "separate":
            await save_upload_limited(vocal, folder / vocal_filename)
            await save_upload_limited(instrument, folder / instrument_filename)
            await asyncio.to_thread(validate_audio, folder / vocal_filename)
            await asyncio.to_thread(validate_audio, folder / instrument_filename)
        else:
            # Existing non-null DB filename columns share the same stored source.
            await save_upload_limited(single_recording, folder / vocal_filename)
            await asyncio.to_thread(validate_audio, folder / vocal_filename)

        # Create the PostgreSQL queue entry last.
        job = await music_studio_service.create_saved_tracks_job(
            session_token=session_token,
            job_id=job_id,
            vocal_filename=vocal_filename,
            instrument_filename=instrument_filename,
            settings=parsed_settings,
        )

        queued = True

    except ValueError as exc:
        raise error_response(
            422, "invalid_audio_settings", str(exc)
        ) from exc

    except MusicStudioConcurrencyError as exc:
        raise error_response(
            409, "job_in_progress", str(exc)
        ) from exc

    except MusicStudioRateLimitError as exc:
        raise error_response(
            429, "rate_limited", str(exc)
        ) from exc

    finally:
        if not queued:
            await asyncio.to_thread(
                shutil.rmtree, folder, True
            )

    _set_guest_session_cookie(
        response, request, session_token
    )

    return {
        "id": job.id,
        "status": job.status,
        "stage": job.stage,
    }


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, guest_session: str | None = Cookie(default=None, alias=GUEST_SESSION_COOKIE)):
    if not guest_session:
        raise error_response(401, "guest_session_required", "This Music Studio job belongs to a different browser session.")
    try:
        job = music_studio_service.get(job_id, guest_session)
        return {"id": job.id, "status": job.status, "stage": job.stage, "error": job.error, "measurements": job.measurements, "downloads": {key: f"/api/music-studio/jobs/{job.id}/download/{key}" for key in job.outputs}}
    except MusicStudioOwnershipError as exc:
        raise error_response(404, "job_not_found", str(exc)) from exc


@router.get("/jobs/{job_id}/download/{kind}")
async def download(job_id: str, kind: str, guest_session: str | None = Cookie(default=None, alias=GUEST_SESSION_COOKIE)):
    if not guest_session:
        raise error_response(401, "guest_session_required", "This Music Studio output belongs to a different browser session.")
    try:
        path = music_studio_service.output_path(job_id, guest_session, kind)
        return FileResponse(path, media_type="audio/wav" if kind == "wav" else "audio/mpeg", filename=path.name)
    except (MusicStudioOwnershipError, LookupError) as exc:
        raise error_response(404, "output_not_found", "Output not found") from exc
