from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AudioLibraryEntry(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=80)
    type: Literal['music', 'sfx']
    duration_seconds: float = Field(gt=0, le=3600)
    content_type: str = Field(pattern=r'^audio/[a-z0-9.+-]+$')
    tags: list[str] = Field(default_factory=list, max_length=20)
    license: str = Field(min_length=1, max_length=120)
    attribution: str | None = Field(default=None, max_length=500)
    source: str = Field(min_length=1, max_length=500)
    evidence_reference: str = Field(min_length=1, max_length=500)
    playback_url: str = Field(min_length=1, max_length=2000)


# Intentionally empty until assets with verified redistribution rights are configured.
CATALOG: tuple[AudioLibraryEntry, ...] = ()


def list_audio_library(*, category: str | None = None, query: str | None = None) -> list[AudioLibraryEntry]:
    normalized_query = query.casefold().strip() if query else None
    return [
        entry for entry in CATALOG
        if (category is None or entry.type == category)
        and (normalized_query is None or normalized_query in ' '.join([entry.title, entry.category, *entry.tags]).casefold())
    ]
