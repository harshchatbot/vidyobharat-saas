from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, coerce_enum, model_from_fields, utcnow
from app.models.entities import Video, VideoStatus
from app.providers.firebase import get_firestore_client


class VideoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('videos')

    def create(self, **kwargs) -> Video:
        video_id = kwargs.get('id') or self.collection.document().id
        kwargs['id'] = video_id
        kwargs.setdefault('created_at', utcnow())
        kwargs.setdefault('updated_at', utcnow())
        self.collection.document(video_id).set(self._serialize(kwargs))
        return self._to_model(kwargs)

    def get_by_id(self, video_id: str) -> Video | None:
        snapshot = self.collection.document(video_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('id', snapshot.id)
        return self._to_model(data)

    def list_by_user(self, user_id: str) -> list[Video]:
        items: list[Video] = []
        for row in self.collection.stream():
            data = row.to_dict() or {}
            if data.get('user_id') != user_id:
                continue
            data.setdefault('id', row.id)
            items.append(self._to_model(data))
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items

    def update(self, video: Video, **kwargs) -> Video:
        kwargs['updated_at'] = utcnow()
        self.collection.document(video.id).set(self._serialize(kwargs), merge=True)
        data = {**video.__dict__, **kwargs}
        data.pop('_sa_instance_state', None)
        return self._to_model(data)

    def set_progress(self, video_id: str, progress: int, status: VideoStatus) -> Video | None:
        video = self.get_by_id(video_id)
        if not video:
            return None
        return self.update(video, progress=progress, status=status)

    def complete(self, video_id: str, output_url: str, thumbnail_url: str) -> Video | None:
        video = self.get_by_id(video_id)
        if not video:
            return None
        return self.update(
            video,
            progress=100,
            status=VideoStatus.completed,
            output_url=output_url,
            thumbnail_url=thumbnail_url,
            error_message=None,
        )

    def fail(self, video_id: str, message: str) -> Video | None:
        video = self.get_by_id(video_id)
        if not video:
            return None
        return self.update(video, status=VideoStatus.failed, error_message=message[:255])

    def _serialize(self, fields: dict) -> dict:
        payload = dict(fields)
        if 'status' in payload and hasattr(payload['status'], 'value'):
            payload['status'] = payload['status'].value
        return payload

    def _to_model(self, data: dict) -> Video:
        return model_from_fields(
            Video,
            id=data.get('id'),
            user_id=data.get('user_id'),
            title=data.get('title'),
            template=data.get('template'),
            language=data.get('language'),
            script=data.get('script') or '',
            voice=data.get('voice') or 'Shubh',
            aspect_ratio=data.get('aspect_ratio') or '9:16',
            resolution=data.get('resolution') or '1080p',
            duration_mode=data.get('duration_mode') or 'auto',
            duration_seconds=data.get('duration_seconds'),
            captions_enabled=bool(data.get('captions_enabled', True)),
            caption_style=data.get('caption_style'),
            audio_sample_rate_hz=int(data.get('audio_sample_rate_hz') or 22050),
            status=coerce_enum(VideoStatus, data.get('status') or VideoStatus.draft.value),
            progress=int(data.get('progress') or 0),
            image_urls=data.get('image_urls') or '[]',
            selected_model=data.get('selected_model'),
            provider_name=data.get('provider_name'),
            source_image_url=data.get('source_image_url'),
            reference_images=data.get('reference_images') or '[]',
            music_mode=data.get('music_mode') or 'none',
            music_track_id=data.get('music_track_id'),
            music_file_url=data.get('music_file_url'),
            music_volume=int(data.get('music_volume') or 20),
            duck_music=bool(data.get('duck_music', True)),
            thumbnail_url=data.get('thumbnail_url'),
            output_url=data.get('output_url'),
            error_message=data.get('error_message'),
            created_at=coerce_datetime(data.get('created_at')),
            updated_at=coerce_datetime(data.get('updated_at')),
        )
