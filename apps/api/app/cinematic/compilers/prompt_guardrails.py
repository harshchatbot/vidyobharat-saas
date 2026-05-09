from __future__ import annotations

import re


def dedupe_and_cap_rules(rules: list[str], *, max_items: int) -> tuple[list[str], int]:
    seen: set[str] = set()
    deduped: list[str] = []
    removed = 0
    for rule in rules:
        normalized = _normalize_rule(rule)
        if not normalized:
            continue
        if normalized in seen:
            removed += 1
            continue
        seen.add(normalized)
        deduped.append(rule.strip())
    if len(deduped) > max_items:
        removed += len(deduped) - max_items
    return deduped[:max_items], removed


def consolidate_lower_face_rule(rules: list[str]) -> tuple[list[str], int]:
    lowered = [rule.strip() for rule in rules if rule and rule.strip()]
    lower_face_hits = 0
    kept: list[str] = []
    for rule in lowered:
        if _is_lower_face_rule(rule):
            lower_face_hits += 1
            continue
        kept.append(rule)
    if lower_face_hits > 0:
        kept.append('keep mouth and chin area unobstructed during speech')
    removed = max(0, lower_face_hits - 1)
    return kept, removed


def profile_prompt(prompt: str, *, rule_count: int, dedupe_count: int) -> dict[str, int]:
    return {
        'prompt_length_chars': len(prompt),
        'rule_count': int(rule_count),
        'dedupe_count': int(max(0, dedupe_count)),
    }


def _normalize_rule(rule: str) -> str:
    return re.sub(r'\s+', ' ', (rule or '').strip().lower())


def _is_lower_face_rule(rule: str) -> bool:
    normalized = _normalize_rule(rule)
    return any(token in normalized for token in ('mouth', 'lips', 'lip', 'chin', 'lower-face', 'lower face'))

