import logging
from pathlib import Path
import subprocess

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_context import get_request_id
from app.db.base import Base
from app.db.session import engine
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
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

Base.metadata.create_all(bind=engine)


def _ensure_video_columns() -> None:
    inspector = inspect(engine)
    if 'videos' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('videos')}
    migrations = [
        ('aspect_ratio', "ALTER TABLE videos ADD COLUMN aspect_ratio VARCHAR(10) DEFAULT '9:16'"),
        ('resolution', "ALTER TABLE videos ADD COLUMN resolution VARCHAR(10) DEFAULT '1080p'"),
        ('duration_mode', "ALTER TABLE videos ADD COLUMN duration_mode VARCHAR(10) DEFAULT 'auto'"),
        ('duration_seconds', 'ALTER TABLE videos ADD COLUMN duration_seconds INTEGER'),
        ('captions_enabled', 'ALTER TABLE videos ADD COLUMN captions_enabled BOOLEAN DEFAULT 1'),
        ('caption_style', 'ALTER TABLE videos ADD COLUMN caption_style VARCHAR(40)'),
        ('template', 'ALTER TABLE videos ADD COLUMN template VARCHAR(80)'),
        ('language', 'ALTER TABLE videos ADD COLUMN language VARCHAR(40)'),
        ('selected_model', 'ALTER TABLE videos ADD COLUMN selected_model VARCHAR(64)'),
        ('provider_name', 'ALTER TABLE videos ADD COLUMN provider_name VARCHAR(120)'),
        ('source_image_url', 'ALTER TABLE videos ADD COLUMN source_image_url VARCHAR(255)'),
        ('reference_images', "ALTER TABLE videos ADD COLUMN reference_images TEXT DEFAULT '[]'"),
        ('music_mode', "ALTER TABLE videos ADD COLUMN music_mode VARCHAR(20) DEFAULT 'none'"),
        ('music_track_id', 'ALTER TABLE videos ADD COLUMN music_track_id VARCHAR(80)'),
        ('music_file_url', 'ALTER TABLE videos ADD COLUMN music_file_url VARCHAR(255)'),
        ('music_volume', 'ALTER TABLE videos ADD COLUMN music_volume INTEGER DEFAULT 20'),
        ('duck_music', 'ALTER TABLE videos ADD COLUMN duck_music BOOLEAN DEFAULT 1'),
    ]
    with engine.begin() as conn:
        for column_name, statement in migrations:
            if column_name not in existing:
                conn.execute(text(statement))


_ensure_video_columns()


def _ensure_image_generation_columns() -> None:
    inspector = inspect(engine)
    if 'image_generations' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('image_generations')}
    migrations = [
        ('parent_image_id', 'ALTER TABLE image_generations ADD COLUMN parent_image_id VARCHAR(36)'),
        ('action_type', 'ALTER TABLE image_generations ADD COLUMN action_type VARCHAR(40)'),
    ]
    with engine.begin() as conn:
        for column_name, statement in migrations:
            if column_name not in existing:
                conn.execute(text(statement))


_ensure_image_generation_columns()


def _ensure_asset_tags_table() -> None:
    inspector = inspect(engine)
    if 'asset_tags' in inspector.get_table_names():
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE asset_tags (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  asset_id VARCHAR(36) NOT NULL,
                  asset_type VARCHAR(16) NOT NULL,
                  tag VARCHAR(120) NOT NULL,
                  source VARCHAR(16) NOT NULL DEFAULT 'auto',
                  UNIQUE(asset_id, asset_type, tag)
                )
                """
            )
        )


_ensure_asset_tags_table()

Path('data/uploads').mkdir(parents=True, exist_ok=True)
Path('data/music').mkdir(parents=True, exist_ok=True)
Path('data/music_uploads').mkdir(parents=True, exist_ok=True)
Path('data/renders').mkdir(parents=True, exist_ok=True)
Path('data/image_generations').mkdir(parents=True, exist_ok=True)


def _ensure_builtin_music_previews() -> None:
    # Generate lightweight placeholder previews if local files are missing.
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
                    f'sine=frequency={freq}:duration=12',
                    '-q:a',
                    '4',
                    str(target),
                ],
                check=True,
                capture_output=True,
            )
        except Exception as exc:
            logger.warning('music_preview_seed_failed', extra={'error': str(exc), 'path': str(target)})


_ensure_builtin_music_previews()
app.mount('/static', StaticFiles(directory='data'), name='static')
app.include_router(router)


@app.middleware('http')
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    logger.info(
        'request_completed',
        extra={
            'request_id': get_request_id(),
            'method': request.method,
            'path': request.url.path,
            'status_code': response.status_code,
        },
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception('unhandled_error', extra={'request_id': get_request_id()})
    return JSONResponse(status_code=500, content={'detail': 'Internal server error'})
