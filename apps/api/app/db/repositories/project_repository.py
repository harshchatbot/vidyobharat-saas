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
        kwargs.setdefault('updated_at', kwargs['created_at'])
        kwargs.setdefault('last_activity_at', kwargs['created_at'])
        kwargs.setdefault('image_count', 0)
        kwargs.setdefault('video_count', 0)
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
        kwargs.setdefault('updated_at', utcnow())
        self.collection.document(project.id).set(kwargs, merge=True)
        data = {**project.__dict__, **kwargs}
        data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def touch_generation(
        self,
        project_id: str,
        *,
        medium: str,
        prompt: str | None = None,
        thumbnail_url: str | None = None,
        template: str | None = None,
        language: str | None = None,
        voice: str | None = None,
    ) -> Project | None:
        snapshot = self.collection.document(project_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        now = utcnow()
        image_count = int(data.get('image_count') or 0)
        video_count = int(data.get('video_count') or 0)
        if medium == 'image':
            image_count += 1
        elif medium == 'video':
            video_count += 1
        update_payload = {
            'updated_at': now,
            'last_activity_at': now,
            'image_count': image_count,
            'video_count': video_count,
        }
        if prompt:
            update_payload['last_prompt_snippet'] = prompt[:240]
        if thumbnail_url:
            update_payload['last_output_thumbnail_url'] = thumbnail_url
        if template:
            update_payload['template'] = template
        if language:
            update_payload['language'] = language
        if voice:
            update_payload['voice'] = voice
        self.collection.document(project_id).set(update_payload, merge=True)
        data.update(update_payload)
        data.setdefault('id', project_id)
        return self._to_model(data)

    def adjust_generation_counts(
        self,
        project_id: str,
        *,
        medium: str,
        delta: int,
        prompt: str | None = None,
        thumbnail_url: str | None = None,
        template: str | None = None,
        language: str | None = None,
        voice: str | None = None,
        update_latest: bool = False,
    ) -> Project | None:
        snapshot = self.collection.document(project_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        now = utcnow()
        image_count = int(data.get('image_count') or 0)
        video_count = int(data.get('video_count') or 0)
        if medium == 'image':
            image_count = max(0, image_count + delta)
        elif medium == 'video':
            video_count = max(0, video_count + delta)
        update_payload = {
            'updated_at': now,
            'last_activity_at': now,
            'image_count': image_count,
            'video_count': video_count,
        }
        if update_latest:
            if prompt:
                update_payload['last_prompt_snippet'] = prompt[:240]
            if thumbnail_url:
                update_payload['last_output_thumbnail_url'] = thumbnail_url
            if template:
                update_payload['template'] = template
            if language:
                update_payload['language'] = language
            if voice:
                update_payload['voice'] = voice
        self.collection.document(project_id).set(update_payload, merge=True)
        data.update(update_payload)
        data.setdefault('id', project_id)
        return self._to_model(data)

    def reassign_generation(
        self,
        *,
        previous_project_id: str | None,
        next_project_id: str,
        medium: str,
        prompt: str | None = None,
        thumbnail_url: str | None = None,
        template: str | None = None,
        language: str | None = None,
        voice: str | None = None,
    ) -> Project | None:
        if previous_project_id and previous_project_id != next_project_id:
            self.adjust_generation_counts(
                previous_project_id,
                medium=medium,
                delta=-1,
                update_latest=False,
            )
        return self.adjust_generation_counts(
            next_project_id,
            medium=medium,
            delta=1,
            prompt=prompt,
            thumbnail_url=thumbnail_url,
            template=template,
            language=language,
            voice=voice,
            update_latest=True,
        )

    def _to_model(self, data: dict) -> Project:
        project = model_from_fields(
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
        setattr(project, 'updated_at', coerce_datetime(data.get('updated_at')) if data.get('updated_at') else None)
        setattr(project, 'last_activity_at', coerce_datetime(data.get('last_activity_at')) if data.get('last_activity_at') else None)
        setattr(project, 'image_count', int(data.get('image_count') or 0))
        setattr(project, 'video_count', int(data.get('video_count') or 0))
        setattr(project, 'last_output_thumbnail_url', data.get('last_output_thumbnail_url'))
        setattr(project, 'last_prompt_snippet', data.get('last_prompt_snippet'))
        return project
