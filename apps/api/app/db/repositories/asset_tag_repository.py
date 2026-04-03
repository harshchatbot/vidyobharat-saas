from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.firestore_utils import model_from_fields
from app.models.entities import AssetTag
from app.providers.firebase import get_firestore_client


class AssetTagRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('asset_tags')

    def add_tags(self, asset_id: str, asset_type: str, tags: list[str], source: str) -> list[AssetTag]:
        created: list[AssetTag] = []
        for raw_tag in tags:
            tag = raw_tag.strip().lower()
            if not tag:
                continue
            doc_id = f'{asset_type}:{asset_id}:{tag}'
            doc_ref = self.collection.document(doc_id)
            if doc_ref.get().exists:
                continue
            payload = {
                'id': self._new_int_id(),
                'asset_id': asset_id,
                'asset_type': asset_type,
                'tag': tag,
                'source': source,
                'created_at': datetime.now(UTC).isoformat(),
            }
            doc_ref.set(payload)
            created.append(self._to_model(payload))
        return created

    def list_for_asset(self, asset_id: str, asset_type: str) -> list[AssetTag]:
        items: list[AssetTag] = []
        for doc in self.collection.stream():
            data = doc.to_dict() or {}
            if data.get('asset_id') != asset_id or data.get('asset_type') != asset_type:
                continue
            try:
                items.append(self._to_model(data))
            except Exception:
                continue
        items.sort(key=lambda item: (item.source, item.tag))
        return items

    def list_for_assets(self, asset_pairs: list[tuple[str, str]]) -> dict[tuple[str, str], list[AssetTag]]:
        if not asset_pairs:
            return {}
        targets = {(asset_type, asset_id) for asset_type, asset_id in asset_pairs if asset_type and asset_id}
        if not targets:
            return {}
        grouped: dict[tuple[str, str], list[AssetTag]] = {key: [] for key in targets}
        asset_types = {asset_type for asset_type, _ in targets}
        for asset_type in asset_types:
            try:
                rows = self.collection.where('asset_type', '==', asset_type).stream()
            except Exception:
                rows = self.collection.stream()
            for doc in rows:
                data = doc.to_dict() or {}
                key = (str(data.get('asset_type') or ''), str(data.get('asset_id') or ''))
                if key not in targets:
                    continue
                try:
                    grouped.setdefault(key, []).append(self._to_model(data))
                except Exception:
                    continue
        for items in grouped.values():
            items.sort(key=lambda item: (item.source, item.tag))
        return grouped

    def replace_user_tags(self, asset_id: str, asset_type: str, tags: list[str]) -> list[AssetTag]:
        for doc in self.collection.stream():
            data = doc.to_dict() or {}
            if data.get('asset_id') != asset_id or data.get('asset_type') != asset_type or data.get('source') != 'user':
                continue
            doc.reference.delete()
        self.add_tags(asset_id=asset_id, asset_type=asset_type, tags=tags, source='user')
        return self.list_for_asset(asset_id=asset_id, asset_type=asset_type)

    def facet_counts_for_assets(self, asset_pairs: list[tuple[str, str]]) -> list[tuple[str, int]]:
        if not asset_pairs:
            return []
        rows: list[AssetTag] = []
        grouped = self.list_for_assets(asset_pairs)
        for items in grouped.values():
            rows.extend(items)
        counts = Counter(item.tag for item in rows)
        return sorted(counts.items(), key=lambda item: (-item[1], item[0]))

    def _to_model(self, data: dict) -> AssetTag:
        return model_from_fields(
            AssetTag,
            id=int(data.get('id') or self._new_int_id()),
            asset_id=data.get('asset_id'),
            asset_type=data.get('asset_type'),
            tag=data.get('tag'),
            source=data.get('source') or 'auto',
        )

    def _new_int_id(self) -> int:
        return int(datetime.now(UTC).timestamp() * 1_000_000)
