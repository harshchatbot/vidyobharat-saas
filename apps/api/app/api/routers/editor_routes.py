from __future__ import annotations

import asyncio
from itertools import chain

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
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
TRANSCRIPTION_REQUEST_TIMEOUT_SECONDS = 90


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


@router.get('/audio-library/{asset_id}/content')
def get_audio_library_content(asset_id: str):
    entry = build_audio_library_repository().get(asset_id)
    if not entry or entry.status != 'published':
        raise HTTPException(status_code=404, detail='Audio library asset is unavailable.')
    if entry.playback_url:
        return RedirectResponse(entry.playback_url, status_code=307)
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
        content = blob.download_as_bytes()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Audio storage unavailable.')
    return Response(content=content, media_type=entry.content_type, headers={'Cache-Control': 'public,max-age=3600'})


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
            data = await run_in_threadpool(
                lambda: b''.join(media_service.storage.iter_content(
                    media['storage_object_path'], start=start, end=end))
            )
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
