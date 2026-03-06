from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, TypeVar

T = TypeVar('T')


@dataclass(frozen=True)
class TierModelConfig:
    tier: str
    current_model_id: str
    status: str
    fallback_model_id: str | None = None


@dataclass(frozen=True)
class ModelExecutionResult[T]:
    value: T
    resolved_model_id: str
    fallback_used: bool


class SmartModelRouter:
    """Resilient model execution wrapper with automatic fallback on 429/503 style failures."""

    def __init__(self, tier_registry: dict[str, TierModelConfig] | None = None) -> None:
        self.tier_registry = tier_registry or {}

    def resolve_tier(self, tier: str) -> TierModelConfig | None:
        return self.tier_registry.get(tier)

    def resolve_and_execute(
        self,
        *,
        requested_model_id: str,
        execute: Callable[[str], T],
        fallback_model_ids: list[str] | None = None,
    ) -> ModelExecutionResult[T]:
        attempted: list[str] = []
        candidates = [requested_model_id, *(fallback_model_ids or [])]
        last_exc: Exception | None = None

        for candidate in candidates:
            if candidate in attempted:
                continue
            attempted.append(candidate)
            try:
                value = execute(candidate)
                return ModelExecutionResult(
                    value=value,
                    resolved_model_id=candidate,
                    fallback_used=(candidate != requested_model_id),
                )
            except Exception as exc:  # noqa: BLE001
                if not self._is_retryable_provider_error(exc):
                    raise
                last_exc = exc

        if last_exc is not None:
            raise last_exc
        raise RuntimeError('Model routing failed: no model candidates were available')

    def _is_retryable_provider_error(self, exc: Exception) -> bool:
        status_code = getattr(exc, 'status_code', None)
        if status_code in {429, 503}:
            return True
        if hasattr(exc, 'response') and getattr(exc.response, 'status_code', None) in {429, 503}:  # type: ignore[attr-defined]
            return True
        message = str(exc).lower()
        retryable_markers = (
            '429',
            '503',
            'resourceexhausted',
            'resource exhausted',
            'unavailable',
            'rate limit',
            'temporarily unavailable',
        )
        return any(marker in message for marker in retryable_markers)
