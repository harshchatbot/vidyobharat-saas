from __future__ import annotations

import hashlib
import hmac
import ipaddress
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from fastapi import Request

from app.core.config import Settings, get_settings
from app.providers.firebase import get_firestore_client
from app.db.repositories.guest_session_repository import (
    GuestQuotaLimits,
    GuestQuotaReservation,
    GuestSessionRepository,
)
from app.db.repositories.guest_network_quota_repository import GuestNetworkQuotaRepository
from app.services.guest_session_errors import (
    GuestSessionError,
    session_expired,
    session_invalid,
    session_required,
    session_revoked,
)
from app.services.app_config_service import AppConfigService, get_app_config_service


@dataclass(frozen=True)
class GuestSessionConfig:
    cookie_name: str
    cookie_secure: bool
    cookie_samesite: str
    lifetime: timedelta
    csrf_header: str
    csrf_value: str
    allowed_origins: frozenset[str]
    limits: GuestQuotaLimits
    creation_rate_limit: int
    creation_rate_window: timedelta
    reservation_lease: timedelta
    rate_limit_secret: bytes
    network_limits: GuestQuotaLimits | None = None
    trusted_proxy_cidrs: tuple[str, ...] = ()

    @classmethod
    def from_settings(cls, settings: Settings) -> GuestSessionConfig:
        samesite = settings.editor_guest_cookie_samesite.strip().lower()
        if samesite not in {'lax', 'strict', 'none'}:
            raise RuntimeError('EDITOR_GUEST_COOKIE_SAMESITE must be lax, strict, or none.')
        cookie_secure = settings.editor_guest_cookie_is_secure
        if samesite == 'none' and not cookie_secure:
            raise RuntimeError('SameSite=None guest cookies require Secure=true.')
        if settings.env == 'production' and not cookie_secure:
            raise RuntimeError('Guest session cookies must be Secure in production.')
        if settings.editor_guest_session_hours != 24:
            raise RuntimeError('Guest session lifetime must remain exactly 24 hours for V1.')

        origins = frozenset(origin.rstrip('/') for origin in settings.allowed_origins_list)
        if not origins or '*' in origins:
            raise RuntimeError('Guest editor requires explicit allowed origins.')

        secret = (settings.editor_guest_rate_limit_secret or '').encode('utf-8')
        if settings.env == 'production' and len(secret) < 32:
            raise RuntimeError('EDITOR_GUEST_RATE_LIMIT_SECRET must contain at least 32 bytes in production.')
        if not secret:
            secret = b'demo-rangmanch-editor-development-rate-limit-key'

        limits = GuestQuotaLimits(
            uploads=settings.editor_guest_max_uploads,
            exports=settings.editor_guest_max_exports,
            uploaded_bytes=settings.editor_guest_max_uploaded_bytes,
            storage_bytes=settings.editor_guest_max_storage_bytes,
            processing_seconds=float(settings.editor_guest_max_processing_seconds),
            concurrent_processing=settings.editor_guest_max_concurrent_processing,
        )
        network_limits = GuestQuotaLimits(
            uploads=settings.editor_guest_network_max_uploads,
            exports=settings.editor_guest_network_max_exports,
            uploaded_bytes=settings.editor_guest_network_max_uploaded_bytes,
            storage_bytes=settings.editor_guest_max_storage_bytes,
            processing_seconds=float(settings.editor_guest_network_max_processing_seconds),
            concurrent_processing=settings.editor_guest_max_concurrent_processing,
        )
        try:
            limits.validate()
            network_limits.validate()
        except ValueError as exc:
            raise RuntimeError('Guest quota limits must all be positive finite values.') from exc
        if settings.editor_guest_session_rate_limit <= 0 or settings.editor_guest_session_rate_window_seconds <= 0:
            raise RuntimeError('Guest session rate-limit settings must be positive.')
        if settings.editor_guest_reservation_lease_seconds <= 0:
            raise RuntimeError('Guest quota reservation lease must be positive.')

        trusted_proxy_cidrs = tuple(
            value.strip() for value in settings.editor_guest_trusted_proxy_cidrs.split(',') if value.strip()
        )
        try:
            for cidr in trusted_proxy_cidrs:
                ipaddress.ip_network(cidr, strict=False)
        except ValueError as exc:
            raise RuntimeError('EDITOR_GUEST_TRUSTED_PROXY_CIDRS contains an invalid network.') from exc

        return cls(
            cookie_name=settings.editor_guest_cookie_name,
            cookie_secure=cookie_secure,
            cookie_samesite=samesite,
            lifetime=timedelta(hours=24),
            csrf_header=settings.editor_guest_csrf_header,
            csrf_value=settings.editor_guest_csrf_value,
            allowed_origins=origins,
            limits=limits,
            creation_rate_limit=settings.editor_guest_session_rate_limit,
            creation_rate_window=timedelta(seconds=settings.editor_guest_session_rate_window_seconds),
            reservation_lease=timedelta(seconds=settings.editor_guest_reservation_lease_seconds),
            rate_limit_secret=secret,
            network_limits=network_limits,
            trusted_proxy_cidrs=trusted_proxy_cidrs,
        )


class GuestSessionService:
    def __init__(self, *, repository: GuestSessionRepository, config: GuestSessionConfig, app_config: AppConfigService | None = None) -> None:
        self.repository = repository
        self.config = config
        self.app_config = app_config
        firestore_client = getattr(repository, 'firestore', None)
        self.network_quotas = GuestNetworkQuotaRepository(firestore_client) if firestore_client is not None else None

    @property
    def limits(self) -> GuestQuotaLimits:
        if self.app_config is None:
            return self.config.limits
        configured = self.app_config.get().guest
        return GuestQuotaLimits(
            uploads=configured.max_uploads,
            exports=configured.max_exports,
            uploaded_bytes=configured.max_uploaded_bytes,
            storage_bytes=configured.max_storage_bytes,
            processing_seconds=configured.max_processing_seconds,
            concurrent_processing=configured.max_concurrent_processing,
        )

    @property
    def network_limits(self) -> GuestQuotaLimits:
        if self.app_config is None:
            return self.config.network_limits or self.config.limits
        configured = self.app_config.get().guest
        return GuestQuotaLimits(
            uploads=configured.network_max_uploads,
            exports=configured.network_max_exports,
            uploaded_bytes=configured.network_max_uploaded_bytes,
            storage_bytes=self.limits.storage_bytes,
            processing_seconds=configured.network_max_processing_seconds,
            concurrent_processing=self.limits.concurrent_processing,
        )

    def create_session(self, request: Request, raw_token: str | None) -> tuple[dict[str, Any], str | None]:
        self.validate_mutating_request(request)
        if raw_token:
            existing = self._find_session(raw_token)
            if existing is not None:
                try:
                    return self._require_active(existing), None
                except GuestSessionError:
                    pass

        now = datetime.now(UTC)
        self._consume_creation_rate_limit(request, now)
        token = secrets.token_urlsafe(48)
        guest_id = secrets.token_urlsafe(24)
        session = self.repository.create(
            guest_id=guest_id,
            token_hash=self.hash_token(token),
            now=now,
            expires_at=now + self.config.lifetime,
        )
        return session, token

    def get_session(self, raw_token: str | None) -> dict[str, Any]:
        if not raw_token:
            raise session_required()
        session = self._find_session(raw_token)
        if session is None:
            raise session_invalid()
        return self._require_active(session)

    def usage(self, raw_token: str | None, request: Request | None = None) -> dict[str, Any]:
        session = self.get_session(raw_token)
        network_usage = None
        if request is not None:
            assert self.network_quotas is not None
            network_usage = self.network_quotas.usage(
                subject=self.network_subject(request),
                now=datetime.now(UTC),
            )
        return self.usage_payload(session, network_usage=network_usage)

    def reserve_network_quota(
        self,
        *,
        request: Request,
        guest_id: str,
        reservation_id: str,
        reservation: GuestQuotaReservation,
    ) -> str:
        subject = self.network_subject(request)
        assert self.network_quotas is not None
        self.network_quotas.reserve(
            subject=subject,
            guest_id=guest_id,
            reservation_id=reservation_id,
            reservation=reservation,
            limits=self.network_limits,
            now=datetime.now(UTC),
        )
        return subject

    def increase_network_quota(self, *, subject: str, reservation_id: str, additional: GuestQuotaReservation) -> None:
        assert self.network_quotas is not None
        self.network_quotas.increase(
            subject=subject,
            reservation_id=reservation_id,
            additional=additional,
            limits=self.network_limits,
            now=datetime.now(UTC),
        )

    def finish_network_quota(self, *, subject: str | None, reservation_id: str, commit: bool) -> None:
        if not subject:
            return
        assert self.network_quotas is not None
        self.network_quotas.finish(
            subject=subject,
            reservation_id=reservation_id,
            commit=commit,
            now=datetime.now(UTC),
        )

    def network_subject(self, request: Request) -> str:
        peer = request.client.host if request.client else 'unknown'
        client_address = peer
        try:
            peer_ip = ipaddress.ip_address(peer)
            trusted = any(peer_ip in ipaddress.ip_network(cidr, strict=False) for cidr in self.config.trusted_proxy_cidrs)
        except ValueError:
            trusted = False
        if trusted:
            forwarded = (request.headers.get('x-forwarded-for') or '').split(',', 1)[0].strip()
            try:
                client_address = str(ipaddress.ip_address(forwarded))
            except ValueError:
                client_address = peer
        digest = hmac.new(
            self.config.rate_limit_secret,
            f'network-quota\0{client_address}'.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()
        return digest

    def reserve_quota(
        self,
        *,
        raw_token: str | None,
        reservation_id: str,
        reservation: GuestQuotaReservation,
    ) -> dict[str, Any]:
        session = self.get_session(raw_token)
        now = datetime.now(UTC)
        self.repository.release_expired_reservations(guest_id=session['guest_id'], now=now)
        return self.repository.reserve_quota(
            guest_id=session['guest_id'],
            reservation_id=reservation_id,
            reservation=reservation,
            limits=self.limits,
            now=now,
            lease_expires_at=min(session['expires_at'], now + self.config.reservation_lease),
        )

    def release_quota(
        self,
        *,
        raw_token: str | None,
        reservation_id: str,
        commit: bool = False,
    ) -> dict[str, Any]:
        session = self.get_session(raw_token)
        return self.repository.release_quota(
            guest_id=session['guest_id'],
            reservation_id=reservation_id,
            now=datetime.now(UTC),
            commit=commit,
        )

    def increase_quota_reservation(
        self,
        *,
        raw_token: str | None,
        reservation_id: str,
        additional: GuestQuotaReservation,
    ) -> dict[str, Any]:
        session = self.get_session(raw_token)
        return self.repository.increase_quota_reservation(
            guest_id=session['guest_id'],
            reservation_id=reservation_id,
            additional=additional,
            limits=self.limits,
            now=datetime.now(UTC),
        )

    def validate_mutating_request(self, request: Request) -> None:
        if self.app_config is not None and not self.app_config.get().features.guest_editor_enabled:
            raise GuestSessionError(
                'guest_editor_disabled',
                'The guest editor is temporarily unavailable.',
                status_code=503,
                recoverable=True,
            )
        origin = (request.headers.get('origin') or '').rstrip('/')
        if origin not in self.config.allowed_origins:
            raise GuestSessionError(
                'guest_origin_rejected',
                'The request origin is not allowed for the guest editor.',
                status_code=403,
                recoverable=False,
            )
        if not self.config.cookie_secure and urlparse(origin).hostname not in {'localhost', '127.0.0.1', '::1'}:
            raise GuestSessionError(
                'guest_insecure_origin_rejected',
                'Insecure guest cookies are allowed only for loopback development origins.',
                status_code=403,
                recoverable=False,
            )
        if not hmac.compare_digest(request.headers.get(self.config.csrf_header, ''), self.config.csrf_value):
            raise GuestSessionError(
                'guest_csrf_rejected',
                'The guest editor CSRF check failed.',
                status_code=403,
                recoverable=False,
            )

    def public_session_payload(self, session: dict[str, Any]) -> dict[str, Any]:
        return {
            'guest_id': session['guest_id'],
            'created_at': session['created_at'],
            'expires_at': session['expires_at'],
            'status': session['status'],
            'usage': self.usage_payload(session),
        }

    def usage_payload(self, session: dict[str, Any], *, network_usage: dict[str, int | float] | None = None) -> dict[str, Any]:
        used = {
            'uploads': int(session.get('uploads_count', 0)),
            'exports': int(session.get('exports_count', 0)),
            'uploaded_bytes': int(session.get('uploaded_bytes', 0)),
            'storage_bytes': int(session.get('storage_bytes', 0)),
            'processing_seconds': float(session.get('processing_seconds', 0.0)),
            'concurrent_processing': 0,
        }
        reserved = {
            'uploads': int(session.get('reserved_uploads_count', 0)),
            'exports': int(session.get('reserved_exports_count', 0)),
            'uploaded_bytes': int(session.get('reserved_uploaded_bytes', 0)),
            'storage_bytes': int(session.get('reserved_storage_bytes', 0)),
            'processing_seconds': float(session.get('reserved_processing_seconds', 0.0)),
            'concurrent_processing': int(session.get('active_processing', 0)),
        }
        effective_limits = self.limits
        limits = {
            'uploads': effective_limits.uploads,
            'exports': effective_limits.exports,
            'uploaded_bytes': effective_limits.uploaded_bytes,
            'storage_bytes': effective_limits.storage_bytes,
            'processing_seconds': effective_limits.processing_seconds,
            'concurrent_processing': effective_limits.concurrent_processing,
        }
        remaining = {
            key: max(0, limits[key] - used[key] - reserved[key])
            for key in limits
        }
        payload: dict[str, Any] = {'used': used, 'reserved': reserved, 'remaining': remaining, 'limits': limits}
        if network_usage is not None:
            network_limits = {
                'uploads': self.network_limits.uploads,
                'exports': self.network_limits.exports,
                'uploaded_bytes': self.network_limits.uploaded_bytes,
                'processing_seconds': self.network_limits.processing_seconds,
            }
            network_remaining = {
                key: max(0, network_limits[key] - network_usage.get(key, 0))
                for key in network_limits
            }
            for key in network_remaining:
                remaining[key] = min(remaining[key], network_remaining[key])
            payload['network_used'] = network_usage
            payload['network_remaining'] = network_remaining
            payload['network_limits'] = network_limits
        return payload

    def _find_session(self, raw_token: str) -> dict[str, Any] | None:
        return self.repository.find_by_token_hash(self.hash_token(raw_token))

    def _require_active(self, session: dict[str, Any]) -> dict[str, Any]:
        expires_at = session.get('expires_at')
        if not isinstance(expires_at, datetime) or expires_at <= datetime.now(UTC):
            raise session_expired()
        if session.get('status') != 'active':
            raise session_revoked()
        return session

    def _consume_creation_rate_limit(self, request: Request, now: datetime) -> None:
        peer = request.client.host if request.client else 'unknown'
        fingerprint = hmac.new(self.config.rate_limit_secret, peer.encode('utf-8'), hashlib.sha256).hexdigest()
        window_seconds = int(self.config.creation_rate_window.total_seconds())
        window_start_epoch = int(now.timestamp()) // window_seconds * window_seconds
        window_started_at = datetime.fromtimestamp(window_start_epoch, UTC)
        key = f'{fingerprint}-{window_start_epoch}'
        self.repository.consume_session_creation_rate_limit(
            key=key,
            now=now,
            window_started_at=window_started_at,
            expires_at=window_started_at + self.config.creation_rate_window * 2,
            limit=self.config.creation_rate_limit,
        )

    @staticmethod
    def hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()


def build_guest_session_service() -> GuestSessionService:
    settings = get_settings()
    firestore = get_firestore_client()
    return GuestSessionService(
        repository=GuestSessionRepository(firestore),
        config=GuestSessionConfig.from_settings(settings),
        app_config=get_app_config_service(),
    )
