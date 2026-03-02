from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Video, VideoStatus


class VideoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, **kwargs) -> Video:
        video = Video(**kwargs)
        self.db.add(video)
        self.db.commit()
        self.db.refresh(video)
        return video

    def get_by_id(self, video_id: str) -> Video | None:
        return self.db.get(Video, video_id)

    def list_by_user(self, user_id: str) -> list[Video]:
        stmt = select(Video).where(Video.user_id == user_id).order_by(Video.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def update(self, video: Video, **kwargs) -> Video:
        for key, value in kwargs.items():
            setattr(video, key, value)
        self.db.add(video)
        self.db.commit()
        self.db.refresh(video)
        return video

    def set_progress(self, video_id: str, progress: int, status: VideoStatus) -> Video | None:
        video = self.get_by_id(video_id)
        if not video:
            return None
        video.progress = progress
        video.status = status
        self.db.add(video)
        self.db.commit()
        self.db.refresh(video)
        return video

    def complete(self, video_id: str, output_url: str, thumbnail_url: str) -> Video | None:
        video = self.get_by_id(video_id)
        if not video:
            return None
        video.progress = 100
        video.status = VideoStatus.completed
        video.output_url = output_url
        video.thumbnail_url = thumbnail_url
        video.error_message = None
        self.db.add(video)
        self.db.commit()
        self.db.refresh(video)
        return video

    def fail(self, video_id: str, message: str) -> Video | None:
        video = self.get_by_id(video_id)
        if not video:
            return None
        video.status = VideoStatus.failed
        video.error_message = message[:255]
        self.db.add(video)
        self.db.commit()
        self.db.refresh(video)
        return video
