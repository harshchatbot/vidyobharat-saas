from __future__ import annotations

import asyncio
import os
import subprocess
import httpx
import tempfile
from pathlib import Path
from itertools import chain

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.schemas.editor import (
    GuestMediaListResponse,
    GuestMediaResponse,
    GuestSessionResponse,
    GuestUsageResponse,
    GuestExportListResponse,
    GuestExportResponse,
    PublicAppConfigResponse,
    TimelineComposition,
    AudioLibraryResponse,
)
from app.services.editor_audio_library import build_audio_library_repository, list_audio_library, upload_audio_library_asset
from app.services.app_config_service import AppConfigService, get_app_config_service
from app.services.guest_export_service import GuestExportService, build_guest_export_service
from app.services.guest_media_service import GuestMediaService, build_guest_media_service
from app.services.guest_media_storage import GuestMediaObjectMissing
from app.services.guest_upload_parser import parse_guest_media_upload
from app.services.guest_session_errors import GuestSessionError
from app.services.guest_session_service import GuestSessionService, build_guest_session_service

router = APIRouter(prefix="/api/editor", tags=["RangManch Editor"])
TRANSCRIPTION_REQUEST_TIMEOUT_SECONDS = 300


@router.get("/health")
def editor_health():
    return {
        "status": "ok",
        "service": "rangmanch-editor",
        "mode": "local",
    }


@router.get('/audio-library', response_model=AudioLibraryResponse)
def get_audio_library(
    category: str | None = Query(default=None, pattern='^(music|sfx)$'),
    query: str | None = Query(default=None, min_length=1, max_length=80),
):
    return {'items': list_audio_library(category=category, query=query)}


def _audio_library_range(range_header: str | None, size: int) -> tuple[int, int]:
    """Return an inclusive byte range for a single HTTP Range request."""
    if size <= 0:
        raise HTTPException(status_code=404, detail='Audio asset unavailable.')
    if not range_header:
        return 0, size - 1
    if not range_header.startswith('bytes=') or ',' in range_header:
        raise HTTPException(status_code=416, detail='Invalid audio byte range.')
    raw_start, _, raw_end = range_header.removeprefix('bytes=').partition('-')
    try:
        if not raw_start:
            length = int(raw_end)
            if length <= 0:
                raise ValueError
            return max(0, size - length), size - 1
        start = int(raw_start)
        end = int(raw_end) if raw_end else size - 1
    except ValueError as exc:
        raise HTTPException(status_code=416, detail='Invalid audio byte range.') from exc
    if start < 0 or end < start or start >= size:
        raise HTTPException(status_code=416, detail='Invalid audio byte range.')
    return start, min(end, size - 1)


@router.get('/audio-library/{asset_id}/content')
def get_audio_library_content(asset_id: str, request: Request):
    entry = build_audio_library_repository().get(asset_id)
    if not entry or entry.status != 'published':
        raise HTTPException(status_code=404, detail='Audio library asset is unavailable.')
    if not entry.storage_path:
        raise HTTPException(status_code=404, detail='Audio library asset is unavailable.')
    from app.providers.storage import FirebaseStorageProvider, build_storage_provider
    storage = build_storage_provider()
    if not isinstance(storage, FirebaseStorageProvider):
        raise HTTPException(status_code=503, detail='Audio storage unavailable.')
    blob = storage.bucket.blob(entry.storage_path)
    try:
        if not blob.exists():
            raise HTTPException(status_code=404, detail='Audio asset unavailable.')
        blob.reload()  # exists() does not reliably populate blob.size
        if not blob.size or blob.size > 12 * 1024 * 1024:
            raise HTTPException(status_code=404, detail='Audio asset unavailable.')
        size = int(blob.size)
        start, end = _audio_library_range(request.headers.get('range'), size)
        content = blob.download_as_bytes(start=start, end=end)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Audio storage unavailable.')
    headers = {
        'Accept-Ranges': 'bytes',
        'Content-Length': str(end - start + 1),
        'Cache-Control': 'public,max-age=3600',
    }
    status_code = 200
    if request.headers.get('range'):
        headers['Content-Range'] = f'bytes {start}-{end}/{size}'
        status_code = 206
    return Response(content=content, media_type=entry.content_type, status_code=status_code, headers=headers)


@router.get('/config', response_model=PublicAppConfigResponse)
def get_public_editor_config(service: AppConfigService = Depends(get_app_config_service)):
    return service.public()


def get_guest_session_service() -> GuestSessionService:
    return build_guest_session_service()


def get_guest_media_service() -> GuestMediaService:
    return build_guest_media_service()


def get_guest_export_service() -> GuestExportService:
    return build_guest_export_service()


def _guest_token(request: Request, service: GuestSessionService) -> str | None:
    return request.cookies.get(service.config.cookie_name)


def _guest_error(exc: GuestSessionError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.response_body())


@router.post('/guest/session', response_model=GuestSessionResponse)
def create_guest_session(
    request: Request,
    response: Response,
    service: GuestSessionService = Depends(get_guest_session_service),
):
    try:
        session, new_token = service.create_session(request, _guest_token(request, service))
        if new_token:
            response.set_cookie(
                key=service.config.cookie_name,
                value=new_token,
                max_age=int(service.config.lifetime.total_seconds()),
                expires=session['expires_at'],
                path='/api/editor',
                secure=service.config.cookie_secure,
                httponly=True,
                samesite=service.config.cookie_samesite,
            )
        return service.public_session_payload(session, request=request)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/guest/session', response_model=GuestSessionResponse)
def get_guest_session(
    request: Request,
    service: GuestSessionService = Depends(get_guest_session_service),
):
    try:
        return service.public_session_payload(service.get_session(_guest_token(request, service)), request=request)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/guest/usage', response_model=GuestUsageResponse)
def get_guest_usage(
    request: Request,
    service: GuestSessionService = Depends(get_guest_session_service),
):
    try:
        return service.usage(_guest_token(request, service), request=request)
    except GuestSessionError as exc:
        return _guest_error(exc)


def _public_media(media: dict) -> dict:
    payload = {
        key: media[key]
        for key in (
            'media_id',
            'media_type',
            'content_type',
            'original_filename',
            'file_size',
            'duration_seconds',
            'width',
            'height',
            'created_at',
            'expires_at',
            'status',
        )
    }
    payload['availability'] = media.get('availability', 'available')
    return payload


@router.post('/media/upload', response_model=GuestMediaResponse, status_code=201)
async def upload_guest_media(
    request: Request,
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    file = None
    try:
        token = _guest_token(request, session_service)
        session_service.validate_mutating_request(request)
        session_service.get_session(token)
        media_service.validate_idempotency_key(idempotency_key)
        file = await parse_guest_media_upload(
            request,
            max_file_bytes=media_service.max_file_bytes,
        )
        uploaded = await run_in_threadpool(
            media_service.upload,
            request,
            token,
            file,
            idempotency_key,
        )
        return _public_media(uploaded)
    except GuestSessionError as exc:
        return _guest_error(exc)
    finally:
        if file is not None:
            await file.close()


@router.get('/media', response_model=GuestMediaListResponse)
def list_guest_media(
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    try:
        token = _guest_token(request, session_service)
        return {'items': [_public_media(item) for item in media_service.list_media(token)]}
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/media/{media_id}', response_model=GuestMediaResponse)
def get_guest_media(
    media_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    try:
        token = _guest_token(request, session_service)
        return _public_media(media_service.get_media(token, media_id))
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/media/{media_id}/content')
def get_guest_media_content(
    media_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    try:
        token = _guest_token(request, session_service)
        media, start, end, file_size = media_service.content_range(
            token,
            media_id,
            request.headers.get('range'),
        )
        headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': str(end - start + 1),
            'Cache-Control': 'private,no-store,max-age=0',
        }
        status_code = 200
        if request.headers.get('range'):
            status_code = 206
            headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        content = media_service.storage.iter_content(
            media['storage_object_path'],
            start=start,
            end=end,
        )
        try:
            first_chunk = next(content)
        except GuestMediaObjectMissing as exc:
            raise GuestSessionError(
                'guest_media_unavailable',
                'This media file is no longer available.',
                status_code=410,
                recoverable=False,
            ) from exc
        except Exception as exc:
            raise GuestSessionError(
                'guest_media_storage_unavailable',
                'The media content is temporarily unavailable.',
                status_code=503,
                recoverable=True,
            ) from exc
        return StreamingResponse(
            chain((first_chunk,), content),
            media_type=media['content_type'],
            status_code=status_code,
            headers=headers,
        )
    except GuestSessionError as exc:
        return _guest_error(exc)



@router.post('/media/{media_id}/transcribe')
async def transcribe_guest_video(
    media_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    """Authenticated, owner-scoped, optional local speech recognition."""
    try:
        token = _guest_token(request, session_service)
        session_service.validate_mutating_request(request)
        media = media_service.get_media(token, media_id)
        if media.get('media_type') != 'video':
            raise HTTPException(status_code=422, detail='Only video recordings can be transcribed.')
        _, start, end, size = media_service.content_range(token, media_id, None)
        if size > 100 * 1024 * 1024:
            raise HTTPException(status_code=413, detail='Recording exceeds transcription size limit.')
        from app.services.editor_transcription import transcribe_video_bytes
        from app.services.guest_media_storage import GuestMediaObjectMissing
        try:
            stt_url = os.getenv("RANGMANCH_STT_URL", "").strip()
            def load_transcription_source() -> bytes:
                # Request ownership was checked above; never send Firebase credentials
                # or guest sessions to the STT process.
                with tempfile.TemporaryDirectory(prefix='rangmanch-stt-source-') as temp_dir:
                    destination = Path(temp_dir) / 'source.video'
                    media_service.storage.download_to_path(
                        media['storage_object_path'], destination, expected_size=size,
                    )
                    if not stt_url:
                        return destination.read_bytes()  # existing local development path
                    audio = Path(temp_dir) / 'speech.wav'
                    try:
                        subprocess.run(
                            ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error',
                             '-y', '-i', str(destination), '-t', '65', '-vn',
                             '-ac', '1', '-ar', '16000', str(audio)],
                            check=True, timeout=45, capture_output=True,
                        )
                    except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
                        raise ValueError('Unable to decode audio from this recording.') from exc
                    if audio.stat().st_size > 4 * 1024 * 1024:
                        raise ValueError('Recording audio exceeds transcription limit.')
                    return audio.read_bytes()

            data = await run_in_threadpool(load_transcription_source)
            if stt_url:
                token = os.getenv('RANGMANCH_STT_TOKEN', '')
                if not token:
                    raise HTTPException(status_code=503, detail='Speech recognition is not configured.')
                try:
                    async with httpx.AsyncClient(timeout=httpx.Timeout(265.0, connect=5.0), trust_env=False) as client:
                        result = await client.post(
                            stt_url.rstrip('/') + '/transcribe',
                            content=data,
                            headers={'X-RangManch-STT-Token': token, 'Content-Type': 'audio/wav'},
                        )
                    if result.status_code == 422:
                        raise HTTPException(status_code=422, detail='Unable to transcribe this audio.')
                    if result.status_code != 200:
                        raise HTTPException(status_code=503, detail='Speech recognition is temporarily unavailable.')
                    return result.json()
                except (httpx.RequestError, ValueError) as exc:
                    raise HTTPException(status_code=503, detail='Speech recognition service unavailable.') from exc
            try:
                return await asyncio.wait_for(
                    run_in_threadpool(transcribe_video_bytes, data),
                    timeout=TRANSCRIPTION_REQUEST_TIMEOUT_SECONDS,
                )
            except TimeoutError as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Speech recognition is taking too long. Please retry shortly.",
                ) from exc
        except GuestMediaObjectMissing:
            raise HTTPException(status_code=410, detail='Recording is no longer available.')
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))
    except GuestSessionError as exc:
        return _guest_error(exc)



@router.post('/media/{media_id}/analyze')
async def analyze_guest_video(
    media_id: str,
    request: Request,
    style: str = Query(default='elegant', pattern='^(elegant|energetic|cinematic)
def delete_guest_media(
    media_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    try:
        token = _guest_token(request, session_service)
        media_service.delete_media(request, token, media_id)
        return Response(status_code=204)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.post('/exports', response_model=GuestExportResponse, status_code=202)
async def submit_guest_export(
    composition: TimelineComposition,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        job, _ = await run_in_threadpool(
            export_service.submit,
            request,
            _guest_token(request, session_service),
            composition,
            idempotency_key,
        )
        return export_service.public_payload(job)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/exports', response_model=GuestExportListResponse)
def list_guest_exports(
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        jobs = export_service.list_jobs(_guest_token(request, session_service))
        return {'items': [export_service.public_payload(job) for job in jobs]}
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/exports/{job_id}', response_model=GuestExportResponse)
def get_guest_export(
    job_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        job = export_service.get_job(_guest_token(request, session_service), job_id)
        return export_service.public_payload(job)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/exports/{job_id}/content')
def get_guest_export_content(
    job_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        job, start, end, size = export_service.content_range(
            _guest_token(request, session_service),
            job_id,
            request.headers.get('range'),
        )
        filename = str((job.get('output') or {}).get('filename') or f'rangmanch-{job_id}.mp4')
        headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': str(end - start + 1),
            'Cache-Control': 'private,no-store,max-age=0',
            'Content-Disposition': f'attachment; filename="{filename}"',
        }
        status_code = 200
        if request.headers.get('range'):
            status_code = 206
            headers['Content-Range'] = f'bytes {start}-{end}/{size}'
        content = export_service.storage.iter_content(job['storage_object_path'], start=start, end=end)
        try:
            first_chunk = next(content)
        except Exception as exc:
            raise GuestSessionError(
                'guest_export_storage_unavailable',
                'The export content is temporarily unavailable.',
                status_code=503,
                recoverable=True,
            ) from exc
        return StreamingResponse(
            chain((first_chunk,), content),
            media_type='video/mp4',
            status_code=status_code,
            headers=headers,
        )
    except GuestSessionError as exc:
        return _guest_error(exc)
),
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    """Generate structured video evidence, without a creative AI model.

    Protected by the same guest cookie and mutation CSRF checks as transcription.
    The source is downloaded once for visual/audio analysis; the established
    transcription endpoint supplies the word-timed speech evidence.
    """
    from app.schemas.video_analysis import VideoAnalysisReport
    from app.services.video_analysis_service import build_video_analysis_report

    try:
        guest_token = _guest_token(request, session_service)
        session_service.validate_mutating_request(request)
        media = media_service.get_media(guest_token, media_id)
        if media.get('media_type') != 'video':
            raise HTTPException(status_code=422, detail='Only video recordings can be analyzed.')
        _, _, _, size = media_service.content_range(guest_token, media_id, None)
        if size > 100 * 1024 * 1024:
            raise HTTPException(status_code=413, detail='Recording exceeds the 100 MB analysis limit.')

        transcript = None
        transcript_warning = None
        # Reuse the existing guest-owned Faster-Whisper integration. Speech
        # failure does not produce fabricated words or block visual analysis.
        try:
            result = await transcribe_guest_video(media_id, request, session_service, media_service)
            if isinstance(result, dict):
                transcript = result
            else:
                transcript_warning = 'Speech recognition returned no usable transcript.'
        except HTTPException:
            transcript_warning = 'Speech recognition unavailable for this recording.'
        except (OSError, RuntimeError, ValueError):
            transcript_warning = 'Speech recognition unavailable for this recording.'

        def run_analysis() -> VideoAnalysisReport:
            with tempfile.TemporaryDirectory(prefix='rangmanch-analysis-') as temp_dir:
                source = Path(temp_dir) / 'source.video'
                media_service.storage.download_to_path(
                    media['storage_object_path'], source, expected_size=size,
                )
                return build_video_analysis_report(source, media_id, transcript=transcript, style=style)

        try:
            report = await run_in_threadpool(run_analysis)
        except GuestMediaObjectMissing:
            raise HTTPException(status_code=410, detail='Recording is no longer available.')
        except (ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(status_code=422, detail='Could not analyze this video recording.') from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(status_code=503, detail='Video analysis temporarily unavailable.') from exc
        if transcript_warning:
            report.warnings.append(transcript_warning)
        return report
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.delete('/media/{media_id}', status_code=204)
def delete_guest_media(
    media_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    media_service: GuestMediaService = Depends(get_guest_media_service),
):
    try:
        token = _guest_token(request, session_service)
        media_service.delete_media(request, token, media_id)
        return Response(status_code=204)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.post('/exports', response_model=GuestExportResponse, status_code=202)
async def submit_guest_export(
    composition: TimelineComposition,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        job, _ = await run_in_threadpool(
            export_service.submit,
            request,
            _guest_token(request, session_service),
            composition,
            idempotency_key,
        )
        return export_service.public_payload(job)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/exports', response_model=GuestExportListResponse)
def list_guest_exports(
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        jobs = export_service.list_jobs(_guest_token(request, session_service))
        return {'items': [export_service.public_payload(job) for job in jobs]}
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/exports/{job_id}', response_model=GuestExportResponse)
def get_guest_export(
    job_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        job = export_service.get_job(_guest_token(request, session_service), job_id)
        return export_service.public_payload(job)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/exports/{job_id}/content')
def get_guest_export_content(
    job_id: str,
    request: Request,
    session_service: GuestSessionService = Depends(get_guest_session_service),
    export_service: GuestExportService = Depends(get_guest_export_service),
):
    try:
        job, start, end, size = export_service.content_range(
            _guest_token(request, session_service),
            job_id,
            request.headers.get('range'),
        )
        filename = str((job.get('output') or {}).get('filename') or f'rangmanch-{job_id}.mp4')
        headers = {
            'Accept-Ranges': 'bytes',
            'Content-Length': str(end - start + 1),
            'Cache-Control': 'private,no-store,max-age=0',
            'Content-Disposition': f'attachment; filename="{filename}"',
        }
        status_code = 200
        if request.headers.get('range'):
            status_code = 206
            headers['Content-Range'] = f'bytes {start}-{end}/{size}'
        content = export_service.storage.iter_content(job['storage_object_path'], start=start, end=end)
        try:
            first_chunk = next(content)
        except Exception as exc:
            raise GuestSessionError(
                'guest_export_storage_unavailable',
                'The export content is temporarily unavailable.',
                status_code=503,
                recoverable=True,
            ) from exc
        return StreamingResponse(
            chain((first_chunk,), content),
            media_type='video/mp4',
            status_code=status_code,
            headers=headers,
        )
    except GuestSessionError as exc:
        return _guest_error(exc)
