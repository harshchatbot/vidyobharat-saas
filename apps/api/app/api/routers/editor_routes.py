from __future__ import annotations

from itertools import chain

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.schemas.editor import (
    GuestMediaListResponse,
    GuestMediaResponse,
    GuestSessionResponse,
    GuestUsageResponse,
)
from app.services.guest_media_service import GuestMediaService, build_guest_media_service
from app.services.guest_upload_parser import parse_guest_media_upload
from app.services.guest_session_errors import GuestSessionError
from app.services.guest_session_service import GuestSessionService, build_guest_session_service

router = APIRouter(prefix="/api/editor", tags=["RangManch Editor"])


@router.get("/health")
def editor_health():
    return {
        "status": "ok",
        "service": "rangmanch-editor",
        "mode": "local",
    }


def get_guest_session_service() -> GuestSessionService:
    return build_guest_session_service()


def get_guest_media_service() -> GuestMediaService:
    return build_guest_media_service()


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
        return service.public_session_payload(session)
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/guest/session', response_model=GuestSessionResponse)
def get_guest_session(
    request: Request,
    service: GuestSessionService = Depends(get_guest_session_service),
):
    try:
        return service.public_session_payload(service.get_session(_guest_token(request, service)))
    except GuestSessionError as exc:
        return _guest_error(exc)


@router.get('/guest/usage', response_model=GuestUsageResponse)
def get_guest_usage(
    request: Request,
    service: GuestSessionService = Depends(get_guest_session_service),
):
    try:
        return service.usage(_guest_token(request, service))
    except GuestSessionError as exc:
        return _guest_error(exc)


def _public_media(media: dict) -> dict:
    return {
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
