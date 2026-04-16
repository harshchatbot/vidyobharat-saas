from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import fal_client
import httpx
from firebase_admin import firestore, storage
from app.providers.firebase import get_firebase_app

from app.services.recipe_audio_service import RecipeAudioService



logger = logging.getLogger(__name__)


class AvatarPreviewService:
    def __init__(self) -> None:
        self.audio_service = RecipeAudioService()
        app = get_firebase_app()
        self.db = firestore.client(app=app)
        self.bucket = storage.bucket(app=app)
        self.fal_api_key = "26c9cb85-e2ab-4c44-8ad7-c597d62eb7f6:93dd0cb8a07e0564d8a7bf7c579346df"

    def create_preview_job(
        self,
        *,
        avatar_id: str,
        user_id: str,
        script: str,
        voice: str | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        doc = {
            'job_id': job_id,
            'avatar_id': avatar_id,
            'user_id': user_id,
            'script': script,
            'voice': (voice or 'shubh').strip().lower() or 'shubh',
            'language': language or 'en-IN',
            'status': 'queued',
            'audio_url': None,
            'video_url': None,
            'provider': 'fal-ai/infinitalk',
            'error_message': None,
            'created_at': now,
            'updated_at': now,
        }

        self.db.collection('avatar_preview_jobs').document(job_id).set(doc)

        logger.info(
            'avatar_preview_job_created',
            extra={
                'job_id': job_id,
                'avatar_id': avatar_id,
                'user_id': user_id,
            },
        )

        return doc

    def get_preview_job(self, job_id: str) -> dict[str, Any] | None:
        snap = self.db.collection('avatar_preview_jobs').document(job_id).get()
        if not snap.exists:
            return None
        return snap.to_dict()

    def process_preview_job(self, *, job_id: str) -> dict[str, Any]:
        job_ref = self.db.collection('avatar_preview_jobs').document(job_id)
        job_snap = job_ref.get()
        if not job_snap.exists:
            raise RuntimeError(f'Avatar preview job not found: {job_id}')

        job = job_snap.to_dict()

        avatar_ref = self.db.collection('avatars').document(job['avatar_id'])
        avatar_snap = avatar_ref.get()
        if not avatar_snap.exists:
            raise RuntimeError(f"Avatar not found: {job['avatar_id']}")

        avatar = avatar_snap.to_dict()
        reference_image_url = str(avatar.get('reference_image_url') or '').strip()
        if not reference_image_url:
            raise RuntimeError('Avatar reference image URL is missing')

        self._update_job(
            job_ref,
            {
                'status': 'processing',
                'updated_at': datetime.now(timezone.utc),
            },
        )

        try:
            narration_path = self.audio_service._generate_narration_track_sarvam(
                text=job['script'],
                render_id=job_id,
                voice=job.get('voice'),
                language=job.get('language'),
            )
            if not narration_path or not narration_path.exists():
                raise RuntimeError('Sarvam TTS failed to generate avatar preview audio')

            audio_url = self._upload_file_to_storage(
                local_path=narration_path,
                destination_path=f"avatars/{job['user_id']}/{job['avatar_id']}/preview/{job_id}/audio/{narration_path.name}",
                content_type='audio/wav',
            )

            video_url = self._generate_infinitalk_video(
                image_url=reference_image_url,
                audio_url=audio_url,
                prompt=self._build_avatar_prompt(avatar=avatar),
            )

            now = datetime.now(timezone.utc)
            self._update_job(
                job_ref,
                {
                    'status': 'completed',
                    'audio_url': audio_url,
                    'video_url': video_url,
                    'updated_at': now,
                },
            )

            avatar_ref.set(
                {
                    'last_preview_job_id': job_id,
                    'last_preview_video_url': video_url,
                    'last_preview_audio_url': audio_url,
                    'updated_at': now,
                },
                merge=True,
            )

            logger.info(
                'avatar_preview_completed',
                extra={
                    'job_id': job_id,
                    'avatar_id': job['avatar_id'],
                    'user_id': job['user_id'],
                    'video_url': video_url,
                },
            )

            return job_ref.get().to_dict()

        except Exception as exc:
            logger.exception(
                'avatar_preview_failed',
                extra={
                    'job_id': job_id,
                    'avatar_id': job['avatar_id'],
                    'user_id': job['user_id'],
                    'error': str(exc),
                },
            )

            self._update_job(
                job_ref,
                {
                    'status': 'failed',
                    'error_message': str(exc),
                    'updated_at': datetime.now(timezone.utc),
                },
            )
            raise




    


    def _generate_infinitalk_video(
        self,
        *,
        image_url: str,
        audio_url: str,
        prompt: str,
    ) -> str:
        #fal_key = "26c9cb85-e2ab-4c44-8ad7-c597d62eb7f6:93dd0cb8a07e0564d8a7bf7c579346df".strip()
        fal_key = (os.getenv("FAL_KEY") or os.getenv("FAL_API_KEY") or "").strip()
        os.environ["FAL_KEY"] = fal_key
        if not fal_key:
            raise RuntimeError('FAL_KEY is missing')

        fal_client.api_key = fal_key

        def on_queue_update(update):
            try:
                if isinstance(update, fal_client.InProgress):
                    for log in update.logs:
                        logger.info(
                            'infinitalk_progress',
                            extra={'message': log.get('message', '')},
                        )
            except Exception:
                pass

        result = fal_client.subscribe(
            "fal-ai/infinitalk",
            arguments={
                "image_url": image_url,
                "audio_url": audio_url,
                "prompt": prompt,
            },
            with_logs=True,
            on_queue_update=on_queue_update,
        )

        video = result.get("video") or {}
        video_url = video.get("url")
        if not video_url:
            raise RuntimeError(f'InfiniteTalk returned no video url: {result}')

        return video_url


    def _poll_infinitalk_result(self, *, request_id: str) -> str:
        headers = {
            'Authorization': f'Key {self.fal_api_key}',
            'Content-Type': 'application/json',
        }

        status_url = f'https://queue.fal.run/fal-ai/infinitalk/requests/{request_id}/status'
        result_url = f'https://queue.fal.run/fal-ai/infinitalk/requests/{request_id}'

        timeout = httpx.Timeout(connect=20.0, read=120.0, write=60.0, pool=60.0)

        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            for _ in range(120):
                status_response = client.get(status_url, headers=headers)
                status_response.raise_for_status()
                status_data = status_response.json()

                status = str(status_data.get('status') or '').upper()
                if status == 'COMPLETED':
                    result_response = client.get(result_url, headers=headers)
                    result_response.raise_for_status()
                    result_data = result_response.json()

                    video_url = (
                        result_data.get('video_url')
                        or (result_data.get('video') or {}).get('url')
                        or ((result_data.get('output') or {}).get('video') or {}).get('url')
                    )
                    if video_url:
                        return video_url

                    raise RuntimeError(f'InfiniteTalk completed but no video URL found: {result_data}')

                if status in {'FAILED', 'ERROR', 'CANCELLED'}:
                    raise RuntimeError(f'InfiniteTalk request failed: {status_data}')

                import time
                time.sleep(5)

        raise RuntimeError('InfiniteTalk polling timed out')

    def _upload_file_to_storage(
        self,
        *,
        local_path: Path,
        destination_path: str,
        content_type: str,
    ) -> str:
        blob = self.bucket.blob(destination_path)
        blob.upload_from_filename(str(local_path), content_type=content_type)
        blob.make_public()
        return blob.public_url

    def _build_avatar_prompt(self, *, avatar: dict[str, Any]) -> str:
        avatar_name = str(avatar.get('name') or '').strip()

        if avatar_name:
            return (
                f'{avatar_name} speaking directly to camera, '
                'realistic talking head, natural lip sync, subtle head movement, '
                'stable identity, clean UGC style, natural blinking, professional look.'
            )

        return (
            'A realistic person speaking directly to camera, '
            'natural lip sync, subtle head movement, stable identity, '
            'clean UGC style, natural blinking, professional look.'
        )

    def _update_job(self, job_ref: Any, fields: dict[str, Any]) -> None:
        job_ref.set(fields, merge=True)