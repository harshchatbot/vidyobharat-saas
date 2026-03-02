import logging

from celery import Celery
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.project_repository import ProjectRepository
from app.db.repositories.render_repository import RenderRepository
from app.models.entities import RenderStatus
from app.schemas.render import CreateRenderRequest

logger = logging.getLogger(__name__)
settings = get_settings()
celery_app = Celery('vidyobharat', broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_always_eager = settings.celery_task_always_eager


class RenderService:
    def __init__(self, db: Session) -> None:
        self.render_repo = RenderRepository(db)
        self.project_repo = ProjectRepository(db)

    def create_render(self, payload: CreateRenderRequest):
        project = self.project_repo.get_by_id(payload.project_id)
        if not project:
            raise ValueError('Project not found')
        if project.user_id != payload.user_id:
            raise PermissionError('Project does not belong to this user')

        render = self.render_repo.create(
            project_id=payload.project_id,
            user_id=payload.user_id,
            status=RenderStatus.pending,
            progress=0,
        )

        process_render.delay(render.id, payload.include_broll)
        logger.info('render_job_enqueued', extra={'render_id': render.id})
        return render

    def get_render(self, render_id: str):
        return self.render_repo.get_by_id(render_id)


@celery_app.task(name='process_render')
def process_render(render_id: str, include_broll: bool) -> None:
    from app.db.session import SessionLocal
    from app.services.video_pipeline import VideoPipelineService

    db = SessionLocal()
    repo = RenderRepository(db)
    project_repo = ProjectRepository(db)
    pipeline = VideoPipelineService()
    try:
        repo.set_progress(render_id, 10, RenderStatus.rendering)
        render = repo.get_by_id(render_id)
        if not render:
            return

        project = project_repo.get_by_id(render.project_id)
        repo.set_progress(render_id, 55, RenderStatus.rendering)

        video_path, thumb_path = pipeline.build_video(
            render_id=render_id,
            script=project.script if project else '',
            include_broll=include_broll,
        )

        video_url = f'/static/renders/{render_id}.mp4'
        thumb_url = f'/static/renders/{render_id}.jpg'
        repo.complete(render_id, video_url, thumb_url)
        logging.getLogger(__name__).info('render_job_completed', extra={'render_id': render_id})
    except Exception as exc:
        repo.fail(render_id, str(exc))
        logging.getLogger(__name__).exception('render_job_failed', extra={'render_id': render_id})
    finally:
        db.close()
