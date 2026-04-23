from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from firebase_admin import firestore, storage
from app.core.config import get_settings
from app.providers.firebase import get_firebase_app

from app.services.audio_analysis_service import AudioAnalysisService
from app.services.avatar_service import AvatarService, build_avatar_master_prompt
from app.services.emotion_service import build_behavior_timeline
from app.services.fal_video_service import FalVideoService
from app.services.recipe_audio_service import RecipeAudioService
from app.services.timing_sync_service import TimingSyncService



logger = logging.getLogger(__name__)


class AvatarPreviewService:
    def __init__(self) -> None:
        self.audio_service = RecipeAudioService()
        self.fal_service = FalVideoService()
        self.timing_service = TimingSyncService()
        self.audio_analysis = AudioAnalysisService()
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
            'voice_profile': None,
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
        voice_profile = dict(avatar.get('voice_profile') or {})

        self._update_job(
            job_ref,
            {
                'status': 'processing',
                'updated_at': datetime.now(timezone.utc),
            },
        )

        try:
            narration_path, timing_map = self._generate_timed_avatar_audio(
                script_text=job['script'],
                render_id=job_id,
                voice=job.get('voice'),
                voice_profile=voice_profile,
                language=job.get('language'),
            )
            behavior_timeline = build_behavior_timeline(timing_map)
            if not narration_path or not narration_path.exists():
                raise RuntimeError('Sarvam TTS failed to generate avatar preview audio')
            audio_reactive_timeline = self.audio_analysis.analyze_audio_reactivity(
                audio_path=narration_path,
                timing_map=timing_map,
            )
            behavior_timeline = self.audio_analysis.merge_with_behavior(behavior_timeline, audio_reactive_timeline)

            audio_url = self._upload_file_to_storage(
                local_path=narration_path,
                destination_path=f"avatars/{job['user_id']}/{job['avatar_id']}/preview/{job_id}/audio/{narration_path.name}",
                content_type='audio/wav',
            )
            audio_duration_seconds = max(0.1, float(self.audio_service.pipeline._probe_duration(narration_path)))

            video_url, provider_metadata = self._generate_infinitalk_video_with_retries(
                image_urls=candidate_reference_images,
                audio_url=audio_url,
                prompt=self._build_avatar_prompt(avatar=avatar, behavior_timeline=behavior_timeline),
                audio_duration_seconds=audio_duration_seconds,
                avatar_id=str(job['avatar_id']),
                job_id=job_id,
                behavior_timeline=behavior_timeline,
            )

            now = datetime.now(timezone.utc)
            self._update_job(
                job_ref,
                {
                    'status': 'completed',
                    'audio_url': audio_url,
                    'video_url': video_url,
                    'provider_metadata': provider_metadata,
                    'timing_map': timing_map,
                    'audio_reactive_timeline': audio_reactive_timeline,
                    'behavior_timeline': behavior_timeline,
                    'voice_profile': voice_profile,
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
                    'last_preview_audio_reactive_timeline': audio_reactive_timeline,
                    'last_preview_behavior_timeline': behavior_timeline,
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
                    'timing_segment_count': len(timing_map or []),
                    'audio_reactive_segment_count': len(audio_reactive_timeline or []),
                    'behavior_segment_count': len(behavior_timeline or []),
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
                'voice_profile': custom_avatar.voice_profile,
            }
        else:
            actor_payload = {
                'name': actor.name,
                'reference_images': actor.reference_images,
                'primary_image': actor.primary_image,
                'prompt_template': actor.prompt_template,
                'negative_prompt': actor.negative_prompt,
                'recommended_voice': actor.recommended_voice,
                'voice_profile': actor.voice_profile,
            }

        _, candidate_reference_images = self._resolve_reference_images(actor_payload)
        if not candidate_reference_images:
            raise RuntimeError('No reference image available for this actor')

        test_job_id = f'test-{uuid.uuid4()}'
        narration_path, timing_map = self._generate_timed_avatar_audio(
            script_text=script_text.strip(),
            render_id=test_job_id,
            voice=actor_payload.get('recommended_voice'),
            voice_profile=actor_payload.get('voice_profile'),
            language='en-IN',
        )
        behavior_timeline = build_behavior_timeline(timing_map)
        if not narration_path or not narration_path.exists():
            raise RuntimeError('Sarvam TTS failed to generate actor test audio')
        audio_reactive_timeline = self.audio_analysis.analyze_audio_reactivity(
            audio_path=narration_path,
            timing_map=timing_map,
        )
        behavior_timeline = self.audio_analysis.merge_with_behavior(behavior_timeline, audio_reactive_timeline)

        audio_url = self._upload_file_to_storage(
            local_path=narration_path,
            destination_path=f'actors/{actor_id}/tests/{test_job_id}/audio/{narration_path.name}',
            content_type='audio/wav',
        )
        audio_duration_seconds = max(0.1, float(self.audio_service.pipeline._probe_duration(narration_path)))
        video_url, provider_metadata = self._generate_infinitalk_video_with_retries(
            image_urls=candidate_reference_images,
            audio_url=audio_url,
            prompt=self._build_avatar_prompt(avatar=actor_payload, behavior_timeline=behavior_timeline),
            audio_duration_seconds=audio_duration_seconds,
            avatar_id=actor_id,
            job_id=test_job_id,
            behavior_timeline=behavior_timeline,
        )
        return {
            'status': 'success',
            'video_url': video_url,
            'actor_id': actor_id,
            'duration': audio_duration_seconds,
            'audio_url': audio_url,
            'selected_reference_image': provider_metadata.get('selected_reference_image'),
            'retry_attempts': int(provider_metadata.get('retry_attempts') or 0),
            'voice_profile': actor_payload.get('voice_profile') or {},
            'timing_map': timing_map,
            'audio_reactive_timeline': audio_reactive_timeline,
            'behavior_timeline': behavior_timeline,
        }

    def _generate_timed_avatar_audio(
        self,
        *,
        script_text: str,
        render_id: str,
        voice: str | None,
        voice_profile: dict[str, Any] | None,
        language: str | None,
    ) -> tuple[Path | None, list[dict[str, Any]] | None]:
        cleaned_script = str(script_text or "").strip()
        if not cleaned_script:
            return None, None

        try:
            lines = self.timing_service.split_script(cleaned_script)
            if len(lines) <= 1:
                narration_path = self.audio_service._generate_narration_track(
                    text=cleaned_script,
                    render_id=render_id,
                    voice=voice,
                    voice_profile=voice_profile,
                    language=language,
                )
                if not narration_path:
                    return None, None
                duration_ms = int(max(1.0, self.audio_service.pipeline._probe_duration(narration_path) * 1000))
                return narration_path, [{"text": cleaned_script, "start_ms": 0, "end_ms": duration_ms, "duration_ms": duration_ms}]

            segment_counter = {"value": 0}

            def _tts_func(line: str) -> Path | None:
                segment_counter["value"] += 1
                return self.audio_service._generate_narration_track(
                    text=line,
                    render_id=f"{render_id}-seg-{segment_counter['value']}",
                    voice=voice,
                    voice_profile=voice_profile,
                    language=language,
                )

            segments = self.timing_service.generate_audio_segments(lines, _tts_func)
            timing_map = self.timing_service.build_timing_map(segments)
            merged_path = self.timing_service.merge_audio(
                segments,
                Path("data/renders") / f"{render_id}-timed.wav",
            )
            logger.info(
                'avatar_timing_sync_completed',
                extra={
                    'render_id': render_id,
                    'segment_count': len(segments),
                    'total_duration_ms': timing_map[-1]['end_ms'] if timing_map else 0,
                },
            )
            return merged_path, timing_map
        except Exception as exc:
            logger.warning(
                'avatar_timing_sync_failed',
                extra={'render_id': render_id, 'error': str(exc)},
            )
            narration_path = self.audio_service._generate_narration_track(
                text=cleaned_script,
                render_id=render_id,
                voice=voice,
                voice_profile=voice_profile,
                language=language,
            )
            return narration_path, None




    


    def _generate_infinitalk_video(
        self,
        *,
        image_url: str,
        audio_url: str,
        prompt: str,
        audio_duration_seconds: float,
        avatar_id: str,
        job_id: str,
        behavior_timeline: list[dict[str, Any]] | None = None,
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
                'behavior_timeline': behavior_timeline or [],
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
        behavior_timeline: list[dict[str, Any]] | None = None,
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
                    behavior_timeline=behavior_timeline,
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

    def _build_avatar_prompt(self, *, avatar: dict[str, Any], behavior_timeline: list[dict[str, Any]] | None = None) -> str:
        avatar_name = str(avatar.get('name') or '').strip()
        behavior_line = self._behavior_prompt_line(behavior_timeline)
        context_bits = [f'Creator name: {avatar_name}.' if avatar_name else None, behavior_line]
        context_line = " ".join(bit for bit in context_bits if bit).strip() or None
        return build_avatar_master_prompt(
            gender=avatar.get('gender'),
            custom_prompt=avatar.get('prompt_template'),
            negative_prompt=avatar.get('negative_prompt'),
            context_line=context_line,
        )

    def _behavior_prompt_line(self, behavior_timeline: list[dict[str, Any]] | None) -> str | None:
        if not behavior_timeline:
            return None
        first = behavior_timeline[0]
        emotion = str(first.get('smoothed_emotion') or first.get('emotion') or 'neutral')
        motion = str(first.get('smoothed_head_motion') or first.get('head_motion') or 'micro_tilt')
        if emotion == 'excited':
            expression = 'smiling slightly with energetic expression and bright eyes.'
        elif emotion == 'serious':
            expression = 'focused expression with a slightly serious face and strong eye focus.'
        elif emotion == 'confident':
            expression = 'confident natural smile with persuasive warmth.'
        elif emotion == 'transition_excited':
            expression = 'a natural transition from neutral warmth to a slight bright smile.'
        elif emotion == 'transition_serious':
            expression = 'a natural transition into a more focused and slightly serious look.'
        elif emotion == 'transition_confident':
            expression = 'a natural transition into a calm confident smile.'
        else:
            expression = 'calm neutral expression with subtle warmth.'

        motion_line = {
            'slight_nod': 'Use a subtle slight nod while speaking.',
            'micro_tilt': 'Use a restrained micro head tilt while speaking.',
            'slow_shift': 'Use a very slow natural head shift while speaking.',
        }.get(motion, 'Keep head movement subtle and natural.')
        intensity = str(((first.get('audio_intensity') or {}).get('intensity')) or 'medium')
        intensity_line = {
            'high': 'Let the speaking feel a bit more expressive with slightly wider mouth movement.',
            'low': 'Keep the speaking motion softer and more subtle.',
            'medium': 'Keep the speaking motion balanced and conversational.',
        }.get(intensity, 'Keep the speaking motion balanced and conversational.')
        return f'Behavior cue: {expression} {motion_line} {intensity_line}'

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
