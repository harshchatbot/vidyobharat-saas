import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.request import urlopen

import jwt
from fastapi import Depends, Header, HTTPException, Request
import logging

from app.core.config import get_settings
from app.db.repositories.user_repository import UserRepository
from app.providers.firebase import FirebaseNotConfiguredError, get_firebase_app
from app.services.firestore_sync_service import FirestoreSyncService


_FIREBASE_CERTS_CACHE: dict[str, Any] = {'expires_at': 0.0, 'certs': {}}
_FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AdminPrincipal:
    uid: str
    email: str | None


@dataclass(frozen=True)
class VerifiedFirebasePrincipal:
    uid: str
    email: str | None


def _derive_display_name(claims: dict[str, Any], email: str | None) -> str | None:
    for key in ('name', 'display_name', 'full_name'):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if email:
        local = email.split('@')[0] or 'User'
        return ' '.join(
            part.capitalize()
            for part in local.replace('.', ' ').replace('_', ' ').replace('-', ' ').split()
        ) or 'User'
    return None


def _derive_avatar_url(claims: dict[str, Any]) -> str | None:
    for key in ('picture', 'avatar_url'):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _load_firebase_certs() -> dict[str, str]:
    now = time.time()
    if _FIREBASE_CERTS_CACHE['expires_at'] > now and _FIREBASE_CERTS_CACHE['certs']:
        return _FIREBASE_CERTS_CACHE['certs']

    with urlopen(_FIREBASE_CERTS_URL, timeout=10) as response:  # noqa: S310
        cache_control = response.headers.get('Cache-Control', '')
        max_age = 300
        for part in cache_control.split(','):
            part = part.strip()
            if part.startswith('max-age='):
                try:
                    max_age = int(part.split('=', 1)[1])
                except ValueError:
                    max_age = 300
        certs = json.loads(response.read().decode('utf-8'))
        _FIREBASE_CERTS_CACHE['certs'] = certs
        _FIREBASE_CERTS_CACHE['expires_at'] = now + max_age
        return certs


def _verify_firebase_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.firebase_project_id:
        raise HTTPException(status_code=500, detail='FIREBASE_PROJECT_ID is not configured')

    try:
        header = jwt.get_unverified_header(token)
        kid = header.get('kid')
        if not isinstance(kid, str) or not kid:
            raise HTTPException(status_code=401, detail='Auth token is missing key id')
        certs = _load_firebase_certs()
        certificate = certs.get(kid)
        if not certificate:
            raise HTTPException(status_code=401, detail='Unable to verify Firebase token signature')
        claims = jwt.decode(
            token,
            certificate,
            algorithms=['RS256'],
            audience=settings.firebase_project_id,
            issuer=f'https://securetoken.google.com/{settings.firebase_project_id}',
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail='Invalid or expired auth token') from exc

    sub = claims.get('sub')
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail='Auth token is missing subject')
    return claims


async def get_user_id(
    request: Request,
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> str:
    if authorization and authorization.lower().startswith('bearer '):
        principal = await require_verified_firebase_principal(request, authorization)
        user = UserRepository(None).get_or_create_auth_user(
            user_id=principal.uid,
            email=principal.email,
            display_name=None,
            avatar_url=None,
        )
        FirestoreSyncService().sync_user(user)
        if x_user_id and x_user_id not in {principal.uid, user.id}:
            raise HTTPException(status_code=403, detail='User identity does not match authentication token')
        return user.id

    settings = get_settings()
    if x_user_id and settings.allow_legacy_user_id_header and settings.env.lower() in {'development', 'test'}:
        user = UserRepository(None).get_or_create_auth_user(user_id=x_user_id, email=None, display_name=None, avatar_url=None)
        FirestoreSyncService().sync_user(user)
        return user.id

    raise HTTPException(status_code=401, detail='Authentication required')


async def require_admin_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> str:
    return (await require_admin_principal(request, authorization)).uid


async def require_verified_firebase_principal(
    request: Request,
    authorization: str | None = Header(default=None),
) -> VerifiedFirebasePrincipal:
    """Strict Firebase authentication for paid or sensitive new features.

    This intentionally never accepts X-User-ID and uses the Admin SDK so the
    Firebase Auth emulator and revoked-token checks share one path.
    """
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Verified Firebase authentication is required')
    token = authorization.split(' ', 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail='Verified Firebase authentication is required')
    try:
        from firebase_admin import auth as firebase_auth
    except Exception as exc:
        logger.exception('firebase_user_auth_import_failed')
        raise HTTPException(status_code=503, detail='Firebase authentication is unavailable') from exc
    try:
        claims = firebase_auth.verify_id_token(token, app=get_firebase_app(), check_revoked=True)
    except FirebaseNotConfiguredError as exc:
        logger.exception('firebase_user_auth_unavailable')
        raise HTTPException(status_code=503, detail='Firebase authentication is unavailable') from exc
    except (
        firebase_auth.InvalidIdTokenError,
        firebase_auth.ExpiredIdTokenError,
        firebase_auth.RevokedIdTokenError,
        firebase_auth.UserDisabledError,
    ) as exc:
        logger.warning('firebase_user_token_rejected', exc_info=True)
        raise HTTPException(status_code=401, detail='Invalid or expired Firebase token') from exc
    except Exception as exc:
        logger.exception('firebase_user_verification_unavailable')
        raise HTTPException(status_code=503, detail='Firebase authentication is unavailable') from exc

    uid = claims.get('uid') or claims.get('sub')
    if not isinstance(uid, str) or not uid:
        raise HTTPException(status_code=401, detail='Firebase token is missing its subject')
    email = claims.get('email')
    principal = VerifiedFirebasePrincipal(
        uid=uid,
        email=email.lower() if isinstance(email, str) else None,
    )
    request.state.firebase_principal = principal
    return principal


async def require_admin_principal(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AdminPrincipal:
    settings = get_settings()
    admin_ids = set(settings.admin_user_ids_list)
    admin_emails = set(settings.admin_user_emails_list)
    if not admin_ids and not admin_emails:
        logger.error('admin_allowlist_missing')
        raise HTTPException(status_code=503, detail='Admin access is not configured')
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Verified Firebase authentication is required')
    token = authorization.split(' ', 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail='Verified Firebase authentication is required')
    try:
        from firebase_admin import auth

        claims = auth.verify_id_token(token, app=get_firebase_app(), check_revoked=True)
    except FirebaseNotConfiguredError as exc:
        logger.exception('admin_firebase_unavailable')
        raise HTTPException(status_code=503, detail='Admin authentication is unavailable') from exc
    except (
        auth.InvalidIdTokenError,
        auth.ExpiredIdTokenError,
        auth.RevokedIdTokenError,
        auth.UserDisabledError,
    ) as exc:
        logger.warning('admin_token_verification_failed', exc_info=True)
        raise HTTPException(status_code=401, detail='Invalid or expired Firebase token') from exc
    except Exception as exc:
        logger.exception('admin_firebase_verification_unavailable')
        raise HTTPException(status_code=503, detail='Admin authentication is unavailable') from exc

    user_id = claims.get('uid') or claims.get('sub')
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail='Firebase token is missing its subject')
    email = claims.get('email')
    normalized_email = email.lower() if isinstance(email, str) else None
    email_authorized = (
        normalized_email in admin_emails
        and claims.get('email_verified') is True
    )
    if user_id in admin_ids or email_authorized:
        principal = AdminPrincipal(uid=user_id, email=normalized_email)
        request.state.admin_principal = principal
        return principal
    raise HTTPException(status_code=403, detail='Admin access required')
