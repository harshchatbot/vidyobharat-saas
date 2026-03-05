from __future__ import annotations

from app.db.firestore_utils import utcnow
from app.providers.firebase import get_firestore_client


class InspirationLikeRepository:
    def __init__(self) -> None:
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('inspiration_likes')

    def _doc_id(self, *, asset_type: str, asset_id: str, user_id: str) -> str:
        return f'{asset_type}:{asset_id}:{user_id}'

    def has_liked(self, *, asset_type: str, asset_id: str, user_id: str) -> bool:
        snapshot = self.collection.document(self._doc_id(asset_type=asset_type, asset_id=asset_id, user_id=user_id)).get()
        return snapshot.exists

    def set_like(self, *, asset_type: str, asset_id: str, user_id: str, liked: bool) -> bool:
        ref = self.collection.document(self._doc_id(asset_type=asset_type, asset_id=asset_id, user_id=user_id))
        if liked:
            ref.set(
                {
                    'asset_type': asset_type,
                    'asset_id': asset_id,
                    'user_id': user_id,
                    'created_at': utcnow(),
                },
                merge=True,
            )
            return True
        if ref.get().exists:
            ref.delete()
        return False

    def count_likes(self, *, asset_type: str, asset_id: str) -> int:
        count = 0
        prefix = f'{asset_type}:{asset_id}:'
        for row in self.collection.stream():
            if row.id.startswith(prefix):
                count += 1
        return count
