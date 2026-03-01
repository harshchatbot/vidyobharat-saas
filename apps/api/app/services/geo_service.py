from __future__ import annotations

import ipaddress
import time
from typing import Any

import httpx

from app.core.config import get_settings

_CACHE_TTL_SECONDS = 3600
_country_cache: dict[str, tuple[float, str]] = {}


def _normalize_ip(raw_ip: str | None) -> str | None:
    if not raw_ip:
        return None
    candidate = raw_ip.split(',')[0].strip()
    if candidate.startswith('::ffff:'):
        candidate = candidate[7:]
    return candidate or None


def resolve_country_code(ip_address: str | None) -> str:
    settings = get_settings()
    normalized = _normalize_ip(ip_address)
    if not normalized:
        return settings.pricing_default_country

    try:
        ip_obj = ipaddress.ip_address(normalized)
    except ValueError:
        return settings.pricing_default_country

    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved:
        return settings.pricing_default_country

    cached = _country_cache.get(normalized)
    now = time.time()
    if cached and cached[0] > now:
        return cached[1]

    try:
        response = httpx.get(
            f'{settings.geoip_api_base.rstrip("/")}/{normalized}/json/',
            timeout=4.0,
        )
        if response.status_code < 400:
            payload: dict[str, Any] = response.json()
            country = str(payload.get('country_code') or payload.get('country') or '').upper()
            if len(country) == 2:
                _country_cache[normalized] = (now + _CACHE_TTL_SECONDS, country)
                return country
    except Exception:
        pass

    return settings.pricing_default_country
