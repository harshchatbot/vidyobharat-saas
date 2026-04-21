from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from firebase_admin import firestore, storage
from app.core.config import get_settings
from app.providers.firebase import get_firebase_app

from app.services.avatar_service import AvatarService
from app.services.fal_video_service import FalVideoService
from app.services.recipe_audio_service import RecipeAudioService



logger = logging.getLogger(__name__)


class AvatarPreviewService:
    def __init__(self) -> None:
        self.audio_service = RecipeAudioService()
        self.fal_service = FalVideoService()
        self.settings = get_settings()
        app = get_firebase_app()
        self.db = firestore.client(app=app)
        self.bucket = storage.bucket(app=app)
        self.fal_api_key = self.settings.fal_api_key or ""

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

        avatar = avatar_snap.to_dict() or {}
        _, candidate_reference_images = self._resolve_reference_images(avatar)
        if not candidate_reference_images:
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
                speech_rate=self.settings.avatar_tts_speech_rate,
            )
            if not narration_path or not narration_path.exists():
                raise RuntimeError('Sarvam TTS failed to generate avatar preview audio')

            audio_url = self._upload_file_to_storage(
                local_path=narration_path,
                destination_path=f"avatars/{job['user_id']}/{job['avatar_id']}/preview/{job_id}/audio/{narration_path.name}",
                content_type='audio/wav',
            )
            audio_duration_seconds = max(0.1, float(self.audio_service.pipeline._probe_duration(narration_path)))

            video_url, provider_metadata = self._generate_infinitalk_video_with_retries(
                image_urls=candidate_reference_images,
                audio_url=audio_url,
                prompt=self._build_avatar_prompt(avatar=avatar),
                audio_duration_seconds=audio_duration_seconds,
                avatar_id=str(job['avatar_id']),
                job_id=job_id,
            )

            now = datetime.now(timezone.utc)
            self._update_job(
                job_ref,
                {
                    'status': 'completed',
                    'audio_url': audio_url,
                    'video_url': video_url,
                    'provider_metadata': provider_metadata,
                    'selected_reference_image': provider_metadata.get('selected_reference_image'),
                    'updated_at': now,
                },
            )

            avatar_ref.set(
                {
                    'last_preview_job_id': job_id,
                    'last_preview_video_url': video_url,
                    'last_preview_audio_url': audio_url,
                    'last_preview_provider_metadata': provider_metadata,
                    'preview_video_url': video_url,
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

    def generate_test_avatar_video(
        self,
        *,
        actor_id: str,
        user_id: str,
        script_text: str,
    ) -> dict[str, Any]:
        actor = AvatarService().get_actor_record(actor_id, user_id=user_id)
        if not actor:
            custom_avatar = AvatarService().get_custom_avatar(actor_id, user_id)
            if not custom_avatar:
                raise RuntimeError(f'Actor not found: {actor_id}')
            actor_payload = {
                'name': custom_avatar.name,
                'reference_images': custom_avatar.reference_images,
                'primary_image': custom_avatar.primary_image or custom_avatar.reference_image_url,
                'prompt_template': custom_avatar.prompt_template,
                'negative_prompt': custom_avatar.negative_prompt,
                'recommended_voice': custom_avatar.preferred_voice,
            }
        else:
            actor_payload = {
                'name': actor.name,
                'reference_images': actor.reference_images,
                'primary_image': actor.primary_image,
                'prompt_template': actor.prompt_template,
                'negative_prompt': actor.negative_prompt,
                'recommended_voice': actor.recommended_voice,
            }

        _, candidate_reference_images = self._resolve_reference_images(actor_payload)
        if not candidate_reference_images:
            raise RuntimeError('No reference image available for this actor')

        test_job_id = f'test-{uuid.uuid4()}'
        narration_path = self.audio_service._generate_narration_track_sarvam(
            text=script_text.strip(),
            render_id=test_job_id,
            voice=actor_payload.get('recommended_voice'),
            language='en-IN',
            speech_rate=self.settings.avatar_tts_speech_rate,
        )
        if not narration_path or not narration_path.exists():
            raise RuntimeError('Sarvam TTS failed to generate actor test audio')

        audio_url = self._upload_file_to_storage(
            local_path=narration_path,
            destination_path=f'actors/{actor_id}/tests/{test_job_id}/audio/{narration_path.name}',
            content_type='audio/wav',
        )
        audio_duration_seconds = max(0.1, float(self.audio_service.pipeline._probe_duration(narration_path)))
        video_url, provider_metadata = self._generate_infinitalk_video_with_retries(
            image_urls=candidate_reference_images,
            audio_url=audio_url,
            prompt=self._build_avatar_prompt(avatar=actor_payload),
            audio_duration_seconds=audio_duration_seconds,
            avatar_id=actor_id,
            job_id=test_job_id,
        )
        return {
            'status': 'success',
            'video_url': video_url,
            'actor_id': actor_id,
            'duration': audio_duration_seconds,
            'audio_url': audio_url,
            'selected_reference_image': provider_metadata.get('selected_reference_image'),
            'retry_attempts': int(provider_metadata.get('retry_attempts') or 0),
        }




    


    def _generate_infinitalk_video(
        self,
        *,
        image_url: str,
        audio_url: str,
        prompt: str,
        audio_duration_seconds: float,
        avatar_id: str,
        job_id: str,
    ) -> tuple[str, dict[str, Any]]:
        video_url, provider_metadata = self.fal_service.generate_infinite_talk(
            persona_image_url=image_url,
            audio_url=audio_url,
            prompt=prompt,
            duration_hint_seconds=max(3, int(round(audio_duration_seconds))),
            audio_duration_seconds=audio_duration_seconds,
            resolution='480p',
            metadata={
                'avatar_id': avatar_id,
                'job_id': job_id,
                'preview_mode': True,
                'infinitetalk_resolution': '480p',
                'acceleration': self.settings.avatar_infinitalk_acceleration,
            },
        )
        return video_url, provider_metadata

    def _generate_infinitalk_video_with_retries(
        self,
        *,
        image_urls: list[str],
        audio_url: str,
        prompt: str,
        audio_duration_seconds: float,
        avatar_id: str,
        job_id: str,
    ) -> tuple[str, dict[str, Any]]:
        last_error: Exception | None = None
        for index, image_url in enumerate(image_urls):
            logger.info(
                'avatar_reference_image_selected',
                extra={
                    'avatar_id': avatar_id,
                    'job_id': job_id,
                    'selected_reference_image': image_url,
                    'attempt': index + 1,
                },
            )
            try:
                video_url, provider_metadata = self._generate_infinitalk_video(
                    image_url=image_url,
                    audio_url=audio_url,
                    prompt=prompt,
                    audio_duration_seconds=audio_duration_seconds,
                    avatar_id=avatar_id,
                    job_id=job_id,
                )
                return video_url, {
                    **provider_metadata,
                    'selected_reference_image': image_url,
                    'retry_attempts': index,
                    'candidate_reference_images': image_urls,
                }
            except Exception as exc:
                last_error = exc
                logger.warning(
                    'avatar_generation_retry_scheduled',
                    extra={
                        'avatar_id': avatar_id,
                        'job_id': job_id,
                        'attempt': index + 1,
                        'selected_reference_image': image_url,
                        'error': str(exc),
                    },
                )
        raise RuntimeError(f'InfiniteTalk failed after {len(image_urls)} reference image attempts: {last_error}') from last_error

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
        custom_prompt = str(avatar.get('prompt_template') or '').strip()
        negative_prompt = str(avatar.get('negative_prompt') or '').strip()
        avatar_name = str(avatar.get('name') or '').strip()

        if custom_prompt:
            return f'{custom_prompt}. Avoid: {negative_prompt}.' if negative_prompt else custom_prompt

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

    def _resolve_reference_images(self, avatar: dict[str, Any]) -> tuple[str | None, list[str]]:
        primary_image = str(avatar.get('primary_image') or '').strip()
        reference_images = [
            str(item).strip()
            for item in list(avatar.get('reference_images') or [])
            if str(item).strip()
        ]
        reference_image_url = str(avatar.get('reference_image_url') or '').strip()
        if reference_image_url and reference_image_url not in reference_images:
            reference_images.insert(0, reference_image_url)

        ordered: list[str] = []
        if primary_image:
            ordered.append(primary_image)

        ranked_candidates = sorted(
            [item for item in reference_images if item and item not in ordered],
            key=self._reference_image_rank,
        )
        ordered.extend(ranked_candidates)
        return (ordered[0] if ordered else None, ordered[:3])

    def _reference_image_rank(self, url: str) -> tuple[int, int]:
        normalized = url.lower()
        front_score = 0 if ('front' in normalized or 'primary' in normalized) else 1
        alt_score = 1 if 'alt' in normalized else 0
        return (front_score, alt_score)
