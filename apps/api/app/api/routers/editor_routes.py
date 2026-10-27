from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.schemas.editor import GuestSessionResponse, GuestUsageResponse
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
