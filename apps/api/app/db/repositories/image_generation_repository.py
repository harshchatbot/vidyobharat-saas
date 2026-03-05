from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, coerce_enum, model_from_fields, utcnow
from app.models.entities import ImageGeneration, ImageGenerationStatus
from app.providers.firebase import get_firestore_client


class ImageGenerationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('image_generations')

    def create(self, **kwargs) -> ImageGeneration:
        if not kwargs.get('id'):
            kwargs['id'] = self.collection.document().id
        kwargs.setdefault('created_at', utcnow())
        kwargs.setdefault('is_public_inspiration', False)
        kwargs.setdefault('moderation_status', 'draft')
        kwargs.setdefault('inspiration_score', 0)
        kwargs.setdefault('inspiration_published_at', None)
        kwargs.setdefault('like_count', 0)
        self.collection.document(kwargs['id']).set(self._serialize(kwargs))
        return self._to_model(kwargs)

    def get_by_id(self, generation_id: str) -> ImageGeneration | None:
        snapshot = self.collection.document(generation_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('id', snapshot.id)
        return self._to_model(data)

    def list_by_user(self, user_id: str) -> list[ImageGeneration]:
        items: list[ImageGeneration] = []
        for row in self.collection.stream():
            data = row.to_dict() or {}
            if data.get('user_id') != user_id:
                continue
            data.setdefault('id', row.id)
            try:
                items.append(self._to_model(data))
            except Exception:
                continue
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items

    def list_inspiration_candidates(self, limit: int = 300) -> list[ImageGeneration]:
        items: list[ImageGeneration] = []
        for row in self.collection.stream():
            data = row.to_dict() or {}
            if not bool(data.get('is_public_inspiration')):
                continue
            if str(data.get('moderation_status') or '').lower() != 'approved':
                continue
            data.setdefault('id', row.id)
            try:
                items.append(self._to_model(data))
            except Exception:
                continue
        items.sort(
            key=lambda item: (
                int(getattr(item, 'inspiration_score', 0) or 0),
                int(getattr(item, 'like_count', 0) or 0),
                item.created_at,
            ),
            reverse=True,
        )
        return items[:max(1, min(limit, 1000))]

    def update(self, generation: ImageGeneration, **kwargs) -> ImageGeneration:
        self.collection.document(generation.id).set(self._serialize(kwargs), merge=True)
        data = {**generation.__dict__, **kwargs}
        data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def _serialize(self, fields: dict) -> dict:
        return {
            **fields,
            'status': fields['status'].value if hasattr(fields.get('status'), 'value') else fields.get('status'),
        }

    def _to_model(self, data: dict) -> ImageGeneration:
        return model_from_fields(
            ImageGeneration,
            id=data.get('id'),
            user_id=data.get('user_id'),
            parent_image_id=data.get('parent_image_id'),
            model_key=data.get('model_key'),
            prompt=data.get('prompt'),
            aspect_ratio=data.get('aspect_ratio') or '9:16',
            resolution=data.get('resolution') or '1024',
            reference_urls=data.get('reference_urls') or '[]',
            image_url=data.get('image_url'),
            thumbnail_url=data.get('thumbnail_url'),
            action_type=data.get('action_type'),
            status=coerce_enum(ImageGenerationStatus, data.get('status') or ImageGenerationStatus.completed.value),
            is_public_inspiration=bool(data.get('is_public_inspiration', False)),
            moderation_status=str(data.get('moderation_status') or 'draft'),
            inspiration_score=int(data.get('inspiration_score') or 0),
            inspiration_published_at=coerce_datetime(data.get('inspiration_published_at')) if data.get('inspiration_published_at') else None,
            like_count=int(data.get('like_count') or 0),
            created_at=coerce_datetime(data.get('created_at')),
        )
