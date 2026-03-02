from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, coerce_enum, model_from_fields, utcnow
from app.models.entities import RenderJob, RenderStatus
from app.providers.firebase import get_firestore_client


class RenderRepository:
    def __init__(self, db: Session | None) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('renders')

    def create(self, **kwargs) -> RenderJob:
        render_id = kwargs.get('id') or self.collection.document().id
        kwargs['id'] = render_id
        kwargs.setdefault('created_at', utcnow())
        kwargs.setdefault('updated_at', utcnow())
        self.collection.document(render_id).set(self._serialize(kwargs))
        return self._to_model(kwargs)

    def get_by_id(self, render_id: str) -> RenderJob | None:
        snapshot = self.collection.document(render_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('id', snapshot.id)
        return self._to_model(data)

    def set_progress(self, render_id: str, progress: int, status: RenderStatus) -> RenderJob | None:
        render = self.get_by_id(render_id)
        if not render:
            return None
        return self.update(render, progress=progress, status=status, updated_at=utcnow())

    def complete(self, render_id: str, video_url: str, thumbnail_url: str) -> RenderJob | None:
        render = self.get_by_id(render_id)
        if not render:
            return None
        return self.update(
            render,
            progress=100,
            status=RenderStatus.completed,
            video_url=video_url,
            thumbnail_url=thumbnail_url,
            error_message=None,
            updated_at=utcnow(),
        )

    def fail(self, render_id: str, message: str) -> RenderJob | None:
        render = self.get_by_id(render_id)
        if not render:
            return None
        return self.update(
            render,
            status=RenderStatus.failed,
            error_message=message[:255],
            updated_at=utcnow(),
        )

    def latest_by_project(self, project_id: str) -> list[RenderJob]:
        rows = self.collection.where('project_id', '==', project_id).order_by('created_at', direction='DESCENDING').stream()
        return [self._to_model({**(row.to_dict() or {}), 'id': row.id}) for row in rows]

    def update(self, render: RenderJob, **kwargs) -> RenderJob:
        self.collection.document(render.id).set(self._serialize(kwargs), merge=True)
        data = {**render.__dict__, **kwargs}
        data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def _serialize(self, fields: dict) -> dict:
        payload = dict(fields)
        if 'status' in payload and hasattr(payload['status'], 'value'):
            payload['status'] = payload['status'].value
        return payload

    def _to_model(self, data: dict) -> RenderJob:
        return model_from_fields(
            RenderJob,
            id=data.get('id'),
            project_id=data.get('project_id'),
            user_id=data.get('user_id'),
            status=coerce_enum(RenderStatus, data.get('status') or RenderStatus.pending.value),
            progress=int(data.get('progress') or 0),
            video_url=data.get('video_url'),
            thumbnail_url=data.get('thumbnail_url'),
            error_message=data.get('error_message'),
            created_at=coerce_datetime(data.get('created_at')),
            updated_at=coerce_datetime(data.get('updated_at')),
        )
