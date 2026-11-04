from __future__ import annotations

from datetime import timedelta

from app.db.repositories.guest_session_repository import GuestQuotaLimits
from app.services.guest_session_service import GuestSessionConfig, GuestSessionService


class _Repository:
    firestore = None


def _limits(uploads: int) -> GuestQuotaLimits:
    return GuestQuotaLimits(
        uploads=uploads,
        exports=3,
        uploaded_bytes=1000,
        storage_bytes=1000,
        processing_seconds=60,
        concurrent_processing=1,
    )


def test_usage_payload_never_advertises_uploads_blocked_by_network_quota() -> None:
    service = GuestSessionService(
        repository=_Repository(),
        config=GuestSessionConfig(
            cookie_name='test', cookie_secure=False, cookie_samesite='lax', lifetime=timedelta(hours=24),
            csrf_header='X-CSRF', csrf_value='1', allowed_origins=frozenset({'http://localhost:3000'}),
            limits=_limits(20), network_limits=_limits(5), creation_rate_limit=1,
            creation_rate_window=timedelta(hours=1), reservation_lease=timedelta(minutes=5),
            rate_limit_secret=b'test-rate-limit-secret-at-least-32-bytes',
        ),
    )
    session = {
        'uploads_count': 5, 'exports_count': 0, 'uploaded_bytes': 0, 'storage_bytes': 0,
        'processing_seconds': 0.0, 'reserved_uploads_count': 0, 'reserved_exports_count': 0,
        'reserved_uploaded_bytes': 0, 'reserved_storage_bytes': 0, 'reserved_processing_seconds': 0.0,
        'active_processing': 0,
    }

    usage = service.usage_payload(session, network_usage={'uploads': 5, 'exports': 0, 'uploaded_bytes': 0, 'processing_seconds': 0.0})

    assert usage['remaining']['uploads'] == 0
    assert usage['network_remaining']['uploads'] == 0
