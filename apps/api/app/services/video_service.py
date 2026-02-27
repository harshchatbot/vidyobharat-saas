import json
import logging
from pathlib import Path
from uuid import uuid4

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
        self.music_upload_dir = Path('data/music_uploads')
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.music_upload_dir.mkdir(parents=True, exist_ok=True)

    def list_videos(self, user_id: str) -> list[Video]:
        return self.repo.list_by_user(user_id)

    def get_video(self, video_id: str, user_id: str) -> Video | None:
        video = self.repo.get_by_id(video_id)
        if not video or video.user_id != user_id:
            return None
        return video

    async def create_video(
        self,
        user_id: str,
        script: str,
        voice: str,
        images: list[UploadFile],
        title: str | None = None,
        music_mode: str = 'none',
        music_track_id: str | None = None,
        music_volume: int = 20,
        duck_music: bool = True,
        music_file: UploadFile | None = None,
    ) -> Video:
        normalized_mode = music_mode.strip().lower()
        if normalized_mode not in {'none', 'library', 'upload'}:
            raise ValueError('music_mode must be one of none|library|upload')
        if normalized_mode == 'library' and not music_track_id:
            raise ValueError('music_track_id is required when music_mode=library')
        if normalized_mode == 'upload' and not music_file:
            raise ValueError('music_file is required when music_mode=upload')

        image_urls: list[str] = []
        for image in images:
            ext = Path(image.filename or '').suffix or '.jpg'
            safe_name = f'{uuid4()}{ext.lower()}'
            target = self.upload_dir / safe_name
            data = await image.read()
            target.write_bytes(data)
            image_urls.append(f'/static/uploads/{safe_name}')

        music_file_url: str | None = None
        if normalized_mode == 'upload' and music_file is not None:
            ext = Path(music_file.filename or '').suffix.lower() or '.mp3'
            safe_name = f'{uuid4()}{ext}'
            target = self.music_upload_dir / safe_name
            data = await music_file.read()
            target.write_bytes(data)
            music_file_url = f'/static/music_uploads/{safe_name}'

        video = self.repo.create(
            user_id=user_id,
            title=title or None,
            script=script,
            voice=voice,
            status=VideoStatus.processing,
            progress=5,
            image_urls=json.dumps(image_urls),
            music_mode=normalized_mode,
            music_track_id=music_track_id,
            music_file_url=music_file_url,
            music_volume=max(0, min(100, int(music_volume))),
            duck_music=duck_music,
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
        repo.set_progress(video_id, 15, VideoStatus.processing)
        video = repo.get_by_id(video_id)
        if not video:
            return

        image_urls: list[str] = []
        try:
            image_urls = json.loads(video.image_urls or '[]')
        except json.JSONDecodeError:
            image_urls = []

        repo.set_progress(video_id, 45, VideoStatus.processing)
        pipeline.render_video_from_assets(
            video_id=video_id,
            title=video.title,
            script=video.script,
            voice_name=video.voice,
            image_urls=image_urls,
            music_mode=video.music_mode,
            music_track_id=video.music_track_id,
            music_file_url=video.music_file_url,
            music_volume=video.music_volume,
            duck_music=video.duck_music,
        )
        repo.set_progress(video_id, 85, VideoStatus.processing)

        output_url = f'/static/renders/{video_id}.mp4'
        thumb_url = f'/static/renders/{video_id}.jpg'
        repo.complete(video_id, output_url=output_url, thumbnail_url=thumb_url)
        logger.info('video_job_completed', extra={'render_id': video_id})
    except Exception as exc:
        repo.fail(video_id, str(exc))
        logger.exception('video_job_failed', extra={'render_id': video_id})
    finally:
        db.close()
