from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, TypeVar

T = TypeVar('T')


def utcnow() -> datetime:
    return datetime.now(UTC)


def coerce_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            pass
    return utcnow()


def coerce_enum(enum_cls: type[Enum], value: Any) -> Any:
    if isinstance(value, enum_cls):
        return value
    if value is None:
        return None
    return enum_cls(value)


def model_from_fields(cls: type[T], **fields: Any) -> T:
    obj = cls()
    for key, value in fields.items():
        setattr(obj, key, value)
    return obj
