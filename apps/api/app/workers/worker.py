from app.services.render_service import celery_app
from app.services import video_service  # noqa: F401
from app.workers import avatar_tasks  # noqa: F401
from app.workers import storyboard_tasks  # noqa: F401

__all__ = ('celery_app',)
