from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, model_from_fields, utcnow
from app.models.entities import Project
from app.providers.firebase import get_firestore_client


class ProjectRepository:
    def __init__(self, db: Session | None) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('projects')

    def create(self, **kwargs) -> Project:
        project_id = kwargs.get('id') or self.collection.document().id
        kwargs['id'] = project_id
        kwargs.setdefault('created_at', utcnow())
        self.collection.document(project_id).set(kwargs)
        return self._to_model(kwargs)

    def list_by_user(self, user_id: str) -> list[Project]:
        items: list[Project] = []
        for row in self.collection.stream():
            data = row.to_dict() or {}
            if data.get('user_id') != user_id:
                continue
            data.setdefault('id', row.id)
            items.append(self._to_model(data))
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items

    def get_by_id(self, project_id: str) -> Project | None:
        snapshot = self.collection.document(project_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('id', snapshot.id)
        return self._to_model(data)

    def update(self, project: Project, **kwargs) -> Project:
        self.collection.document(project.id).set(kwargs, merge=True)
        data = {**project.__dict__, **kwargs}
        data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def _to_model(self, data: dict) -> Project:
        return model_from_fields(
            Project,
            id=data.get('id'),
            user_id=data.get('user_id'),
            title=data.get('title') or '',
            script=data.get('script') or '',
            language=data.get('language') or 'hi-IN',
            voice=data.get('voice') or 'Shubh',
            template=data.get('template') or 'clean-corporate',
            created_at=coerce_datetime(data.get('created_at')),
        )
