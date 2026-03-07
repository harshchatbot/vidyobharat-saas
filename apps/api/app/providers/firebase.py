from __future__ import annotations

import json
import base64
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
        payload = _load_service_account_payload(settings)
        source = _resolve_credential_source(settings, payload)
        logger.info(
            'firebase_admin_credential_source',
            extra={
                'request_id': 'system',
                'source': source,
                'project_id_configured': bool(settings.firebase_project_id),
                'bucket_configured': bool(normalize_firebase_bucket(settings.firebase_storage_bucket)),
            },
        )

        if payload:
            cred = credentials.Certificate(payload)
        elif settings.firebase_service_account_path:
            cred = credentials.Certificate(Path(settings.firebase_service_account_path))
        elif settings.env != 'production':
            # Keep local dev convenient when env vars are not set.
            cred = credentials.ApplicationDefault()
        else:
            raise FirebaseNotConfiguredError(
                'Firebase credentials are missing in production. Set FIREBASE_SERVICE_ACCOUNT_JSON, '
                'FIREBASE_SERVICE_ACCOUNT_JSON_B64, or split FIREBASE_* service-account fields.'
            )
    except Exception as exc:  # pragma: no cover - config/runtime specific
        logger.exception('firebase_credentials_initialization_failed')
        raise FirebaseNotConfiguredError(
            'Firebase Admin credentials are invalid or missing. '
            'Set FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_JSON_B64 '
            'or split FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL (+ FIREBASE_PROJECT_ID).'
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


def _resolve_credential_source(settings, payload: dict | None) -> str:
    if settings.firebase_service_account_json:
        return 'env_json'
    if settings.firebase_service_account_json_b64:
        return 'env_json_b64'
    if payload:
        return 'split_env'
    if settings.firebase_service_account_path:
        return 'path'
    return 'application_default' if settings.env != 'production' else 'missing'


def _load_service_account_payload(settings) -> dict | None:
    raw_json = (settings.firebase_service_account_json or '').strip()
    if raw_json:
        parsed = json.loads(raw_json)
        return _coerce_service_account_payload(parsed, settings)

    raw_b64 = (settings.firebase_service_account_json_b64 or '').strip()
    if raw_b64:
        decoded = base64.b64decode(raw_b64).decode('utf-8')
        parsed = json.loads(decoded)
        return _coerce_service_account_payload(parsed, settings)

    if settings.firebase_client_email and settings.firebase_private_key:
        payload = {
            'type': 'service_account',
            'project_id': settings.firebase_project_id,
            'private_key_id': settings.firebase_private_key_id or '',
            'private_key': _normalize_private_key(settings.firebase_private_key),
            'client_email': settings.firebase_client_email,
            'client_id': settings.firebase_client_id or '',
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'auth_provider_x509_cert_url': 'https://www.googleapis.com/oauth2/v1/certs',
            'client_x509_cert_url': settings.firebase_client_x509_cert_url
            or f"https://www.googleapis.com/robot/v1/metadata/x509/{settings.firebase_client_email}",
        }
        return _coerce_service_account_payload(payload, settings)

    return None


def _coerce_service_account_payload(payload: dict, settings) -> dict:
    normalized = dict(payload)
    if settings.firebase_project_id and not normalized.get('project_id'):
        normalized['project_id'] = settings.firebase_project_id
    if normalized.get('private_key'):
        normalized['private_key'] = _normalize_private_key(str(normalized['private_key']))
    required = ('project_id', 'client_email', 'private_key')
    missing = [key for key in required if not normalized.get(key)]
    if missing:
        raise FirebaseNotConfiguredError(f'Missing Firebase service account fields: {", ".join(missing)}')
    return normalized


def _normalize_private_key(value: str) -> str:
    return value.replace('\\n', '\n').strip()
