from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
import logging
from urllib.parse import urlparse

from app.core.config import get_settings


class FirebaseNotConfiguredError(RuntimeError):
    pass


logger = logging.getLogger(__name__)


def normalize_firebase_bucket(raw_bucket: str | None) -> str | None:
    """Normalize bucket env values like gs://bucket or https://.../bucket."""
    if not raw_bucket:
        return None
    bucket = raw_bucket.strip()
    if not bucket:
        return None

    if bucket.startswith('gs://'):
        bucket = bucket[5:]
    elif bucket.startswith('http://') or bucket.startswith('https://'):
        parsed = urlparse(bucket)
        host = parsed.netloc
        path = parsed.path.strip('/')
        segments = [seg for seg in path.split('/') if seg]
        # Firebase REST URLs usually look like /v0/b/<bucket>/o
        if 'b' in segments:
            idx = segments.index('b')
            bucket = segments[idx + 1] if len(segments) > idx + 1 else ''
        else:
            # Prefer explicit bucket path if present, else fallback to host.
            bucket = path or host
            if bucket.startswith('b/'):
                bucket = bucket[2:]

    bucket = bucket.strip('/').strip()
    return bucket or None


@lru_cache(maxsize=1)
def get_firebase_app():
    settings = get_settings()
    if not settings.firebase_project_id:
        raise FirebaseNotConfiguredError('FIREBASE_PROJECT_ID is not configured')

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:
        raise FirebaseNotConfiguredError('firebase-admin dependency is not installed') from exc

    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    cred = None
    try:
        if settings.firebase_service_account_json:
            cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
        elif settings.firebase_service_account_path:
            cred = credentials.Certificate(Path(settings.firebase_service_account_path))
        else:
            cred = credentials.ApplicationDefault()
    except Exception as exc:  # pragma: no cover - config/runtime specific
        logger.exception('firebase_credentials_initialization_failed')
        raise FirebaseNotConfiguredError(
            'Firebase Admin credentials are invalid or missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH on the backend.'
        ) from exc

    options: dict[str, str] = {'projectId': settings.firebase_project_id}
    normalized_bucket = normalize_firebase_bucket(settings.firebase_storage_bucket)
    if normalized_bucket:
        options['storageBucket'] = normalized_bucket

    try:
        return firebase_admin.initialize_app(cred, options)
    except Exception as exc:  # pragma: no cover - config/runtime specific
        logger.exception('firebase_admin_initialize_failed')
        raise FirebaseNotConfiguredError(
            'Firebase Admin could not initialize. Verify FIREBASE_PROJECT_ID and service account credentials.'
        ) from exc


def get_firestore_client():
    from firebase_admin import firestore

    try:
        app = get_firebase_app()
        return firestore.client(app=app)
    except FirebaseNotConfiguredError:
        raise
    except Exception as exc:  # pragma: no cover - config/runtime specific
        logger.exception('firestore_client_initialization_failed')
        raise FirebaseNotConfiguredError(
            'Firestore is not available on the backend. Configure Firebase Admin credentials for Render.'
        ) from exc
