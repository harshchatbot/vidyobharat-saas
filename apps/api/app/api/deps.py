import json
import time
from typing import Any
from urllib.request import urlopen

import jwt
from fastapi import Depends, Header, HTTPException, Request
import logging

from app.core.config import get_settings
from app.db.repositories.user_repository import UserRepository
from app.services.credit_service import CreditService
from app.services.firestore_sync_service import FirestoreSyncService


_FIREBASE_CERTS_CACHE: dict[str, Any] = {'expires_at': 0.0, 'certs': {}}
_FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
logger = logging.getLogger(__name__)


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
        token = authorization.split(' ', 1)[1].strip()
        try:
            claims = _verify_firebase_token(token)
            user_id = claims['sub']
            email = claims.get('email')
            user = UserRepository(None).get_or_create_auth_user(
                user_id=user_id,
                email=email if isinstance(email, str) else None,
                display_name=_derive_display_name(claims, email if isinstance(email, str) else None),
                avatar_url=_derive_avatar_url(claims),
            )
            FirestoreSyncService().sync_user(user)
            wallet = CreditService().ensure_wallet(user.id)
            FirestoreSyncService().sync_wallet(wallet)
            request.state.user_claims = claims
            return user.id
        except HTTPException as exc:
            if not x_user_id:
                raise
            logger.warning(
                'firebase_token_verification_failed_falling_back_to_user_id',
                extra={'request_id': getattr(request.state, 'request_id', 'system'), 'detail': exc.detail},
            )

    if x_user_id:
        # Transitional fallback for existing server-rendered flows until all API calls
        # consistently forward Firebase bearer tokens.
        user = UserRepository(None).get_or_create_auth_user(
            user_id=x_user_id,
            email=None,
            display_name=None,
            avatar_url=None,
        )
        FirestoreSyncService().sync_user(user)
        wallet = CreditService().ensure_wallet(user.id)
        FirestoreSyncService().sync_wallet(wallet)
        return user.id

    raise HTTPException(status_code=401, detail='Authentication required')


async def require_admin_user(
    request: Request,
    user_id: str = Depends(get_user_id),
) -> str:
    settings = get_settings()
    claims = getattr(request.state, 'user_claims', {}) if hasattr(request.state, 'user_claims') else {}
    email = claims.get('email') if isinstance(claims, dict) else None
    admin_ids = set(settings.admin_user_ids_list)
    admin_emails = set(settings.admin_user_emails_list)

    # Placeholder guard for future role-based admin auth.
    # If no explicit admin list is configured, allow authenticated users so admin tooling
    # remains usable in development/staging without a separate role system.
    if not admin_ids and not admin_emails:
        logger.warning('admin_guard_open_mode_enabled')
        return user_id

    if user_id in admin_ids:
        return user_id
    if isinstance(email, str) and email.lower() in admin_emails:
        return user_id
    raise HTTPException(status_code=403, detail='Admin access required')
