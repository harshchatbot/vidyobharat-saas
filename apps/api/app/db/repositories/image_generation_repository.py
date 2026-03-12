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
        if data.get('deleted_at') or data.get('deletedAt'):
            return None
        return self._to_model(data)

    def list_by_user(self, user_id: str, limit: int | None = None) -> list[ImageGeneration]:
        items: list[ImageGeneration] = []
        by_id: dict[str, ImageGeneration] = {}
        bounded_limit = max(1, min(limit or 800, 800))
        try:
            root_query = self.collection.where('user_id', '==', user_id).limit(bounded_limit)
            for row in root_query.stream():
                data = row.to_dict() or {}
                data.setdefault('id', row.id)
                if data.get('deleted_at') or data.get('deletedAt'):
                    continue
                try:
                    model = self._to_model(data)
                    by_id[model.id] = model
                except Exception:
                    continue

            group_query = self.firestore.collection_group('images').where('userId', '==', user_id).limit(bounded_limit)
            for row in group_query.stream():
                data = row.to_dict() or {}
                data.setdefault('id', data.get('id') or row.id)
                if data.get('deleted_at') or data.get('deletedAt'):
                    continue
                try:
                    model = self._to_model(data)
                    by_id[model.id] = model
                except Exception:
                    continue
            items = list(by_id.values())
        except Exception:
            for data in self._stream_image_docs():
                owner_id = data.get('user_id') or data.get('userId')
                if owner_id != user_id:
                    continue
                if data.get('deleted_at') or data.get('deletedAt'):
                    continue
                try:
                    items.append(self._to_model(data))
                except Exception:
                    continue
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items[:bounded_limit]

    def list_by_project(self, project_id: str, limit: int | None = None) -> list[ImageGeneration]:
        items: list[ImageGeneration] = []
        bounded_limit = max(1, min(limit or 100, 100))
        for data in self._stream_image_docs():
            current_project_id = data.get('project_id') or data.get('projectId')
            if current_project_id != project_id:
                continue
            if data.get('deleted_at') or data.get('deletedAt'):
                continue
            try:
                items.append(self._to_model(data))
            except Exception:
                continue
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items[:bounded_limit]

    def list_inspiration_candidates(self, limit: int = 300) -> list[ImageGeneration]:
        items: list[ImageGeneration] = []
        by_id: dict[str, ImageGeneration] = {}
        bounded_limit = max(1, min(limit, 1000))
        try:
            root_query = (
                self.collection
                .where('is_public_inspiration', '==', True)
                .where('moderation_status', '==', 'approved')
                .limit(bounded_limit)
            )
            for row in root_query.stream():
                data = row.to_dict() or {}
                data.setdefault('id', row.id)
                if data.get('deleted_at') or data.get('deletedAt'):
                    continue
                try:
                    model = self._to_model(data)
                    by_id[model.id] = model
                except Exception:
                    continue

            group_query = (
                self.firestore.collection_group('images')
                .where('isPublicInspiration', '==', True)
                .where('moderationStatus', '==', 'approved')
                .limit(bounded_limit)
            )
            for row in group_query.stream():
                data = row.to_dict() or {}
                data.setdefault('id', data.get('id') or row.id)
                if data.get('deleted_at') or data.get('deletedAt'):
                    continue
                try:
                    model = self._to_model(data)
                    by_id[model.id] = model
                except Exception:
                    continue
            items = list(by_id.values())
        except Exception:
            for data in self._stream_image_docs():
                is_public = data.get('is_public_inspiration')
                if is_public is None:
                    is_public = data.get('isPublicInspiration')
                moderation_status = data.get('moderation_status')
                if moderation_status is None:
                    moderation_status = data.get('moderationStatus')
                if data.get('deleted_at') or data.get('deletedAt'):
                    continue
                if not bool(is_public):
                    continue
                if str(moderation_status or '').lower() != 'approved':
                    continue
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
        return items[:bounded_limit]

    def _stream_image_docs(self) -> list[dict]:
        merged_by_id: dict[str, dict] = {}

        for row in self.collection.stream():
            data = row.to_dict() or {}
            data.setdefault('id', row.id)
            merged_by_id[data['id']] = data

        try:
            for row in self.firestore.collection_group('images').stream():
                data = row.to_dict() or {}
                doc_id = str(data.get('id') or row.id)
                existing = merged_by_id.get(doc_id) or {}
                merged_by_id[doc_id] = {**existing, **data, 'id': doc_id}
        except Exception:
            pass

        return list(merged_by_id.values())

    def update(self, generation: ImageGeneration, **kwargs) -> ImageGeneration:
        self.collection.document(generation.id).set(self._serialize(kwargs), merge=True)
        data = {**generation.__dict__, **kwargs}
        data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def soft_delete(self, generation_id: str, *, user_id: str) -> ImageGeneration | None:
        generation = self.get_by_id(generation_id)
        if not generation or generation.user_id != user_id:
            return None
        return self.update(
            generation,
            deleted_at=utcnow(),
            deleted_by=user_id,
            is_public_inspiration=False,
            inspiration_published_at=None,
        )

    def _serialize(self, fields: dict) -> dict:
        return {
            **fields,
            'status': fields['status'].value if hasattr(fields.get('status'), 'value') else fields.get('status'),
        }

    def _to_model(self, data: dict) -> ImageGeneration:
        model = model_from_fields(
            ImageGeneration,
            id=data.get('id'),
            user_id=data.get('user_id', data.get('userId')),
            parent_image_id=data.get('parent_image_id', data.get('parentImageId')),
            model_key=data.get('model_key', data.get('modelKey')),
            prompt=data.get('prompt'),
            aspect_ratio=data.get('aspect_ratio', data.get('aspectRatio')) or '9:16',
            resolution=data.get('resolution') or '1024',
            reference_urls=data.get('reference_urls', data.get('referenceUrls')) or '[]',
            image_url=data.get('image_url', data.get('imageUrl')),
            thumbnail_url=data.get('thumbnail_url', data.get('thumbnailUrl')),
            action_type=data.get('action_type', data.get('actionType')),
            status=coerce_enum(ImageGenerationStatus, data.get('status') or ImageGenerationStatus.completed.value),
            is_public_inspiration=bool(data.get('is_public_inspiration', data.get('isPublicInspiration', False))),
            moderation_status=str(data.get('moderation_status', data.get('moderationStatus')) or 'draft'),
            inspiration_score=int(data.get('inspiration_score', data.get('inspirationScore')) or 0),
            inspiration_published_at=coerce_datetime(data.get('inspiration_published_at', data.get('inspirationPublishedAt'))) if (data.get('inspiration_published_at') or data.get('inspirationPublishedAt')) else None,
            like_count=int(data.get('like_count', data.get('likeCount')) or 0),
            created_at=coerce_datetime(data.get('created_at', data.get('createdAt'))),
        )
        setattr(model, 'project_id', data.get('project_id', data.get('projectId')))
        setattr(model, 'mode_id', data.get('mode_id', data.get('modeId')))
        setattr(model, 'template_id', data.get('template_id', data.get('templateId')))
        return model
