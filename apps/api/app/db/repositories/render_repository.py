from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import RenderJob, RenderStatus


class RenderRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, **kwargs) -> RenderJob:
        render = RenderJob(**kwargs)
        self.db.add(render)
        self.db.commit()
        self.db.refresh(render)
        return render

    def get_by_id(self, render_id: str) -> RenderJob | None:
        return self.db.get(RenderJob, render_id)

    def set_progress(self, render_id: str, progress: int, status: RenderStatus) -> RenderJob | None:
        render = self.get_by_id(render_id)
        if not render:
            return None
        render.progress = progress
        render.status = status
        self.db.add(render)
        self.db.commit()
        self.db.refresh(render)
        return render

    def complete(self, render_id: str, video_url: str, thumbnail_url: str) -> RenderJob | None:
        render = self.get_by_id(render_id)
        if not render:
            return None
        render.progress = 100
        render.status = RenderStatus.completed
        render.video_url = video_url
        render.thumbnail_url = thumbnail_url
        self.db.add(render)
        self.db.commit()
        self.db.refresh(render)
        return render

    def fail(self, render_id: str, message: str) -> RenderJob | None:
        render = self.get_by_id(render_id)
        if not render:
            return None
        render.status = RenderStatus.failed
        render.error_message = message[:255]
        self.db.add(render)
        self.db.commit()
        self.db.refresh(render)
        return render

    def latest_by_project(self, project_id: str) -> list[RenderJob]:
        stmt = select(RenderJob).where(RenderJob.project_id == project_id).order_by(RenderJob.created_at.desc())
        return list(self.db.scalars(stmt).all())
