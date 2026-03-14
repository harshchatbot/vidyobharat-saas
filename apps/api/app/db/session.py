from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def _normalize_database_url(database_url: str) -> str:
    url = (database_url or '').strip()
    if not url:
        return url
    if url.startswith('postgres://'):
        # Render and some platforms still expose legacy postgres:// URLs.
        url = 'postgresql://' + url[len('postgres://'):]
    if url.startswith('postgresql+psycopg2://'):
        # We ship psycopg (v3), not psycopg2.
        return 'postgresql+psycopg://' + url[len('postgresql+psycopg2://'):]
    if url.startswith('postgresql://'):
        return 'postgresql+psycopg://' + url[len('postgresql://'):]
    return url


def _engine_kwargs(database_url: str) -> dict:
    kwargs: dict = {
        'pool_pre_ping': True,
        'future': True,
    }
    if database_url.startswith('sqlite'):
        kwargs['connect_args'] = {'check_same_thread': False}
    return kwargs


@lru_cache(maxsize=1)
def get_engine():
    settings = get_settings()
    normalized_url = _normalize_database_url(settings.database_url)
    return create_engine(normalized_url, **_engine_kwargs(normalized_url))


@lru_cache(maxsize=1)
def get_session_factory():
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
