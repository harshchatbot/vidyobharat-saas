import logging
from pathlib import Path
import subprocess

from fastapi import FastAPI, Request
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_context import get_request_id
from app.middleware.rate_limit import RateLimitStubMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security import SecurityHeadersMiddleware
from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitStubMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def _ensure_directories() -> None:
    # Local directories are still needed for fallback assets, temp files, and local-dev compatibility.
    Path('data/uploads').mkdir(parents=True, exist_ok=True)
    Path('data/uploads/avatars').mkdir(parents=True, exist_ok=True)
    Path('data/music').mkdir(parents=True, exist_ok=True)
    Path('data/music_uploads').mkdir(parents=True, exist_ok=True)
    Path('data/renders').mkdir(parents=True, exist_ok=True)
    Path('data/image_generations').mkdir(parents=True, exist_ok=True)


def _ensure_builtin_music_previews() -> None:
    tones = {
        'uplift-india.mp3': 392,
        'corporate-calm.mp3': 330,
        'soft-motivation.mp3': 262,
    }
    for _, url in BUILTIN_MUSIC_TRACKS.items():
        path_str = url.replace('/static/', '', 1) if url.startswith('/static/') else url
        target = Path('data') / path_str
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
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
            logger.warning('builtin_music_preview_generation_failed', extra={'target': str(target)})


_ensure_directories()
_ensure_builtin_music_previews()

logger.info(
    'persistence_initialized',
    extra={
        'request_id': 'system',
        'persistence_backend': 'firestore',
        'storage_backend': settings.storage_backend,
    },
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = get_request_id() or 'system'
    logger.exception('unhandled_exception', extra={'request_id': request_id, 'path': str(request.url.path)})
    return JSONResponse(
        status_code=500,
        content={'detail': 'Internal server error', 'request_id': request_id},
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError):
    request_id = get_request_id() or 'system'
    logger.exception('runtime_error', extra={'request_id': request_id, 'path': str(request.url.path)})
    return JSONResponse(
        status_code=500,
        content={'detail': str(exc), 'request_id': request_id},
    )


app.mount('/static', StaticFiles(directory='data'), name='static')
app.include_router(router)
