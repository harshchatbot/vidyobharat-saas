from __future__ import annotations

import logging
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class FalFollowUpResult:
    status: str
    video_url: str | None = None
    payload: dict[str, Any] | None = None
    lineage: list[str] | None = None
    request_id: str | None = None
    status_url: str | None = None
    reason: str | None = None


class FalVideoService:
    _STATUS_POLL_INTERVAL_SECONDS = 12
    _TERMINAL_STATUS_TIMEOUT_SECONDS = 600
    _MODEL_TERMINAL_STATUS_TIMEOUT_SECONDS = {
        'fal_ltx23_t2v': 1800,
        'fal_ltx23_i2v': 1800,
        'fal_infinite_talk': 1800,
        'fal_kling_reference_to_video': 1800,
        'seedance_v1_lite_t2v': 1800,
        'seedance_v1_lite_i2v': 1800,
        'seedance_v1_lite_reference': 1800,

        # Kling O3 reference models can queue longer than normal short I2V jobs.
        'kling_o3_standard_t2v': 2400,
        'kling_o3_standard_i2v': 2400,
        'kling_o3_standard_reference': 2400,
        'kling_o3_reference': 2400,
        'kling_o3_pro_t2v': 2400,
        'kling_o3_pro_i2v': 2400,
        'kling_o3_pro_reference': 2400,
        'kling_o3_4k_t2v': 3600,
        'kling_o3_4k_i2v': 3600,
        'kling_o3_4k_reference': 3600,

        # Legacy/fallback Elements routes.
        'kling_v16_standard_elements': 1800,
        'kling_v16_pro_elements': 1800,

        'fal_gemini_flash_tts': 900,
        'fal_sync_lipsync_v2': 1800,
        'pixverse_c1_reference': 2400,
        'kling_v26_standard_motion_control': 3600,
    }
    _FOLLOW_UP_REQUEST_TIMEOUT_SECONDS = 180
    _STATUS_REQUEST_TIMEOUT = httpx.Timeout(25.0, connect=10.0)
    _RESPONSE_REQUEST_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
    _SUCCESS_STATES = {'completed', 'succeeded', 'success', 'done'}
    _FAILURE_STATES = {'failed', 'error', 'cancelled', 'canceled'}
    _ACTIVE_STATES = {'in_queue', 'queued', 'pending', 'processing', 'in_progress', 'running'}

    def __init__(self) -> None:
        self.settings = get_settings()
        self._effective_fal_api_key = (
            str(getattr(self.settings, 'fal_api_key', '') or '').strip()
            or str(os.getenv('FAL_KEY') or '').strip()
            or str(os.getenv('FAL_API_KEY') or '').strip()
        )



    def generate_kling_reference_video(
        self,
        *,
        prompt: str,
        image_urls: list[str],
        aspect_ratio: str = '9:16',
        duration: str = '5',
        model_key: str = 'kling_o3_standard_reference',  # ✅ default fixed
    ) -> tuple[str, dict[str, Any]]:

        if not self._effective_fal_api_key:
            raise RuntimeError('FAL_API_KEY is not configured for Kling video generation')

        endpoint = self._endpoint_for(model_key)

        payload: dict[str, Any] = {
            'prompt': prompt,
            'aspect_ratio': aspect_ratio,
            'duration': duration,
        }

        # ---------------------------------------
        # ✅ CORRECT PAYLOAD PER MODEL TYPE
        # ---------------------------------------

        # 🔴 O3 REFERENCE MODELS
        # Best for avatar + product reference consistency.
        if model_key in {
            'kling_o3_standard_reference',
            'kling_o3_pro_reference',
            'kling_o3_4k_reference',
            # Backward compatibility for any old caller still using this key.
            'kling_o3_reference',
        }:
            if not image_urls:
                raise ValueError(f'{model_key} requires at least one reference image')

            # O3 reference-to-video expects multi-reference images here.
            payload['image_urls'] = image_urls

            # We generate voice separately with Gemini/Google TTS and then run Sync LipSync.
            # So keep Kling native audio off if the endpoint supports this flag.
            payload['generate_audio'] = False

        # 🟡 LEGACY ELEMENTS MODELS
        # Keep as fallback/draft only.
        elif model_key in {'kling_v16_standard_elements', 'kling_v16_pro_elements'}:
            if not image_urls:
                raise ValueError('elements models require image inputs')

            # Elements API uses input_image_urls, not image_urls.
            payload['input_image_urls'] = image_urls

        # ⚠️ FALLBACK
        else:
            if image_urls:
                payload['image_url'] = image_urls[-1]

        # ---------------------------------------
        # DEBUG LOG (VERY USEFUL)
        # ---------------------------------------
        logger.info(
            'kling_payload_debug',
            extra={
                'model_key': model_key,
                'endpoint': endpoint,
                'image_count': len(image_urls),
                'payload_keys': list(payload.keys()),
            },
        )

        return self._submit_fal_media_job(
            endpoint=endpoint,
            payload=payload,
            model_key=model_key,
            log_prefix='chitrakala_kling',
            extract_kind='video',
        )



    def generate_seedance_lite_reference_video(
        self,
        *,
        prompt: str,
        reference_image_urls: list[str],
        aspect_ratio: str = '9:16',
        resolution: str = '720p',
        duration: str = '5',
        camera_fixed: bool = False,
        seed: int | None = None,
    ) -> tuple[str, dict[str, Any]]:
        if not self._effective_fal_api_key:
            raise RuntimeError('FAL_API_KEY is not configured for Seedance video generation')

        endpoint = self._endpoint_for('seedance_v1_lite_reference')

        cleaned_urls = [str(url or '').strip() for url in reference_image_urls if str(url or '').strip()]
        if not cleaned_urls:
            raise ValueError('seedance_v1_lite_reference requires at least one reference image')

        payload: dict[str, Any] = {
            'prompt': prompt,
            'reference_image_urls': cleaned_urls[:4],
            'aspect_ratio': aspect_ratio,
            'resolution': resolution,
            'duration': str(duration),
            'camera_fixed': bool(camera_fixed),
        }

        if seed is not None:
            payload['seed'] = int(seed)

        logger.info(
            'seedance_lite_payload_debug',
            extra={
                'endpoint': endpoint,
                'image_count': len(cleaned_urls[:4]),
                'payload_keys': list(payload.keys()),
                'aspect_ratio': aspect_ratio,
                'resolution': resolution,
                'duration': str(duration),
                'camera_fixed': bool(camera_fixed),
            },
        )

        return self._submit_fal_media_job(
            endpoint=endpoint,
            payload=payload,
            model_key='seedance_v1_lite_reference',
            log_prefix='chitrakala_seedance_lite',
            extract_kind='video',
        )

    def generate_kling_motion_control_video(
        self,
        *,
        prompt: str,
        image_url: str,
        video_url: str,
        aspect_ratio: str = '9:16',
        character_orientation: str = 'video',
        keep_original_sound: bool = True,
    ) -> tuple[str, dict[str, Any]]:
        if not self._effective_fal_api_key:
            raise RuntimeError('FAL_API_KEY is not configured for Kling motion control generation')

        endpoint = self._endpoint_for('kling_v26_standard_motion_control')
        payload: dict[str, Any] = {
            'prompt': prompt,
            'image_url': image_url,
            'video_url': video_url,
            'aspect_ratio': aspect_ratio,
            'character_orientation': character_orientation,
            'keep_original_sound': bool(keep_original_sound),
        }
        logger.info(
            'kling_motion_control_payload_debug',
            extra={
                'endpoint': endpoint,
                'aspect_ratio': aspect_ratio,
                'character_orientation': character_orientation,
                'keep_original_sound': bool(keep_original_sound),
                'payload_keys': list(payload.keys()),
            },
        )
        return self._submit_fal_media_job(
            endpoint=endpoint,
            payload=payload,
            model_key='kling_v26_standard_motion_control',
            log_prefix='kling_motion_control',
            extract_kind='video',
        )


    def generate_gemini_flash_tts(
            self,
            *,
            text: str,
            voice: str = 'Kore',
            language_code: str = 'English (India)',
            style_instructions: str | None = None,
        ) -> tuple[str, dict[str, Any]]:
            if not self._effective_fal_api_key:
                raise RuntimeError('FAL_API_KEY is not configured for Gemini TTS generation')

            endpoint = str(getattr(self.settings, 'fal_gemini_tts_endpoint', '') or 'fal-ai/gemini-3.1-flash-tts')
            payload = {
                'prompt': text,
                'style_instructions': style_instructions or 'Warm Indian creator voice, friendly, natural UGC ad delivery',
                'voice': voice,
                'language_code': language_code,
                'temperature': 1,
                'output_format': 'mp3',
            }

            return self._submit_fal_media_job(
                endpoint=endpoint,
                payload=payload,
                model_key='fal_gemini_flash_tts',
                log_prefix='chitrakala_gemini_tts',
                extract_kind='audio',
            )

    def generate_sync_lipsync_v2(
            self,
            *,
            video_url: str,
            audio_url: str,
            model: str = 'lipsync-2',
            sync_mode: str = 'cut_off',
        ) -> tuple[str, dict[str, Any]]:
            if not self._effective_fal_api_key:
                raise RuntimeError('FAL_API_KEY is not configured for Sync Lipsync generation')

            endpoint = str(getattr(self.settings, 'fal_sync_lipsync_v2_endpoint', '') or 'fal-ai/sync-lipsync/v2')
            payload = {
                'model': model,
                'video_url': video_url,
                'audio_url': audio_url,
                'sync_mode': sync_mode,
            }

            return self._submit_fal_media_job(
                endpoint=endpoint,
                payload=payload,
                model_key='fal_sync_lipsync_v2',
                log_prefix='chitrakala_lipsync',
                extract_kind='video',
            )

    def _submit_fal_media_job(
            self,
            *,
            endpoint: str,
            payload: dict[str, Any],
            model_key: str,
            log_prefix: str,
            extract_kind: str,
        ) -> tuple[str, dict[str, Any]]:
            submit_url = f'{self.settings.fal_api_base.rstrip("/")}/{endpoint.strip("/")}'
            headers = {
                'Authorization': f'Key {self._effective_fal_api_key}',
                'Content-Type': 'application/json',
            }

            with httpx.Client(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:
                logger.info(
                    f'{log_prefix}_submit_started',
                    extra={
                        'endpoint': endpoint,
                        'model_key': model_key,
                        'payload_keys': sorted(payload.keys()),
                    },
                )

                submit = client.post(submit_url, headers=headers, json=payload)
                if submit.status_code >= 400:
                    raise RuntimeError(f'fal {model_key} submit failed ({submit.status_code}): {submit.text[:480]}')

                data = submit.json()
                status_url = data.get('status_url') or data.get('response_url') or data.get('url')
                request_id = str(data.get('request_id') or '').strip() or None

                logger.info(
                    f'{log_prefix}_submit_completed',
                    extra={
                        'endpoint': endpoint,
                        'model_key': model_key,
                        'request_id': request_id,
                        'status_url': status_url,
                        'response_url': data.get('response_url'),
                    },
                )

                direct_url = self._extract_audio_url(data) if extract_kind == 'audio' else self._extract_video_url(data)
                if direct_url:
                    return direct_url, {'raw': data, 'mode': 'submit_payload', 'request_id': request_id}

                if not status_url:
                    raise RuntimeError(f'fal {model_key} response did not include status_url/response_url/output url')

                terminal_payload = self._poll_status_until_terminal(
                    client=client,
                    headers=headers,
                    status_url=self._normalize_candidate_url(str(status_url).strip()),
                    requested_model_key=model_key,
                    resolved_endpoint=endpoint,
                )

                media_url = self._extract_audio_url(terminal_payload) if extract_kind == 'audio' else self._extract_video_url(terminal_payload)
                if media_url:
                    return media_url, {'raw': terminal_payload, 'mode': 'async', 'request_id': request_id}

                response_data, _ = self._fetch_completed_response_payload(
                    client=client,
                    headers=headers,
                    model_key=model_key,
                    status_url=self._normalize_candidate_url(str(status_url).strip()),
                    submit_response_url=data.get('response_url') if isinstance(data.get('response_url'), str) else None,
                    completed_payload=terminal_payload,
                    allow_status_response_fallback=True,
                    allow_queue_request_response_endpoint=True,
                    allow_queue_request_direct_get=True,
                )

                if response_data:
                    media_url = self._extract_audio_url(response_data) if extract_kind == 'audio' else self._extract_video_url(response_data)
                    if media_url:
                        return media_url, {'raw': response_data, 'mode': 'async_response_url', 'request_id': request_id}
                    response_state = self._normalize_state(response_data)
                    if response_state in self._ACTIVE_STATES:
                        follow_status_url = (
                            response_data.get('status_url')
                            or response_data.get('response_url')
                            or response_data.get('url')
                        )
                        if isinstance(follow_status_url, str) and follow_status_url.strip():
                            follow_terminal_payload = self._poll_status_until_terminal(
                                client=client,
                                headers=headers,
                                status_url=self._normalize_candidate_url(follow_status_url.strip()),
                                requested_model_key=model_key,
                                resolved_endpoint=endpoint,
                            )
                            follow_media_url = self._extract_audio_url(follow_terminal_payload) if extract_kind == 'audio' else self._extract_video_url(follow_terminal_payload)
                            if follow_media_url:
                                return follow_media_url, {'raw': follow_terminal_payload, 'mode': 'async_followup_status', 'request_id': request_id}
                            follow_state = self._normalize_state(follow_terminal_payload)
                            if follow_state in self._FAILURE_STATES:
                                raise RuntimeError(f'fal {model_key} follow-up request failed: {follow_terminal_payload}')
                            raise RuntimeError(
                                f'fal {model_key} follow-up request ended without {extract_kind} url: {follow_terminal_payload}'
                            )

                raise RuntimeError(f'fal {model_key} completed without {extract_kind} url: {response_data or terminal_payload}')
        


    
    def generate_infinite_talk(
        self,
        *,
        persona_image_url: str,
        audio_url: str,
        prompt: str,
        duration_hint_seconds: int,
        audio_duration_seconds: float | None = None,
        resolution: str | None = None,
        wait_for_completion: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str | None, dict[str, Any]]:

        if not self._effective_fal_api_key:
            raise RuntimeError('FAL_API_KEY is not configured for InfiniteTalk generation')

        endpoint = 'fal-ai/infinitalk'
        submit_url = f'{self.settings.fal_api_base.rstrip("/")}/{endpoint}'

        resolved_resolution = self._normalize_infinitetalk_resolution(
            requested_resolution=resolution,
            metadata=metadata or {},
        )

        chosen_num_frames = self._choose_infinitetalk_num_frames(
            audio_duration_seconds=audio_duration_seconds,
            duration_hint_seconds=duration_hint_seconds,
        )

        acceleration = self._normalize_infinitetalk_acceleration((metadata or {}).get('acceleration'))
        seed = (metadata or {}).get('seed')

        timing_map = (metadata or {}).get('timing_map')
        speaking_segments = (metadata or {}).get('speaking_segments')
        audio_reactive_timeline = (metadata or {}).get('audio_reactive_timeline')

        payload: dict[str, Any] = {
            'image_url': persona_image_url,
            'audio_url': audio_url,
            'prompt': prompt,
            'num_frames': chosen_num_frames,
            'resolution': resolved_resolution,
            'acceleration': acceleration,
        }

        if isinstance(seed, int):
            payload['seed'] = seed

        # 🚀 WEBHOOK ADDED
        configured_base_url = str(getattr(self.settings, 'base_url', '') or '').strip()
        webhook_url = f"{configured_base_url.rstrip('/')}/webhooks/video-complete" if configured_base_url else None

        if webhook_url:
            payload["webhook"] = webhook_url
        payload["metadata"] = {
            "video_id": (metadata or {}).get("video_id"),
            "user_id": (metadata or {}).get("user_id"),
        }

        headers = {
            'Authorization': f'Key {self._effective_fal_api_key}',
            'Content-Type': 'application/json',
        }

        with httpx.Client(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:

            logger.info(
                'fal_infinite_talk_submit_started',
                extra={
                    'endpoint': endpoint,
                    'persona_id': (metadata or {}).get('persona_id'),
                    'audio_duration_seconds': round(float(audio_duration_seconds or 0.0), 3) if audio_duration_seconds else None,
                    'num_frames': chosen_num_frames,
                    'resolution': resolved_resolution,
                    'acceleration': acceleration,
                    'webhook_enabled': bool(webhook_url),
                },
            )

            submit = client.post(submit_url, headers=headers, json=payload)

            if submit.status_code >= 400:
                raise RuntimeError(f'fal InfiniteTalk submit failed ({submit.status_code}): {submit.text[:480]}')

            data = submit.json()
            request_id = str(data.get("request_id") or "").strip()

            logger.info(
                "fal_infinite_talk_submitted_async",
                extra={
                    "request_id": request_id,
                    "webhook": webhook_url,
                },
            )

            base_metadata = {
                "mode": "submitted",
                "request_id": request_id,
                "status": "processing",
                "num_frames": chosen_num_frames,
                "resolution": resolved_resolution,
                "acceleration": acceleration,
                "audio_duration_seconds": round(float(audio_duration_seconds or 0.0), 3) if audio_duration_seconds else None,
                "timing_map": timing_map,
                "speaking_segments": speaking_segments,
                "audio_reactive_timeline": audio_reactive_timeline,
                "infinite_talk_used": True,
                "webhook_enabled": bool(webhook_url),
            }
            if not wait_for_completion:
                return None, base_metadata

            status_url = str(data.get('status_url') or '').strip() or None
            response_url = str(data.get('response_url') or '').strip() or None
            if not status_url:
                status_url = response_url or f'{submit_url}/requests/{request_id}/status'

            terminal_payload = self._poll_status_until_terminal(
                client=client,
                headers=headers,
                status_url=self._normalize_candidate_url(status_url),
                requested_model_key='fal_infinite_talk',
                resolved_endpoint=endpoint,
            )
            direct_video_url = self._extract_video_url(terminal_payload)
            if direct_video_url:
                return direct_video_url, {
                    **base_metadata,
                    'mode': 'completed',
                    'status': self._normalize_state(terminal_payload) or 'completed',
                    'status_url': status_url,
                    'response_url': response_url,
                    'raw': terminal_payload,
                    'video_url': direct_video_url,
                }

            state = self._normalize_state(terminal_payload)
            if state in self._FAILURE_STATES:
                raise RuntimeError(f'fal InfiniteTalk generation failed: {terminal_payload}')
            if state not in self._SUCCESS_STATES:
                raise RuntimeError(f'fal InfiniteTalk generation timed out while waiting for completion: {terminal_payload}')

            response_payload = self._fetch_infinitetalk_result_payload(
                client=client,
                headers=headers,
                submit_url=submit_url,
                request_id=request_id,
                submit_payload=data,
                terminal_payload=terminal_payload,
            )
            video_url = self._extract_video_url(response_payload)
            if not video_url:
                raise RuntimeError(f'fal InfiniteTalk completed without output video url: {response_payload}')

            return video_url, {
                **base_metadata,
                'mode': 'completed',
                'status': self._normalize_state(response_payload) or state or 'completed',
                'status_url': status_url,
                'response_url': response_url,
                'raw': response_payload,
                'video_url': video_url,
            }

    def generate(
        self,
        *,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        image_url: str | None = None,
        video_url: str | None = None,
        character_orientation: str | None = None,
        keep_original_sound: bool | None = None,
        image_references: list[dict[str, Any]] | None = None,
        multi_prompt: list[dict[str, Any]] | None = None,
        shot_type: str | None = None,
        generate_audio: bool | None = None,
        request_context: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        if not self._effective_fal_api_key:
            raise RuntimeError('FAL_API_KEY is not configured for fal video generation')

        resolved_endpoint = self._endpoint_for(model_key)
        endpoint = f'{self.settings.fal_api_base.rstrip("/")}/{resolved_endpoint}'
        payload = self._build_video_payload(
            model_key=model_key,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            image_url=image_url,
            video_url=video_url,
            character_orientation=character_orientation,
            keep_original_sound=keep_original_sound,
            image_references=image_references,
            multi_prompt=multi_prompt,
            generate_audio=generate_audio,
        )

        headers = {
            'Authorization': f'Key {self._effective_fal_api_key}',
            'Content-Type': 'application/json',
        }

        with httpx.Client(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
            logger.info(
                'fal_video_submit_started',
                extra={
                    'requested_model_key': model_key,
                    'resolved_endpoint': resolved_endpoint,
                    'endpoint': endpoint,
                    'aspect_ratio': aspect_ratio,
                    'resolution': resolution,
                    'duration_seconds': duration_seconds,
                    'has_image_seed': bool(image_url),
                    'image_reference_count': len(image_references or []),
                    'has_multi_prompt': bool(multi_prompt),
                    'shot_type': payload.get('shot_type'),
                    'generate_audio': payload.get('generate_audio'),
                    'recipe_id': (request_context or {}).get('recipe_id'),
                    'scene_id': (request_context or {}).get('scene_id'),
                    'scene_index': (request_context or {}).get('scene_index'),
                    'scene_role': (request_context or {}).get('scene_role'),
                },
            )

            submit = client.post(endpoint, headers=headers, json=payload)
            if submit.status_code >= 400:
                raise RuntimeError(f'fal submit failed ({submit.status_code}): {submit.text[:480]}')

            data = submit.json()
            status_url = data.get('status_url')
            response_url = data.get('response_url')
            submit_request_id = str(data.get('request_id') or '').strip() or None

            logger.info(
                'fal_video_submit_succeeded',
                extra={
                    'requested_model_key': model_key,
                    'resolved_endpoint': resolved_endpoint,
                    'request_id': submit_request_id,
                    'submit_keys': sorted([str(k) for k in data.keys()]),
                    'status_url': status_url,
                    'response_url': response_url,
                    'recipe_id': (request_context or {}).get('recipe_id'),
                    'scene_id': (request_context or {}).get('scene_id'),
                    'scene_index': (request_context or {}).get('scene_index'),
                    'scene_role': (request_context or {}).get('scene_role'),
                },
            )

            submit_video_url = self._extract_video_url(data)
            if submit_video_url:
                return submit_video_url, {
                    'raw': data,
                    'mode': 'submit_payload',
                    'request_id': submit_request_id,
                    'status_url': self._normalize_candidate_url(str(status_url).strip()) if isinstance(status_url, str) and status_url.strip() else None,
                }

            if not status_url:
                status_url = response_url or data.get('url')

            if not status_url:
                video_url = self._extract_video_url(data)
                if video_url:
                    return video_url, {'raw': data, 'mode': 'immediate', 'request_id': submit_request_id}
                raise RuntimeError('fal response did not include a polling url or video output')

            normalized_status_url = self._normalize_candidate_url(str(status_url).strip())

            terminal_payload = self._poll_status_until_terminal(
                client=client,
                headers=headers,
                status_url=normalized_status_url,
                requested_model_key=model_key,
                resolved_endpoint=resolved_endpoint,
            )


            direct_video_url = self._extract_video_url(terminal_payload)
            if direct_video_url:
                return direct_video_url, {
                    'raw': terminal_payload,
                    'mode': 'async',
                    'request_id': str(terminal_payload.get('request_id') or submit_request_id or '').strip() or None,
                    'status_url': normalized_status_url,
                }

            state = self._normalize_state(terminal_payload)
            if state in self._FAILURE_STATES:
                raise RuntimeError(f'fal generation failed: {terminal_payload}')
            if state not in self._SUCCESS_STATES:
                raise RuntimeError(f'fal video generation timed out while waiting for completion: {terminal_payload}')

            top_level_follow_up_payload = self._resolve_follow_up_payload(terminal_payload, allow_response_url_descriptor=True)
            top_level_follow_up_request_id = str(top_level_follow_up_payload.get('request_id') or '').strip() or None if top_level_follow_up_payload is not None else None
            terminal_request_id = str(terminal_payload.get('request_id') or '').strip() or submit_request_id
            if (
                top_level_follow_up_payload is not None
                and top_level_follow_up_request_id
                and terminal_request_id
                and top_level_follow_up_request_id != terminal_request_id
            ):
                follow_up_result = self._follow_queued_response_request(
                    client=client,
                    headers=headers,
                    payload=top_level_follow_up_payload,
                    requested_model_key=model_key,
                    resolved_endpoint=resolved_endpoint,
                )
                if follow_up_result.status == 'resolved' and follow_up_result.video_url and follow_up_result.payload is not None:
                    followed_url, followed_payload = follow_up_result.video_url, follow_up_result.payload
                    return followed_url, {
                        'raw': followed_payload,
                        'mode': 'top_level_status_followup',
                        'request_id': follow_up_result.request_id,
                        'status_url': follow_up_result.status_url or normalized_status_url,
                    }
                if follow_up_result.status == 'cycle_detected':
                    raise RuntimeError(
                        f'fal follow-up queue lineage cycled without producing a final video asset: {follow_up_result.payload or terminal_payload}'
                    )
                if follow_up_result.status == 'broken_payload':
                    raise RuntimeError(
                        f'fal follow-up request completed without a final video asset or valid next status_url: {follow_up_result.payload or terminal_payload}'
                    )
                if follow_up_result.status == 'provider_failed':
                    raise RuntimeError(
                        f'fal follow-up request failed: {follow_up_result.payload or terminal_payload}'
                    )
                raise RuntimeError(
                    f'fal follow-up request timed out while waiting for final video asset: {follow_up_result.payload or terminal_payload}'
                )

            response_data, tried_response_urls = self._fetch_completed_response_payload(
                client=client,
                headers=headers,
                model_key=model_key,
                status_url=normalized_status_url,
                submit_response_url=response_url if isinstance(response_url, str) else None,
                completed_payload=terminal_payload,
                allow_status_response_fallback=False,
                allow_queue_request_response_endpoint=False,
                allow_queue_request_direct_get=True,
            )

            if response_data is not None:
                video_url = self._extract_video_url(response_data)
                if video_url:
                    return video_url, {
                        'raw': response_data,
                        'mode': 'async_response_url',
                        'request_id': str(response_data.get('request_id') or terminal_payload.get('request_id') or submit_request_id or '').strip() or None,
                        'status_url': normalized_status_url,
                    }

                logger.warning(
                    'fal_response_url_missing_video response_urls=%s response_keys=%s response_state=%s preview=%s',
                    tried_response_urls,
                    sorted([str(k) for k in response_data.keys()]),
                    self._normalize_state(response_data),
                    str(response_data)[:1000],
                )

            follow_up_source = response_data if response_data is not None else terminal_payload
            follow_up_payload = self._resolve_follow_up_payload(follow_up_source, allow_response_url_descriptor=True)
            if follow_up_payload is not None:
                follow_up_request_id = str(follow_up_payload.get('request_id') or '').strip() or None
                source_request_id = str((follow_up_source or {}).get('request_id') or terminal_payload.get('request_id') or submit_request_id or '').strip() or None
                if response_data is not None and follow_up_request_id and source_request_id and follow_up_request_id == source_request_id:
                    logger.warning(
                        'fal_top_level_cycle_detected request_id=%s status_url=%s state=%s recipe_id=%s scene_id=%s scene_index=%s scene_role=%s',
                        follow_up_request_id,
                        normalized_status_url,
                        self._normalize_state(follow_up_source),
                        (request_context or {}).get('recipe_id'),
                        (request_context or {}).get('scene_id'),
                        (request_context or {}).get('scene_index'),
                        (request_context or {}).get('scene_role'),
                    )
                    raise RuntimeError(
                        f'fal top-level queue lineage cycled without producing a final video asset: {follow_up_source}'
                    )
                follow_up_result = self._follow_queued_response_request(
                    client=client,
                    headers=headers,
                    payload=follow_up_payload,
                    requested_model_key=model_key,
                    resolved_endpoint=resolved_endpoint,
                )
                if follow_up_result.status == 'resolved' and follow_up_result.video_url and follow_up_result.payload is not None:
                    followed_url, followed_payload = follow_up_result.video_url, follow_up_result.payload
                    return followed_url, {
                        'raw': followed_payload,
                        'mode': 'async_response_followup',
                        'request_id': follow_up_result.request_id,
                        'status_url': follow_up_result.status_url or normalized_status_url,
                    }
                if follow_up_result.status == 'cycle_detected':
                    raise RuntimeError(
                        f'fal follow-up queue lineage cycled without producing a final video asset: {follow_up_result.payload or follow_up_source}'
                    )
                if follow_up_result.status == 'broken_payload':
                    raise RuntimeError(
                        f'fal follow-up request completed without a final video asset or valid next status_url: {follow_up_result.payload or follow_up_source}'
                    )
                if follow_up_result.status == 'provider_failed':
                    raise RuntimeError(
                        f'fal follow-up request failed: {follow_up_result.payload or follow_up_source}'
                    )
                raise RuntimeError(
                    f'fal follow-up request timed out while waiting for final video asset: {follow_up_result.payload or follow_up_source}'
                )

            logger.error(
                'fal_completed_missing_video_url requested_model_key=%s resolved_endpoint=%s request_id=%s status_keys=%s tried_response_urls=%s status_preview=%s',
                model_key,
                resolved_endpoint,
                terminal_payload.get('request_id') or data.get('request_id'),
                sorted([str(k) for k in terminal_payload.keys()]),
                tried_response_urls,
                str(terminal_payload)[:1000],
            )
            raise RuntimeError('fal completed without output video url')


    def _normalize_state(self, payload: dict[str, Any]) -> str:
        return str(payload.get('status') or payload.get('state') or '').strip().lower()

    def _classify_lifecycle_state(self, state: str) -> str:
        if state in self._SUCCESS_STATES:
            return 'COMPLETED'
        if state in self._FAILURE_STATES:
            return state.upper()
        if state in {'processing', 'in_progress', 'running'}:
            return 'PROCESSING'
        return 'QUEUED'

    def _poll_status_until_terminal(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        status_url: str,
        requested_model_key: str,
        resolved_endpoint: str,
    ) -> dict[str, Any]:
        started = time.time()
        last_payload: dict[str, Any] | None = None
        last_lifecycle_state: str | None = None
        timeout_seconds = self._terminal_timeout_for_model(requested_model_key)
        transient_poll_failures = 0
        consecutive_transient_poll_failures = 0

        while time.time() - started < timeout_seconds:
            status_response = self._request_with_timeout(
                client=client,
                method='GET',
                url=status_url,
                headers=headers,
                timeout=self._STATUS_REQUEST_TIMEOUT,
                failure_label='fal status poll',
            )
            if status_response is None:
                transient_poll_failures += 1
                consecutive_transient_poll_failures += 1
                logger.warning(
                    'fal_status_poll_retryable_failure',
                    extra={
                        'requested_model_key': requested_model_key,
                        'resolved_endpoint': resolved_endpoint,
                        'status_url': status_url,
                        'request_id': (last_payload or {}).get('request_id'),
                        'elapsed_seconds': round(time.time() - started, 2),
                        'timeout_seconds': timeout_seconds,
                        'transient_poll_failures': transient_poll_failures,
                        'consecutive_transient_poll_failures': consecutive_transient_poll_failures,
                    },
                )
                time.sleep(self._STATUS_POLL_INTERVAL_SECONDS)
                continue
            consecutive_transient_poll_failures = 0
            if status_response.status_code >= 400:
                raise RuntimeError(f'fal status failed ({status_response.status_code}): {status_response.text[:240]}')

            current_payload = status_response.json()
            last_payload = current_payload
            state = self._normalize_state(current_payload)
            lifecycle_state = self._classify_lifecycle_state(state)
            if lifecycle_state != last_lifecycle_state:
                logger.info(
                    'fal_video_status_transition',
                    extra={
                        'requested_model_key': requested_model_key,
                        'resolved_endpoint': resolved_endpoint,
                        'request_id': current_payload.get('request_id'),
                        'status_url': status_url,
                        'lifecycle_state': lifecycle_state,
                        'raw_state': state or None,
                    },
                )
                last_lifecycle_state = lifecycle_state

            if state in self._SUCCESS_STATES or state in self._FAILURE_STATES:
                if state in self._FAILURE_STATES:
                    logger.error(
                        'fal_video_terminal_failure',
                        extra={
                            'requested_model_key': requested_model_key,
                            'resolved_endpoint': resolved_endpoint,
                            'request_id': current_payload.get('request_id'),
                            'raw_state': state or None,
                            'payload_preview': str(current_payload)[:480],
                        },
                    )
                return current_payload

            direct_video_url = self._extract_video_url(current_payload)
            if direct_video_url:
                return current_payload

            time.sleep(self._STATUS_POLL_INTERVAL_SECONDS)

        logger.error(
            'fal_video_status_timeout',
            extra={
                'requested_model_key': requested_model_key,
                'resolved_endpoint': resolved_endpoint,
                'status_url': status_url,
                'request_id': (last_payload or {}).get('request_id'),
                'last_state': self._normalize_state(last_payload or {}),
                'timeout_seconds': timeout_seconds,
                'elapsed_seconds': round(time.time() - started, 2),
                'transient_poll_failures': transient_poll_failures,
                'payload_preview': str(last_payload)[:480],
            },
        )
        raise RuntimeError(f'fal video generation timed out while waiting for completion: {last_payload or {"status_url": status_url}}')

    def _terminal_timeout_for_model(self, requested_model_key: str) -> int:
        normalized = str(requested_model_key or '').strip().lower()
        return int(self._MODEL_TERMINAL_STATUS_TIMEOUT_SECONDS.get(normalized, self._TERMINAL_STATUS_TIMEOUT_SECONDS))

    def _supports_generate_audio(self, requested_model_key: str) -> bool:
        normalized = str(requested_model_key or '').strip().lower()
        return normalized in {
            'fal_ltx23_t2v',
            'fal_ltx23_i2v',
            'kling_o3_standard_t2v',
            'kling_o3_standard_i2v',
            'kling_o3_standard_reference',
            'kling_o3_reference',
            'kling_o3_pro_t2v',
            'kling_o3_pro_i2v',
            'kling_o3_pro_reference',
            'kling_o3_4k_t2v',
            'kling_o3_4k_i2v',
            'kling_o3_4k_reference',
            'pixverse_c1_reference',
        }

    def _build_video_payload(
        self,
        *,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        image_url: str | None,
        video_url: str | None,
        character_orientation: str | None,
        keep_original_sound: bool | None,
        image_references: list[dict[str, Any]] | None,
        multi_prompt: list[dict[str, Any]] | None,
        generate_audio: bool | None,
    ) -> dict[str, Any]:
        normalized = str(model_key or '').strip().lower()
        payload: dict[str, Any] = {'prompt': prompt}

        if multi_prompt:
            payload['multi_prompt'] = multi_prompt

        if normalized == 'kling_v26_standard_motion_control':
            if not image_url:
                raise ValueError('kling_v26_standard_motion_control requires image_url')
            if not video_url:
                raise ValueError('kling_v26_standard_motion_control requires video_url')
            payload.update(
                {
                    'aspect_ratio': aspect_ratio or '9:16',
                    'image_url': image_url,
                    'video_url': video_url,
                    'character_orientation': str(character_orientation or 'video'),
                    'keep_original_sound': bool(True if keep_original_sound is None else keep_original_sound),
                }
            )
            # Motion-control endpoint does not accept our generic duration/resolution knobs.
            return payload

        if normalized in {'fal_ltx23_t2v', 'fal_ltx23_i2v'}:
            width, height = self._dimensions_for(aspect_ratio=aspect_ratio, resolution=resolution)
            payload.update(
                {
                    'video_size': {'width': width, 'height': height},
                    'num_frames': int(24 * duration_seconds),
                    'fps': 24,
                    'use_multiscale': True,
                }
            )
            if normalized == 'fal_ltx23_i2v':
                if not image_url:
                    raise ValueError('fal_ltx23_i2v requires image_url')
                payload['image_url'] = image_url
            if generate_audio is not None and self._supports_generate_audio(normalized):
                payload['generate_audio'] = bool(generate_audio)
            return payload

        if normalized in {'seedance_v1_lite_t2v', 'seedance_v1_lite_i2v'}:
            payload.update(
                {
                    'aspect_ratio': aspect_ratio,
                    'resolution': resolution,
                    'duration': str(duration_seconds),
                }
            )
            if normalized == 'seedance_v1_lite_i2v':
                if not image_url:
                    raise ValueError('seedance_v1_lite_i2v requires image_url')
                payload['image_url'] = image_url
            return payload

        if normalized == 'pixverse_c1_reference':
            if duration_seconds not in {5, 10}:
                raise ValueError('pixverse_c1_reference supports only 5s or 10s durations')
            if resolution not in {'360p', '540p', '720p'}:
                raise ValueError('pixverse_c1_reference supports only 360p, 540p, or 720p resolution')
            cleaned_references = [
                {
                    'ref_name': str(item.get('ref_name') or '').strip(),
                    'type': str(item.get('type') or 'subject').strip(),
                    'image_url': str(item.get('image_url') or '').strip(),
                }
                for item in (image_references or [])
                if str(item.get('ref_name') or '').strip() and str(item.get('image_url') or '').strip()
            ]
            if not cleaned_references:
                raise ValueError('pixverse_c1_reference requires image_references')
            payload.update(
                {
                    'aspect_ratio': aspect_ratio,
                    'resolution': resolution,
                    'duration': duration_seconds,
                    'image_references': cleaned_references[:2],
                }
            )
            if generate_audio is not None:
                payload['generate_audio_switch'] = bool(generate_audio)
            return payload

        if normalized in {
            'kling_o3_standard_t2v',
            'kling_o3_pro_t2v',
            'kling_o3_4k_t2v',
            'kling_o3_standard_i2v',
            'kling_o3_pro_i2v',
            'kling_o3_4k_i2v',
        }:
            payload.update(
                {
                    'aspect_ratio': aspect_ratio,
                    'duration': str(duration_seconds),
                }
            )
            if normalized.endswith('_i2v'):
                if not image_url:
                    raise ValueError(f'{normalized} requires image_url')
                payload['image_url'] = image_url
            if generate_audio is not None and self._supports_generate_audio(normalized):
                payload['generate_audio'] = bool(generate_audio)
            return payload

        payload.update(
            {
                'aspect_ratio': aspect_ratio,
                'duration': duration_seconds,
                'resolution': resolution,
            }
        )
        if normalized in {'kling_o3_reference', 'kling_o3_standard_reference', 'kling_o3_pro_reference', 'kling_o3_4k_reference'}:
            if image_url:
                payload['image_urls'] = [image_url]
            if generate_audio is not None and self._supports_generate_audio(normalized):
                payload['generate_audio'] = bool(generate_audio)
            return payload
        if normalized == 'seedance_v1_lite_reference':
            if not image_url:
                raise ValueError('seedance_v1_lite_reference requires image_url')
            payload['reference_image_urls'] = [image_url]
            return payload

        if generate_audio is not None and self._supports_generate_audio(normalized):
            payload['generate_audio'] = bool(generate_audio)
        if image_url:
            payload['image_url'] = image_url
        return payload

    def _dimensions_for(self, *, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        matrix = {
            ('9:16', '480p'): (480, 854),
            ('9:16', '720p'): (720, 1280),
            ('9:16', '1080p'): (1080, 1920),
            ('9:16', '1440p'): (1440, 2560),
            ('9:16', '2160p'): (2160, 3840),
            ('9:16', '4K'): (2160, 3840),
            ('16:9', '480p'): (854, 480),
            ('16:9', '720p'): (1280, 720),
            ('16:9', '1080p'): (1920, 1080),
            ('16:9', '1440p'): (2560, 1440),
            ('16:9', '2160p'): (3840, 2160),
            ('16:9', '4K'): (3840, 2160),
            ('1:1', '480p'): (480, 480),
            ('1:1', '720p'): (720, 720),
            ('1:1', '1080p'): (1080, 1080),
            ('1:1', '1440p'): (1440, 1440),
            ('1:1', '2160p'): (2160, 2160),
            ('1:1', '4K'): (2160, 2160),
        }
        return matrix.get((aspect_ratio, resolution), (1280, 720))

    def _fetch_infinitetalk_result_payload(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        submit_url: str,
        request_id: str | None,
        submit_payload: dict[str, Any],
        terminal_payload: dict[str, Any],
    ) -> dict[str, Any]:
        candidates: list[tuple[str, str]] = []
        if request_id:
            request_base = f'{submit_url}/requests/{request_id}'
            candidates.extend(
                [
                    ('GET', request_base),
                    ('POST', f'{request_base}/response'),
                    ('GET', f'{request_base}/response'),
                ]
            )

        for payload in (terminal_payload, submit_payload):
            response_url = payload.get('response_url')
            if isinstance(response_url, str) and response_url.strip():
                normalized = self._normalize_candidate_url(response_url.strip())
                candidates.append(('POST', normalized))
                candidates.append(('GET', normalized))

        seen: set[tuple[str, str]] = set()
        for method, candidate in candidates:
            key = (method, candidate)
            if key in seen:
                continue
            seen.add(key)
            response = self._request_with_timeout(
                client=client,
                method=method,
                url=candidate,
                headers=headers,
                timeout=self._RESPONSE_REQUEST_TIMEOUT,
                failure_label='fal InfiniteTalk response fetch',
                json={} if method == 'POST' else None,
            )
            if response is None or response.status_code >= 400:
                continue
            payload = response.json()
            if payload:
                return payload
        return terminal_payload

    def _normalize_infinitetalk_resolution(self, *, requested_resolution: str | None, metadata: dict[str, Any]) -> str:
        explicit = str(metadata.get('infinitetalk_resolution') or requested_resolution or '').strip().lower()
        if explicit == '720p':
            return '720p'
        return '480p'

    def _normalize_infinitetalk_acceleration(self, value: Any) -> str:
        normalized = str(value or 'regular').strip().lower()
        if normalized in {'regular', 'none', 'disabled'}:
            return 'regular'
        if normalized in {'high', 'turbo', 'fast'}:
            return 'high'
        return 'regular'

    def _choose_infinitetalk_num_frames(self, *, audio_duration_seconds: float | None, duration_hint_seconds: int) -> int:
        effective_seconds = float(audio_duration_seconds or 0.0)
        if effective_seconds <= 0.0:
            effective_seconds = float(max(duration_hint_seconds, 1))
        # Conservative 24fps mapping keeps lip-sync timing close to the actual scene narration.
        derived_frames = int(math.ceil(effective_seconds * 24.0))
        return max(48, min(derived_frames, 240))


    def _fetch_completed_response_payload(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        model_key: str,
        status_url: str,
        submit_response_url: str | None,
        completed_payload: dict[str, Any],
        allow_status_response_fallback: bool,
        allow_queue_request_response_endpoint: bool,
        allow_queue_request_direct_get: bool,
    ) -> tuple[dict[str, Any] | None, list[str]]:
        response_url_candidates: list[tuple[str, str]] = []

        completed_response_url = completed_payload.get('response_url')
        if isinstance(completed_response_url, str) and completed_response_url.strip():
            response_url_candidates.extend(
                self._response_fetch_candidates(
                    completed_response_url.strip(),
                    allow_queue_request_response_endpoint=allow_queue_request_response_endpoint,
                    allow_queue_request_direct_get=allow_queue_request_direct_get,
                )
            )

        if isinstance(submit_response_url, str) and submit_response_url.strip():
            response_url_candidates.extend(
                self._response_fetch_candidates(
                    submit_response_url.strip(),
                    allow_queue_request_response_endpoint=allow_queue_request_response_endpoint,
                    allow_queue_request_direct_get=allow_queue_request_direct_get,
                )
            )

        if allow_status_response_fallback and '/status' in status_url:
            base_request_url = status_url.rsplit('/status', 1)[0]
            response_url_candidates.extend(
                self._response_fetch_candidates(
                    f'{base_request_url}/response',
                    allow_queue_request_response_endpoint=allow_queue_request_response_endpoint,
                    allow_queue_request_direct_get=allow_queue_request_direct_get,
                )
            )

        tried_response_urls: list[str] = []
        deduped_candidates = list(dict.fromkeys(response_url_candidates))

        for method, response_url in deduped_candidates:
            tried_response_urls.append(response_url)

            response_payload = self._request_with_timeout(
                client=client,
                method=method,
                url=response_url,
                headers=headers,
                json={} if method == 'POST' else None,
                timeout=self._RESPONSE_REQUEST_TIMEOUT,
                failure_label='fal response fetch',
            )
            if response_payload is None:
                continue

            if response_payload.status_code >= 400:
                self._raise_if_fal_file_download_error(
                    response=response_payload,
                    model_hint=model_key,
                )
                logger.warning(
                    'fal_response_url_fetch_failed response_url=%s status_code=%s body=%s',
                    response_url,
                    response_payload.status_code,
                    response_payload.text[:480],
                )
                continue

            payload = response_payload.json()
            logger.info(
                'fal_response_payload_received',
                extra={
                    'response_url': response_url,
                    'response_keys': sorted([str(k) for k in payload.keys()]),
                    'response_state': self._normalize_state(payload),
                    'response_request_id': payload.get('request_id'),
                    'has_video_url': bool(self._extract_video_url(payload)),
                    'preview': str(payload)[:480],
                },
            )
            return payload, tried_response_urls

        return None, tried_response_urls

    def _raise_if_fal_file_download_error(self, *, response: httpx.Response, model_hint: str) -> None:
        if response.status_code < 400:
            return
        try:
            payload = response.json()
        except Exception:
            return
        if not isinstance(payload, dict):
            return
        detail = payload.get('detail')
        if not isinstance(detail, list):
            return
        for item in detail:
            if not isinstance(item, dict):
                continue
            error_type = str(item.get('type') or '').strip().lower()
            if error_type != 'file_download_error':
                continue
            failed_input = str(item.get('input') or '').strip() or None
            message = str(item.get('msg') or 'Failed to download upstream input file').strip()
            raise RuntimeError(
                f'fal {model_hint} rejected input asset (file_download_error): {message}'
                + (f' input={failed_input}' if failed_input else '')
            )

    def _response_fetch_candidates(
        self,
        value: str,
        *,
        allow_queue_request_response_endpoint: bool,
        allow_queue_request_direct_get: bool,
    ) -> list[tuple[str, str]]:
        normalized = self._normalize_candidate_url(value.strip())
        if self._is_queue_request_url(normalized):
            candidates: list[tuple[str, str]] = []
            if allow_queue_request_direct_get:
                candidates.append(('GET', normalized))
            if allow_queue_request_response_endpoint:
                candidates.append(('POST', self._normalize_candidate_url(f'{normalized}/response')))
            return candidates
        return [('POST', normalized), ('GET', normalized)]



    def _endpoint_for(self, model_key: str) -> str:
        mapping = {
            'fal_ltx23_t2v': 'fal-ai/ltx-2.3-22b/text-to-video',
            'fal_ltx23_i2v': 'fal-ai/ltx-2.3-22b/image-to-video',
            'seedance_v1_lite_t2v': 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
            'seedance_v1_lite_i2v': 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
            'seedance_v1_lite_reference': 'fal-ai/bytedance/seedance/v1/lite/reference-to-video',
            'pixverse_c1_reference': 'fal-ai/pixverse/c1/reference-to-video',
            'kling_v26_standard_motion_control': 'fal-ai/kling-video/v2.6/standard/motion-control',
            'kling_o3_standard_t2v': 'fal-ai/kling-video/o3/standard/text-to-video',
            'kling_o3_standard_i2v': 'fal-ai/kling-video/o3/standard/image-to-video',
            'kling_o3_pro_t2v': 'fal-ai/kling-video/o3/pro/text-to-video',
            'kling_o3_pro_i2v': 'fal-ai/kling-video/o3/pro/image-to-video',
            'kling_o3_4k_t2v': 'fal-ai/kling-video/o3/4k/text-to-video',
            'kling_o3_4k_i2v': 'fal-ai/kling-video/o3/4k/image-to-video',

            # ✅ O3 REFERENCE MODELS — main avatar product route
            'kling_o3_standard_reference': 'fal-ai/kling-video/o3/standard/reference-to-video',
            'kling_o3_pro_reference': 'fal-ai/kling-video/o3/pro/reference-to-video',
            'kling_o3_4k_reference': 'fal-ai/kling-video/o3/4k/reference-to-video',

            # Backward compatibility for old key.
            # Treat old generic O3 key as O3 Standard.
            'kling_o3_reference': 'fal-ai/kling-video/o3/standard/reference-to-video',

            # ✅ LEGACY/FALLBACK ELEMENTS MODELS
            'kling_v16_standard_elements': 'fal-ai/kling-video/v1.6/standard/elements',
            'kling_v16_pro_elements': 'fal-ai/kling-video/v1.6/pro/elements',
        }

        endpoint = mapping.get(model_key)
        if not endpoint:
            raise ValueError(f'Unsupported fal model key: {model_key}')

        return endpoint

    def _normalize_candidate_url(self, value: str) -> str:
        if value.startswith('http://') or value.startswith('https://'):
            return value
        base = self.settings.fal_api_base.rstrip('/')
        if value.startswith('/'):
            return f'{base}{value}'
        return f'{base}/{value}'

    def _is_queue_request_url(self, value: str) -> bool:
        parsed = urlparse(value)
        path = parsed.path.rstrip('/')
        return '/requests/' in path and not path.endswith('/response') and not path.endswith('/status') and not path.endswith('/cancel')

    def _extract_video_url(self, payload: dict[str, Any]) -> str | None:
        direct_candidates = (
            payload.get('video_url'),
            payload.get('mp4_url'),
            payload.get('output_url'),
            payload.get('result_url'),
            payload.get('download_url'),
            payload.get('file_url'),
            payload.get('url'),
        )
        for candidate in direct_candidates:
            normalized = self._coerce_media_candidate(candidate)
            if normalized:
                return normalized
        video = payload.get('video')
        if isinstance(video, dict):
            for key in ('url', 'video_url', 'mp4_url', 'output_url', 'result_url', 'download_url', 'file_url'):
                normalized = self._coerce_media_candidate(video.get(key))
                if normalized:
                    return normalized

        for container_key in ('output', 'outputs', 'result', 'response', 'data', 'artifact', 'artifacts', 'asset', 'assets', 'media', 'files'):
            container = payload.get(container_key)
            normalized = self._extract_from_container(container)
            if normalized:
                return normalized

        # Final fallback: recursively inspect nested payload for likely video URLs.
        nested = self._find_url_recursive(payload)
        if nested:
            return nested
        return None


    def _extract_audio_url(self, payload: dict[str, Any]) -> str | None:
        direct_candidates = (
            payload.get('audio_url'),
            payload.get('mp3_url'),
            payload.get('output_url'),
            payload.get('result_url'),
            payload.get('download_url'),
            payload.get('file_url'),
            payload.get('url'),
        )
        for candidate in direct_candidates:
            normalized = self._coerce_audio_candidate(candidate)
            if normalized:
                return normalized

        audio = payload.get('audio')
        if isinstance(audio, dict):
            for key in ('url', 'audio_url', 'mp3_url', 'output_url', 'result_url', 'download_url', 'file_url'):
                normalized = self._coerce_audio_candidate(audio.get(key))
                if normalized:
                    return normalized

        for container_key in ('output', 'outputs', 'result', 'response', 'data', 'artifact', 'artifacts', 'asset', 'assets', 'media', 'files'):
            container = payload.get(container_key)
            normalized = self._extract_audio_from_container(container)
            if normalized:
                return normalized

        return self._find_audio_url_recursive(payload)

    def _extract_audio_from_container(self, container: Any) -> str | None:
        if isinstance(container, dict):
            for key in ('url', 'audio_url', 'mp3_url', 'output_url', 'result_url', 'download_url', 'file_url', 'src', 'href'):
                normalized = self._coerce_audio_candidate(container.get(key))
                if normalized:
                    return normalized
            for nested_value in container.values():
                normalized = self._extract_audio_from_container(nested_value)
                if normalized:
                    return normalized
            return None
        if isinstance(container, list):
            for item in container:
                normalized = self._extract_audio_from_container(item)
                if normalized:
                    return normalized
            return None
        return self._coerce_audio_candidate(container)

    def _coerce_audio_candidate(self, candidate: Any) -> str | None:
        if not isinstance(candidate, str):
            return None
        value = candidate.strip()
        if not value:
            return None
        if value.startswith('data:audio/'):
            return value
        if value.startswith('//'):
            return f'https:{value}'
        if value.startswith('http://') or value.startswith('https://') or value.startswith('/'):
            lowered = value.lower()
            if (
                '.mp3' in lowered
                or '.wav' in lowered
                or '.m4a' in lowered
                or '.aac' in lowered
                or '.ogg' in lowered
                or '/files/' in lowered
                or '/media/' in lowered
                or '/storage/' in lowered
                or '/download' in lowered
                or lowered.startswith('https://v3.fal.media/')
                or lowered.startswith('https://fal.media/')
            ):
                return self._normalize_media_url(value)
        return None

    def _find_audio_url_recursive(self, node: Any, *, depth: int = 0) -> str | None:
        if depth > 5:
            return None
        if isinstance(node, str):
            return self._coerce_audio_candidate(node)
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() in {'url', 'audio_url', 'mp3_url', 'file_url', 'download_url', 'output_url', 'result_url', 'src', 'href'}:
                    normalized = self._coerce_audio_candidate(value)
                    if normalized:
                        return normalized
                nested = self._find_audio_url_recursive(value, depth=depth + 1)
                if nested:
                    return nested
            return None
        if isinstance(node, list):
            for item in node:
                nested = self._find_audio_url_recursive(item, depth=depth + 1)
                if nested:
                    return nested
            return None
        return None


    def _extract_from_container(self, container: Any) -> str | None:
        if isinstance(container, dict):
            for key in ('url', 'video_url', 'mp4_url', 'output_url', 'result_url', 'download_url', 'file_url', 'src', 'href'):
                normalized = self._coerce_media_candidate(container.get(key))
                if normalized:
                    return normalized
            for nested_value in container.values():
                normalized = self._extract_from_container(nested_value)
                if normalized:
                    return normalized
            return None
        if isinstance(container, list):
            for item in container:
                normalized = self._extract_from_container(item)
                if normalized:
                    return normalized
            return None
        return self._coerce_media_candidate(container)

    def _coerce_media_candidate(self, candidate: Any) -> str | None:
        if not isinstance(candidate, str):
            return None
        value = candidate.strip()
        if not value:
            return None
        if value.startswith('data:video/'):
            return value
        if value.startswith('//'):
            return f'https:{value}'
        if value.startswith('http://') or value.startswith('https://') or value.startswith('/'):
            lowered = value.lower()
            if (
                '.mp4' in lowered
                or '.mov' in lowered
                or '.webm' in lowered
                or '.m3u8' in lowered
                or '/files/' in lowered
                or '/media/' in lowered
                or '/storage/' in lowered
                or '/download' in lowered
            ):
                return self._normalize_media_url(value)
            if lowered.startswith('https://v3.fal.media/') or lowered.startswith('https://fal.media/') or lowered.startswith('http://fal.media/'):
                return self._normalize_media_url(value)
        return None

    def _find_url_recursive(self, node: Any, *, depth: int = 0) -> str | None:
        if depth > 5:
            return None
        if isinstance(node, str):
            return self._coerce_media_candidate(node)
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() in {'url', 'video_url', 'mp4_url', 'file_url', 'download_url', 'output_url', 'result_url', 'src', 'href'}:
                    normalized = self._coerce_media_candidate(value)
                    if normalized:
                        return normalized
                nested = self._find_url_recursive(value, depth=depth + 1)
                if nested:
                    return nested
            return None
        if isinstance(node, list):
            for item in node:
                nested = self._find_url_recursive(item, depth=depth + 1)
                if nested:
                    return nested
            return None
        return None

    def _normalize_media_url(self, value: str) -> str:
        if value.startswith('//'):
            return f'https:{value}'
        if value.startswith('http://') or value.startswith('https://'):
            return value
        return self._normalize_candidate_url(value)


    def _descriptor_from_queue_request_url(self, value: str) -> dict[str, Any] | None:
        normalized = self._normalize_candidate_url(value.strip())
        if not self._is_queue_request_url(normalized):
            return None
        request_id = normalized.rstrip('/').rsplit('/', 1)[-1]
        return {
            'request_id': request_id,
            'status_url': f'{normalized}/status',
            'response_url': normalized,
            'status': 'in_queue',
        }

    def _resolve_follow_up_payload(self, payload: dict[str, Any], *, allow_response_url_descriptor: bool = False) -> dict[str, Any] | None:
        state = self._normalize_state(payload)
        status_url = payload.get('status_url')
        if state in self._ACTIVE_STATES and isinstance(status_url, str) and status_url.strip():
            return payload
        if allow_response_url_descriptor:
            response_url = payload.get('response_url')
            if isinstance(response_url, str) and response_url.strip():
                descriptor = self._descriptor_from_queue_request_url(response_url)
                if descriptor is not None:
                    return descriptor
        return None

    def _follow_queued_response_request(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        payload: dict[str, Any],
        requested_model_key: str,
        resolved_endpoint: str,
    ) -> FalFollowUpResult:
        direct_video_url = self._extract_video_url(payload)
        if direct_video_url:
            logger.info(
                'fal_follow_up_video_resolved',
                extra={
                    'request_id': payload.get('request_id'),
                    'lineage': [payload.get('request_id')],
                    'video_url': direct_video_url,
                },
            )
            return FalFollowUpResult(
                status='resolved',
                video_url=direct_video_url,
                payload=payload,
                lineage=[str(payload.get('request_id') or '').strip() or None] if payload.get('request_id') else [],
                request_id=str(payload.get('request_id') or '').strip() or None,
                status_url=str(payload.get('status_url') or '').strip() or None,
            )

        status_url = payload.get('status_url')
        if not isinstance(status_url, str) or not status_url.strip():
            logger.warning(
                'fal_follow_up_missing_status_url request_id=%s state=%s payload_preview=%s',
                payload.get('request_id'),
                self._normalize_state(payload),
                str(payload)[:480],
            )
            return FalFollowUpResult(
                status='broken_payload',
                payload=payload,
                lineage=[str(payload.get('request_id') or '').strip() or None] if payload.get('request_id') else [],
                request_id=str(payload.get('request_id') or '').strip() or None,
                reason='missing_status_url',
            )

        started = time.time()
        current_payload = payload
        last_state: str | None = None
        current_status_url = self._normalize_candidate_url(status_url.strip())
        lineage_ids: list[str] = []

        timeout_seconds = self._terminal_timeout_for_model(requested_model_key)

        while time.time() - started < timeout_seconds:
            direct_video_url = self._extract_video_url(current_payload)
            if direct_video_url:
                current_request_id = str(current_payload.get('request_id') or '').strip() or None
                if current_request_id and current_request_id not in lineage_ids:
                    lineage_ids.append(current_request_id)
                logger.info(
                    'fal_follow_up_video_resolved',
                    extra={
                        'request_id': current_payload.get('request_id'),
                        'status_url': current_status_url,
                        'lineage': lineage_ids,
                        'video_url': direct_video_url,
                    },
                )
                return FalFollowUpResult(
                    status='resolved',
                    video_url=direct_video_url,
                    payload=current_payload,
                    lineage=lineage_ids,
                    request_id=current_request_id,
                    status_url=current_status_url,
                )

            current_request_id = str(current_payload.get('request_id') or '').strip() or None
            if current_request_id and current_request_id not in lineage_ids:
                lineage_ids.append(current_request_id)
            current_state = str(current_payload.get('status') or current_payload.get('state') or '').strip().lower()

            if current_state != last_state:
                logger.info(
                    'fal_follow_up_state_transition',
                    extra={
                        'request_id': current_payload.get('request_id'),
                        'status_url': current_status_url,
                        'lineage': lineage_ids,
                        'state': current_state,
                    },
                )
                last_state = current_state

            if current_state in self._SUCCESS_STATES:
                next_payload = self._resolve_follow_up_payload(current_payload, allow_response_url_descriptor=True)
                if next_payload is not None:
                    next_request_id = str(next_payload.get('request_id') or '').strip() or None
                    if next_request_id and next_request_id in lineage_ids:
                        logger.warning(
                            'fal_follow_up_cycle_detected request_id=%s lineage=%s status_url=%s state=%s',
                            next_request_id,
                            lineage_ids,
                            current_status_url,
                            current_state,
                        )
                        return FalFollowUpResult(
                            status='cycle_detected',
                            payload=current_payload,
                            lineage=lineage_ids,
                            request_id=next_request_id,
                            status_url=current_status_url,
                            reason='lineage_cycle',
                        )
                    next_status_url = next_payload.get('status_url')
                    if not isinstance(next_status_url, str) or not next_status_url.strip():
                        logger.warning(
                            'fal_follow_up_missing_status_url request_id=%s state=%s payload_preview=%s',
                            next_payload.get('request_id'),
                            self._normalize_state(next_payload),
                            str(next_payload)[:480],
                        )
                        return FalFollowUpResult(
                            status='broken_payload',
                            payload=next_payload,
                            lineage=lineage_ids,
                            request_id=next_request_id,
                            reason='missing_next_status_url',
                        )
                    logger.info(
                        'fal_follow_up_lineage_switched',
                        extra={
                            'from_request_id': current_payload.get('request_id'),
                            'to_request_id': next_payload.get('request_id'),
                            'from_status_url': current_status_url,
                            'to_status_url': self._normalize_candidate_url(next_status_url.strip()),
                            'lineage': lineage_ids,
                            'mode': 'status_only',
                        },
                    )
                    current_payload = next_payload
                    current_status_url = self._normalize_candidate_url(next_status_url.strip())
                    last_state = None
                    continue

                logger.warning(
                    'fal_follow_up_completed_without_video request_id=%s lineage=%s preview=%s',
                    current_payload.get('request_id'),
                    lineage_ids,
                    str(current_payload)[:480],
                )
                return FalFollowUpResult(
                    status='broken_payload',
                    payload=current_payload,
                    lineage=lineage_ids,
                    request_id=current_request_id,
                    status_url=current_status_url,
                    reason='completed_without_video_or_next_status',
                )

            if current_state in self._FAILURE_STATES:
                logger.error(
                    'fal_follow_up_provider_failed request_id=%s lineage=%s status_url=%s state=%s preview=%s',
                    current_payload.get('request_id'),
                    lineage_ids,
                    current_status_url,
                    current_state,
                    str(current_payload)[:480],
                )
                return FalFollowUpResult(
                    status='provider_failed',
                    payload=current_payload,
                    lineage=lineage_ids,
                    request_id=current_request_id,
                    status_url=current_status_url,
                    reason=current_state,
                )

            time.sleep(self._STATUS_POLL_INTERVAL_SECONDS)

            status_response = self._request_with_timeout(
                client=client,
                method='GET',
                url=current_status_url,
                headers=headers,
                timeout=self._STATUS_REQUEST_TIMEOUT,
                failure_label='fal follow-up status poll',
            )
            if status_response is None:
                continue
            if status_response.status_code >= 400:
                logger.warning(
                    'fal_follow_up_status_failed status_url=%s status_code=%s body=%s',
                    current_status_url,
                    status_response.status_code,
                    status_response.text[:240],
                )
                return FalFollowUpResult(
                    status='provider_failed',
                    payload=current_payload,
                    lineage=lineage_ids,
                    request_id=current_request_id,
                    status_url=current_status_url,
                    reason=f'status_http_{status_response.status_code}',
                )

            current_payload = status_response.json()

        logger.warning(
            'fal_follow_up_status_timed_out status_url=%s initial_request_id=%s lineage=%s requested_model_key=%s resolved_endpoint=%s timeout_seconds=%s',
            current_status_url,
            payload.get('request_id'),
            lineage_ids,
            requested_model_key,
            resolved_endpoint,
            timeout_seconds,
        )
        return FalFollowUpResult(
            status='timed_out',
            payload=current_payload,
            lineage=lineage_ids,
            request_id=str(current_payload.get('request_id') or payload.get('request_id') or '').strip() or None,
            status_url=current_status_url,
            reason='timeout',
        )


    def _request_with_timeout(
        self,
        *,
        client: httpx.Client,
        method: str,
        url: str,
        headers: dict[str, str],
        timeout: httpx.Timeout,
        failure_label: str,
        json: dict[str, Any] | None = None,
    ) -> httpx.Response | None:
        try:
            return client.request(method, url, headers=headers, json=json, timeout=timeout)
        except httpx.ConnectTimeout:
            logger.warning('%s_connect_timeout method=%s url=%s timeout=%s', failure_label, method, url, timeout.connect)
            return None
        except httpx.ReadTimeout:
            logger.warning('%s_read_timeout method=%s url=%s timeout=%s', failure_label, method, url, timeout.read)
            return None
        except httpx.RequestError as exc:
            logger.warning('%s_request_error method=%s url=%s error=%s', failure_label, method, url, type(exc).__name__)
            return None
