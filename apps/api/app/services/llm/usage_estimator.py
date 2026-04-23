from __future__ import annotations

from typing import Any


def estimate_text_tokens(text: str | None) -> int:
    value = str(text or "").strip()
    if not value:
        return 0
    return max(1, len(value) // 4)


def estimate_chat_input_tokens(messages: list[dict[str, Any]] | None) -> int:
    total = 0
    for message in messages or []:
        total += estimate_text_tokens(str(message.get("content") or ""))
        total += 8  # rough per-message overhead
    return total


def estimate_chat_output_tokens(text: str | None) -> int:
    return estimate_text_tokens(text)


def estimate_cost_usd(
    *,
    input_tokens: int,
    output_tokens: int,
    input_cost_per_1m: float,
    output_cost_per_1m: float,
) -> float:
    input_cost = (input_tokens / 1_000_000) * input_cost_per_1m
    output_cost = (output_tokens / 1_000_000) * output_cost_per_1m
    return round(input_cost + output_cost, 8)