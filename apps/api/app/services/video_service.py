import json
import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.db.repositories.video_repository import VideoRepository
from app.models.entities import Video, VideoStatus
from app.services.render_service import celery_app
from app.services.video_pipeline import VideoPipelineService

logger = logging.getLogger(__name__)


class VideoService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = VideoRepository(db)
        self.upload_dir = Path('data/uploads')
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def list_videos(self, user_id: str) -> list[Video]:
        return self.repo.list_by_user(user_id)

    def get_video(self, video_id: str, user_id: str) -> Video | None:
        video = self.repo.get_by_id(video_id)
        if not video or video.user_id != user_id:
            return None
        return video

    async def create_video(self, user_id: str, script: str, voice: str, images: list[UploadFile], title: str | None = None) -> Video:
        image_urls: list[str] = []
        for image in images:
            ext = Path(image.filename or '').suffix or '.jpg'
            file_name = f'{user_id}-{Path(image.filename or "image").stem}-{len(image_urls)}{ext}'
            safe_name = file_name.replace(' ', '-').replace('/', '-')
            target = self.upload_dir / safe_name
            data = await image.read()
            target.write_bytes(data)
            image_urls.append(f'/static/uploads/{safe_name}')

        video = self.repo.create(
            user_id=user_id,
            title=title or None,
            script=script,
            voice=voice,
            status=VideoStatus.processing,
            progress=5,
            image_urls=json.dumps(image_urls),
        )

        process_video.delay(video.id)
        logger.info('video_job_enqueued', extra={'render_id': video.id})
        return video

    def retry_video(self, video_id: str, user_id: str) -> Video | None:
        video = self.get_video(video_id, user_id)
        if not video:
            return None
        self.repo.update(video, status=VideoStatus.processing, progress=0, error_message=None)
        process_video.delay(video.id)
        logger.info('video_job_retried', extra={'render_id': video.id})
        return video


@celery_app.task(name='process_video')
def process_video(video_id: str) -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    repo = VideoRepository(db)
    pipeline = VideoPipelineService()

    try:
        repo.set_progress(video_id, 20, VideoStatus.processing)
        video = repo.get_by_id(video_id)
        if not video:
            return

        repo.set_progress(video_id, 60, VideoStatus.processing)
        pipeline.build_video(render_id=video_id, script=video.script, include_broll=False)
        output_url = f'/static/renders/{video_id}.mp4'
        thumb_url = f'/static/renders/{video_id}.jpg'
        repo.complete(video_id, output_url=output_url, thumbnail_url=thumb_url)
        logger.info('video_job_completed', extra={'render_id': video_id})
    except Exception as exc:
        repo.fail(video_id, str(exc))
        logger.exception('video_job_failed', extra={'render_id': video_id})
    finally:
        db.close()
