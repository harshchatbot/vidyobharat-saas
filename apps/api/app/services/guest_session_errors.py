from __future__ import annotations


class GuestSessionError(RuntimeError):
    def __init__(
        self,
        error: str,
        message: str,
        *,
        status_code: int,
        recoverable: bool,
        retry_action: str | None = None,
    ) -> None:
        super().__init__(message)
        self.error = error
        self.message = message
        self.status_code = status_code
        self.recoverable = recoverable
        self.retry_action = retry_action

    def response_body(self) -> dict[str, object]:
        return {
            'error': self.error,
            'message': self.message,
            'recoverable': self.recoverable,
            'retry_action': self.retry_action,
        }


def session_required() -> GuestSessionError:
    return GuestSessionError(
        'guest_session_required',
        'A valid guest editor session is required.',
        status_code=401,
        recoverable=True,
        retry_action='/api/editor/guest/session',
    )


def session_invalid() -> GuestSessionError:
    return GuestSessionError(
        'guest_session_invalid',
        'The guest editor session is invalid.',
        status_code=401,
        recoverable=True,
        retry_action='/api/editor/guest/session',
    )


def session_expired() -> GuestSessionError:
    return GuestSessionError(
        'guest_session_expired',
        'The guest editor session has expired.',
        status_code=401,
        recoverable=True,
        retry_action='/api/editor/guest/session',
    )


def session_revoked() -> GuestSessionError:
    return GuestSessionError(
        'guest_session_revoked',
        'The guest editor session has been revoked.',
        status_code=403,
        recoverable=False,
    )


def quota_exceeded(quota: str) -> GuestSessionError:
    return GuestSessionError(
        'guest_quota_exceeded',
        f'The guest {quota} quota has been reached.',
        status_code=429,
        recoverable=True,
    )


def quota_transaction_busy() -> GuestSessionError:
    return GuestSessionError(
        'guest_quota_busy',
        'Guest quota capacity is busy. Retry the operation shortly.',
        status_code=503,
        recoverable=True,
    )


def reservation_conflict() -> GuestSessionError:
    return GuestSessionError(
        'guest_reservation_conflict',
        'The quota reservation identifier has already been used.',
        status_code=409,
        recoverable=False,
    )
