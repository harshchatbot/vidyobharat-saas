from __future__ import annotations

from dataclasses import dataclass

from app.services.avatar_service import resolve_avatar_storage_url


@dataclass(frozen=True)
class GoldenAvatarReferencePack:
    avatar_id: str
    references: list[str]


_GOLDEN_PACKS: dict[str, GoldenAvatarReferencePack] = {
    "chitrakala": GoldenAvatarReferencePack(
        avatar_id="chitrakala",
        references=[
            "gs://rangmanch-ai-backend.firebasestorage.app/avatars/chitrakala/avatar_chitrakala_front1.jpg",
            "gs://rangmanch-ai-backend.firebasestorage.app/avatars/chitrakala/avatar_chitrakala_desk5.png",
        ],
    ),
    "charulata": GoldenAvatarReferencePack(
        avatar_id="charulata",
        references=[
            "gs://rangmanch-ai-backend.firebasestorage.app/avatars/charulata/avtaar_charulata.jpeg",
        ],
    ),
}


def resolve_golden_avatar_references(*, avatar_id: str | None, avatar_name: str | None = None, limit: int = 3) -> list[str]:
    key = (str(avatar_id or "").strip().lower() or str(avatar_name or "").strip().lower())
    if not key:
        return []
    pack = _GOLDEN_PACKS.get(key)
    if not pack:
        return []
    resolved = [resolve_avatar_storage_url(url) for url in pack.references if str(url).strip()]
    deduped = list(dict.fromkeys([url for url in resolved if url]))
    return deduped[: max(1, limit)]

