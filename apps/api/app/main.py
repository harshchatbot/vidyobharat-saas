
import logging
from pathlib import Path
import re
import subprocess

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.api.routers.avatar_routes import router as avatar_router
from app.api.routers.storyboard_routes import router as storyboard_router
from app.api.routers.tts_routes import router as tts_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_context import get_request_id
from app.middleware.rate_limit import RateLimitStubMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security import SecurityHeadersMiddleware
from app.providers.firebase import (
    FirebaseNotConfiguredError,
    get_firestore_client,
)
from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS
from app.api.routers.editor_routes import router as editor_router
from app.api.routers.admin_routes import router as admin_router
from app.api.routers.editor_copilot_routes import router as editor_copilot_router


settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)


# --------------------------------------------------
# CORS configuration
# --------------------------------------------------

_always_allowed_origins = {
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://rangmanch.techfilabs.com',
    'https://rangmanchai.com',
    'https://www.rangmanchai.com',
    'https://api.rangmanchai.com',
    'https://vidyobharat-saas.vercel.app',
    # Explicit Vercel preview used by the current production review deployment.
    # Keep this allowlist exact; do not broaden credentialed CORS to all previews.
    'https://vidyobharat-saas-p29ibldyd-harsh-veers-projects.vercel.app',
}

_configured_origins = {
    item.rstrip('/')
    for item in settings.allowed_origins_list
}

_effective_allowed_origins = sorted(
    _configured_origins.union(_always_allowed_origins)
)

# Use only explicitly configured origins.
# Avoid broad wildcard subdomain matching for
# credentialed cross-origin requests.
_origin_regex = None


app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitStubMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_effective_allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def _origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False

    if origin == 'null':
        return False

    normalized = origin.rstrip('/')

    return normalized in _effective_allowed_origins


@app.middleware('http')
async def ensure_cors_headers(request: Request, call_next):
    origin = request.headers.get('origin')

    if request.method == 'OPTIONS' and _origin_allowed(origin):
        preflight = Response(status_code=204)

        preflight.headers['Access-Control-Allow-Origin'] = origin or ''
        preflight.headers['Access-Control-Allow-Credentials'] = 'true'
        preflight.headers['Access-Control-Allow-Methods'] = (
            'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        )
        preflight.headers['Access-Control-Allow-Headers'] = (
            request.headers.get(
                'access-control-request-headers',
                '*',
            )
        )
        preflight.headers['Vary'] = 'Origin'

        return preflight

    try:
        response = await call_next(request)

    except Exception:
        request_id = get_request_id() or 'system'

        logger.exception(
            'unhandled_exception',
            extra={
                'request_id': request_id,
                'path': str(request.url.path),
            },
        )

        response = JSONResponse(
            status_code=500,
            content={
                'detail': 'Internal server error',
                'request_id': request_id,
            },
        )

    if _origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin or ''
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Vary'] = 'Origin'

    return response


# --------------------------------------------------
# Local directories
# --------------------------------------------------

def _ensure_directories() -> None:
    Path('data/uploads').mkdir(parents=True, exist_ok=True)
    Path('data/uploads/avatars').mkdir(parents=True, exist_ok=True)
    Path('data/music').mkdir(parents=True, exist_ok=True)
    Path('data/music_uploads').mkdir(parents=True, exist_ok=True)
    Path('data/renders').mkdir(parents=True, exist_ok=True)
    Path('data/image_generations').mkdir(
        parents=True,
        exist_ok=True,
    )


# --------------------------------------------------
# Built-in music previews
# --------------------------------------------------

def _ensure_builtin_music_previews() -> None:
    tones = {
        'uplift-india.mp3': 392,
        'corporate-calm.mp3': 330,
        'soft-motivation.mp3': 262,
    }

    for _, url in BUILTIN_MUSIC_TRACKS.items():
        path_str = (
            url.replace('/static/', '', 1)
            if url.startswith('/static/')
            else url
        )

        target = Path('data') / path_str

        if target.exists():
            continue

        target.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        freq = tones.get(target.name, 330)

        try:
            subprocess.run(
                [
                    'ffmpeg',
                    '-y',
                    '-f',
                    'lavfi',
                    '-i',
                    f'sine=frequency={freq}:duration=6',
                    '-filter:a',
                    'volume=0.08',
                    str(target),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        except Exception:
            logger.warning(
                'builtin_music_preview_generation_failed',
                extra={'target': str(target)},
            )


# --------------------------------------------------
# Application initialization
# --------------------------------------------------

_ensure_directories()
_ensure_builtin_music_previews()

# LOCAL_EDITOR_MODE is allowed only in development.
# Production continues to require Firestore.
local_editor_enabled = (
    settings.env == 'development'
    and settings.local_editor_mode
)

if local_editor_enabled:
    logger.info(
        'local_editor_mode_enabled',
        extra={'request_id': 'system'},
    )

    logger.warning(
        'firestore_startup_check_skipped',
        extra={'request_id': 'system'},
    )

else:
    try:
        get_firestore_client()

        logger.info(
            'firebase_firestore_ready',
            extra={'request_id': 'system'},
        )

    except FirebaseNotConfiguredError:
        logger.exception(
            'firebase_firestore_not_configured'
        )
        raise


logger.info(
    'persistence_initialized',
    extra={
        'request_id': 'system',
        'persistence_backend': (
            'firestore_not_initialized'
            if local_editor_enabled
            else 'firestore'
        ),
        'storage_backend': settings.storage_backend,
    },
)


# --------------------------------------------------
# Exception handlers
# --------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
):
    request_id = get_request_id() or 'system'

    logger.exception(
        'unhandled_exception',
        extra={
            'request_id': request_id,
            'path': str(request.url.path),
        },
    )

    return JSONResponse(
        status_code=500,
        content={
            'detail': 'Internal server error',
            'request_id': request_id,
        },
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(
    request: Request,
    exc: RuntimeError,
):
    request_id = get_request_id() or 'system'

    logger.exception(
        'runtime_error',
        extra={
            'request_id': request_id,
            'path': str(request.url.path),
        },
    )

    return JSONResponse(
        status_code=500,
        content={
            'detail': str(exc),
            'request_id': request_id,
        },
    )


# --------------------------------------------------
# Static files
# --------------------------------------------------

app.mount(
    '/static',
    StaticFiles(directory='data'),
    name='static',
)


# --------------------------------------------------
# Existing API routers
# --------------------------------------------------

app.include_router(router)
app.include_router(avatar_router)
app.include_router(storyboard_router)
app.include_router(tts_router)
app.include_router(editor_router)
app.include_router(admin_router)
app.include_router(editor_copilot_router)
