"""Cloudflare Turnstile verification for anonymous Music Studio submissions."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TurnstileError(RuntimeError):
    pass


class MusicStudioTurnstileService:
    def __init__(self) -> None:
        self._used: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def verify(self, token: str | None, remote_ip: str | None) -> None:
        settings = get_settings()
        required = settings.music_studio_turnstile_required
        if required is None:
            required = settings.env.lower() not in {"development", "test"}
        secret = settings.music_studio_turnstile_secret_key
        if not required and not secret:
            logger.info("music_studio_turnstile_bypassed_local")
            return
        if not secret:
            raise TurnstileError("Music Studio abuse protection is not configured. Public submissions are disabled.")
        if not token:
            raise TurnstileError("Please complete the anti-abuse check before producing your master.")
        token_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        async with self._lock:
            now = time.time()
            self._used = {key: expiry for key, expiry in self._used.items() if expiry > now}
            if token_digest in self._used:
                raise TurnstileError("This anti-abuse token has already been used. Please try again.")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", data={"secret": secret, "response": token, "remoteip": remote_ip or ""})
                result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("music_studio_turnstile_request_failed", exc_info=True)
            raise TurnstileError("The anti-abuse check could not be verified. Please try again.") from exc
        if not result.get("success"):
            raise TurnstileError("The anti-abuse check was not accepted. Please try again.")
        async with self._lock:
            self._used[token_digest] = time.time() + 300


music_studio_turnstile_service = MusicStudioTurnstileService()
