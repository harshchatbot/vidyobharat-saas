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
            items.append(self._to_model(data))
        items.sort(key=lambda item: (item.source, item.tag))
        return items

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
        for asset_type, asset_id in asset_pairs:
            rows.extend(self.list_for_asset(asset_id=asset_id, asset_type=asset_type))
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
