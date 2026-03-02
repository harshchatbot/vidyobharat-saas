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
            created_at=coerce_datetime(data.get('created_at')),
        )
