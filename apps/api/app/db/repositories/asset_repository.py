from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, model_from_fields, utcnow
from app.models.entities import Asset
from app.providers.firebase import get_firestore_client


class AssetRepository:
    def __init__(self, db: Session | None) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('assets')

    def create(self, **kwargs) -> Asset:
        asset_id = kwargs.get('id') or self.collection.document().id
        kwargs['id'] = asset_id
        kwargs.setdefault('created_at', utcnow())
        self.collection.document(asset_id).set(kwargs)
        return self._to_model(kwargs)

    def get(self, asset_id: str) -> Asset | None:
        snapshot = self.collection.document(asset_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('id', snapshot.id)
        return self._to_model(data)

    def delete(self, asset: Asset) -> None:
        self.collection.document(asset.id).delete()

    def _to_model(self, data: dict) -> Asset:
        return model_from_fields(
            Asset,
            id=data.get('id'),
            user_id=data.get('user_id'),
            project_id=data.get('project_id'),
            kind=data.get('kind') or '',
            path=data.get('path') or '',
            public_url=data.get('public_url') or '',
            created_at=coerce_datetime(data.get('created_at')),
        )
