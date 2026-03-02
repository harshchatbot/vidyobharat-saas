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


def _ensure_tables() -> None:
    # Primary schema creation path for both local SQLite and Supabase Postgres.
    Base.metadata.create_all(bind=engine)


def _ensure_columns(table_name: str, migrations: list[tuple[str, str]]) -> None:
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns(table_name)}
    with engine.begin() as conn:
        for column_name, statement in migrations:
            if column_name not in existing:
                conn.execute(text(statement))


def _ensure_legacy_columns() -> None:
    # Backward-compatible column backfills for databases created before the current schema.
    _ensure_columns(
        'users',
        [
            ('display_name', 'ALTER TABLE users ADD COLUMN display_name VARCHAR(120)'),
            ('phone', 'ALTER TABLE users ADD COLUMN phone VARCHAR(32)'),
            ('avatar_url', 'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255)'),
            ('bio', 'ALTER TABLE users ADD COLUMN bio TEXT'),
            ('company', 'ALTER TABLE users ADD COLUMN company VARCHAR(120)'),
            ('address_line1', 'ALTER TABLE users ADD COLUMN address_line1 VARCHAR(255)'),
            ('address_line2', 'ALTER TABLE users ADD COLUMN address_line2 VARCHAR(255)'),
            ('city', 'ALTER TABLE users ADD COLUMN city VARCHAR(80)'),
            ('state', 'ALTER TABLE users ADD COLUMN state VARCHAR(80)'),
            ('country', 'ALTER TABLE users ADD COLUMN country VARCHAR(80)'),
            ('postal_code', 'ALTER TABLE users ADD COLUMN postal_code VARCHAR(24)'),
            ('timezone', 'ALTER TABLE users ADD COLUMN timezone VARCHAR(64)'),
            ('default_language', 'ALTER TABLE users ADD COLUMN default_language VARCHAR(40)'),
            ('default_voice', 'ALTER TABLE users ADD COLUMN default_voice VARCHAR(80)'),
            ('default_aspect_ratio', 'ALTER TABLE users ADD COLUMN default_aspect_ratio VARCHAR(10)'),
            ('email_notifications', 'ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE'),
            ('marketing_emails', 'ALTER TABLE users ADD COLUMN marketing_emails BOOLEAN DEFAULT FALSE'),
            ('auto_caption_default', 'ALTER TABLE users ADD COLUMN auto_caption_default BOOLEAN DEFAULT TRUE'),
            ('music_ducking_default', 'ALTER TABLE users ADD COLUMN music_ducking_default BOOLEAN DEFAULT TRUE'),
        ],
    )
    _ensure_columns(
        'videos',
        [
            ('aspect_ratio', "ALTER TABLE videos ADD COLUMN aspect_ratio VARCHAR(10) DEFAULT '9:16'"),
            ('resolution', "ALTER TABLE videos ADD COLUMN resolution VARCHAR(10) DEFAULT '1080p'"),
            ('duration_mode', "ALTER TABLE videos ADD COLUMN duration_mode VARCHAR(10) DEFAULT 'auto'"),
            ('duration_seconds', 'ALTER TABLE videos ADD COLUMN duration_seconds INTEGER'),
            ('captions_enabled', 'ALTER TABLE videos ADD COLUMN captions_enabled BOOLEAN DEFAULT TRUE'),
            ('caption_style', 'ALTER TABLE videos ADD COLUMN caption_style VARCHAR(40)'),
            ('audio_sample_rate_hz', 'ALTER TABLE videos ADD COLUMN audio_sample_rate_hz INTEGER DEFAULT 22050'),
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
            ('duck_music', 'ALTER TABLE videos ADD COLUMN duck_music BOOLEAN DEFAULT TRUE'),
        ],
    )
    _ensure_columns(
        'image_generations',
        [
            ('parent_image_id', 'ALTER TABLE image_generations ADD COLUMN parent_image_id VARCHAR(36)'),
            ('action_type', 'ALTER TABLE image_generations ADD COLUMN action_type VARCHAR(40)'),
        ],
    )
    _ensure_columns(
        'credit_topup_orders',
        [
            ('plan_name', "ALTER TABLE credit_topup_orders ADD COLUMN plan_name VARCHAR(32) DEFAULT 'starter'"),
            ('pricing_region', "ALTER TABLE credit_topup_orders ADD COLUMN pricing_region VARCHAR(24) DEFAULT 'south_asia'"),
            ('provider_checkout_id', 'ALTER TABLE credit_topup_orders ADD COLUMN provider_checkout_id VARCHAR(120)'),
        ],
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


_ensure_tables()
_ensure_legacy_columns()
_ensure_directories()
_ensure_builtin_music_previews()

logger.info(
    'database_initialized',
    extra={
        'request_id': 'system',
        'database_dialect': engine.dialect.name,
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


app.mount('/static', StaticFiles(directory='data'), name='static')
app.include_router(router)
