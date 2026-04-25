from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.db.firestore_utils import utcnow
from app.providers.firebase import get_firestore_client

logger = logging.getLogger(__name__)


class HeygenAvatarService:
    _REQUEST_RETRIES = 2
    _SUCCESS_STATES = {'completed', 'complete', 'done', 'succeeded', 'success'}
    _FAILURE_STATES = {'failed', 'failure', 'error', 'cancelled', 'canceled'}
    _ACTIVE_STATES = {'pending', 'processing', 'in_progress', 'queued', 'running', 'waiting', 'created'}
    _INTERNAL_VOICE_LABELS = {'shubh', 'priya'}
    _SUPPORTED_AVATAR_TYPES = ('photo_avatar', 'digital_twin')

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._timeout = httpx.Timeout(
            float(self.settings.heygen_request_timeout_seconds),
            connect=min(10.0, float(self.settings.heygen_request_timeout_seconds)),
        )

    def create_avatar_from_image(self, image_url: str, name: str) -> dict[str, Any]:
        normalized_image_url = str(image_url or '').strip()
        normalized_name = str(name or '').strip()
        if not normalized_image_url:
            raise ValueError('image_url is required')
        if not normalized_name:
            raise ValueError('name is required')
        with self._client() as client:
            group_payload = self._request_json(
                client=client,
                method='POST',
                path='/v2/photo_avatar/avatar_group/create',
                json={'name': normalized_name},
            )
            avatar_group_id = self._extract_string(
                group_payload,
                ('data', 'avatar_group_id'),
                ('data', 'group_id'),
                ('avatar_group_id',),
                ('group_id',),
                ('id',),
            )
            if not avatar_group_id:
                raise RuntimeError(f'HeyGen avatar group create did not return a group id: {group_payload}')

            generation_payload = self._request_json(
                client=client,
                method='POST',
                path='/v1/photo_avatar/generate',
                json={
                    'group_id': avatar_group_id,
                    'image_url': normalized_image_url,
                    'name': normalized_name,
                },
            )
            generation_id = self._extract_string(
                generation_payload,
                ('data', 'generation_id'),
                ('data', 'id'),
                ('generation_id',),
                ('id',),
            )
            if not generation_id:
                raise RuntimeError(f'HeyGen avatar generate did not return a generation id: {generation_payload}')

            terminal_generation = self._poll_generation(
                client=client,
                generation_id=generation_id,
                timeout_seconds=float(self.settings.heygen_generation_timeout_seconds),
            )
            remote_avatar = self._find_avatar_for_group(
                client=client,
                avatar_group_id=avatar_group_id,
            )
            provider_avatar_id = self._extract_string(
                remote_avatar,
                ('avatar_id',),
                ('talking_photo_id',),
                ('id',),
            )
            if not provider_avatar_id:
                raise RuntimeError(f'HeyGen avatar listing did not include an avatar id: {remote_avatar}')

            preview_url = self._extract_string(
                remote_avatar,
                ('preview_url',),
                ('preview_image_url',),
                ('preview_video_url',),
                ('image_url',),
                ('thumbnail_url',),
                ('photo_url',),
            ) or normalized_image_url

            return {
                'avatar_group_id': avatar_group_id,
                'generation_id': generation_id,
                'avatar_id': provider_avatar_id,
                'preview_url': preview_url,
                'avatar_type': 'photo_avatar',
                'ownership': 'private',
                'supports_avatar_video_generation': True,
                'raw_generation': terminal_generation,
                'raw_avatar': remote_avatar,
            }


    def generate_look(self, group_id: str, prompt: str) -> dict[str, Any]:
        normalized_group_id = str(group_id or '').strip()
        normalized_prompt = str(prompt or '').strip()
        if not normalized_group_id:
            raise ValueError('group_id is required')
        if not normalized_prompt:
            raise ValueError('prompt is required')

        with self._client() as client:
            response_payload = self._request_json(
                client=client,
                method='POST',
                path='/v2/photo_avatar/look/generate',
                json={
                    'group_id': normalized_group_id,
                    'prompt': normalized_prompt,
                    'orientation': 'vertical',
                    'pose': 'half_body',
                    'style': 'Realistic',
                },
            )
            generation_id = self._extract_string(
                response_payload,
                ('data', 'generation_id'),
                ('data', 'id'),
                ('generation_id',),
                ('id',),
            )
            if not generation_id:
                raise RuntimeError(f'HeyGen look generate did not return a generation id: {response_payload}')

            terminal_generation = self._poll_generation(
                client=client,
                generation_id=generation_id,
                timeout_seconds=float(self.settings.heygen_generation_timeout_seconds),
            )
            look_id = self._extract_string(
                terminal_generation,
                ('data', 'look_id'),
                ('data', 'id'),
                ('look_id',),
                ('id',),
            ) or generation_id
            preview_url = self._extract_string(
                terminal_generation,
                ('data', 'preview_url'),
                ('data', 'image_url'),
                ('preview_url',),
                ('image_url',),
                ('thumbnail_url',),
            )
            return {
                'look_id': look_id,
                'generation_id': generation_id,
                'preview_url': preview_url,
                'raw': terminal_generation,
            }

    def list_avatars(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        db = get_firestore_client()
        cache_meta_ref = db.collection('heygen_avatars').document('_meta')
        if not refresh:
            cache_meta = cache_meta_ref.get()
            if cache_meta.exists:
                meta = cache_meta.to_dict() or {}
                cached_at = meta.get('cached_at')
                age = (utcnow() - cached_at).total_seconds() if hasattr(cached_at, 'tzinfo') else None
                if age is not None and age < float(self.settings.heygen_preset_cache_ttl_seconds):
                    cached = self._list_cached_preset_avatars(db)
                    # FILTER: Only Avatar IV compatible
                    return [a for a in cached if a.get('supports_avatar_video_generation') == True]

        with self._client() as client:
            avatars = self._fetch_supported_avatar_looks(client)
            # FILTER: Only Avatar IV compatible
            avatar_iv_only = [
                a for a in avatars 
                if a.get('supports_avatar_video_generation') == True
            ]
        
        self._cache_preset_avatars(db=db, avatars=avatar_iv_only)
        return self._list_cached_preset_avatars(db)

    def list_avatar_library(self, *, user_id: str, refresh_presets: bool = False) -> dict[str, list[dict[str, Any]]]:
        db = get_firestore_client()
        preset_avatars = self.list_avatars(refresh=refresh_presets)
        user_avatars: list[dict[str, Any]] = []
        for snap in db.collection('avatars').where('user_id', '==', str(user_id or '').strip()).stream():
            data = snap.to_dict() or {}
            if str(data.get('provider') or '').strip().lower() != 'heygen':
                continue
            if data.get('supports_avatar_video_generation') is not True:
                continue
            user_avatars.append(
                {
                    'id': str(data.get('id') or snap.id),
                    'avatar_id': str(data.get('provider_avatar_id') or data.get('avatar_id') or '').strip() or None,
                    **data,
                }
            )
        user_avatars.sort(key=lambda item: str(item.get('created_at') or ''), reverse=True)
        return {
            'preset_avatars': preset_avatars,
            'user_avatars': user_avatars,
        }

    def generate_avatar_video(
        self,
        *,
        avatar_id: str,
        script: str,
        voice_id: str | None,
        aspect_ratio: str,
        resolution: str,
        voice_provider: str = 'heygen',
        audio_url: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        normalized_avatar_id = str(avatar_id or '').strip()
        normalized_script = str(script or '').strip()
        if not normalized_avatar_id:
            raise ValueError('avatar_id is required')
        if not normalized_script:
            raise ValueError('script is required')

        normalized_voice_provider = str(voice_provider or 'heygen').strip().lower() or 'heygen'
        resolved_voice_id = self._resolve_heygen_voice_id(voice_id)
        if normalized_voice_provider != 'sarvam' and not resolved_voice_id:
            raise ValueError(
                'HeyGen voice_id is required when voice_provider is heygen. '
                'Set HEYGEN_DEFAULT_VOICE_ID to a valid HeyGen voice id or store a valid provider_voice_id on the avatar.'
            )
        if normalized_voice_provider == 'sarvam':
            logger.info(
                'heygen_avatar_video_sarvam_mode_deferred',
                extra={
                    'avatar_id': normalized_avatar_id,
                    'has_audio_url': bool(str(audio_url or '').strip()),
                    'metadata': metadata or {},
                },
            )

        payload: dict[str, Any] = {
            'avatar_id': normalized_avatar_id,
            'script': normalized_script,
            'aspect_ratio': aspect_ratio,
            'resolution': resolution,
        }
        if normalized_voice_provider == 'sarvam' and str(audio_url or '').strip():
            payload['audio_url'] = str(audio_url).strip()
        elif resolved_voice_id:
            payload['voice_id'] = resolved_voice_id

        with self._client() as client:
            submit_payload = self._request_json(
                client=client,
                method='POST',
                path='/v2/videos',
                json=payload,
            )
            video_id = self._extract_string(
                submit_payload,
                ('data', 'video_id'),
                ('data', 'id'),
                ('video_id',),
                ('id',),
            )
            if not video_id:
                raise RuntimeError(f'HeyGen video create did not return a video id: {submit_payload}')

            terminal_payload = self._poll_video_status(
                client=client,
                video_id=video_id,
                timeout_seconds=float(self.settings.heygen_generation_timeout_seconds),
            )
            video_url = self._extract_string(
                terminal_payload,
                ('data', 'video_url'),
                ('data', 'url'),
                ('video_url',),
                ('url',),
            )
            if not video_url:
                raise RuntimeError(f'HeyGen completed without returning a video url: {terminal_payload}')

            return video_url, {
                'provider': 'heygen',
                'video_id': video_id,
                'status': self._normalize_state(terminal_payload) or 'completed',
                'voice_provider': normalized_voice_provider,
                'voice_id': resolved_voice_id,
                'raw': terminal_payload,
            }

    def generate_video_agent_avatar_video(
        self,
        *,
        avatar_id: str,
        prompt: str,
        voice_id: str | None,
        aspect_ratio: str,
        product_image_url: str,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        normalized_avatar_id = str(avatar_id or '').strip()
        normalized_prompt = str(prompt or '').strip()
        normalized_product_image_url = str(product_image_url or '').strip()
        if not normalized_avatar_id:
            raise ValueError('avatar_id is required')
        if not normalized_prompt:
            raise ValueError('prompt is required')
        if not normalized_product_image_url:
            raise ValueError('product_image_url is required')

        resolved_voice_id = self._resolve_heygen_voice_id(voice_id)
        if not resolved_voice_id:
            raise ValueError(
                'HeyGen voice_id is required for avatar_product video-agent generation. '
                'Set HEYGEN_DEFAULT_VOICE_ID to a valid HeyGen voice id or store a valid provider_voice_id on the avatar.'
            )

        session_id: str | None = None
        asset_reference = self._build_video_agent_file_reference(normalized_product_image_url)
        payload: dict[str, Any] = {
            'prompt': normalized_prompt,
            'avatar_id': normalized_avatar_id,
            'voice_id': resolved_voice_id,
            'orientation': self._aspect_ratio_to_orientation(aspect_ratio),
            'files': [asset_reference],
        }

        with self._client() as client:
            submit_payload = self._request_json(
                client=client,
                method='POST',
                path='/v3/video-agents',
                json=payload,
            )
            session_id = self._extract_string(
                submit_payload,
                ('data', 'session_id'),
                ('data', 'id'),
                ('session_id',),
                ('id',),
            )
            if not session_id:
                raise RuntimeError(f'HeyGen video agent create did not return a session id: {submit_payload}')

            terminal_payload = self._poll_video_agent_status(
                client=client,
                session_id=session_id,
                timeout_seconds=float(self.settings.heygen_generation_timeout_seconds),
            )
            video_url = self._extract_string(
                terminal_payload,
                ('data', 'video_url'),
                ('data', 'url'),
                ('data', 'video', 'url'),
                ('video_url',),
                ('url',),
            )
            if not video_url:
                raise RuntimeError(f'HeyGen video agent completed without returning a video url: {terminal_payload}')

            return video_url, {
                'provider': 'heygen',
                'video_agent_session_id': session_id,
                'status': self._normalize_state(terminal_payload) or 'completed',
                'voice_provider': 'heygen',
                'voice_id': resolved_voice_id,
                'product_image_url': normalized_product_image_url,
                'attached_product_files': [asset_reference],
                'raw': terminal_payload,
            }

    def _poll_generation(
        self,
        *,
        client: httpx.Client,
        generation_id: str,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        started = time.time()
        last_payload: dict[str, Any] | None = None
        while time.time() - started < timeout_seconds:
            payload = self._request_json(
                client=client,
                method='GET',
                path=f'/v2/photo_avatar/generation/{generation_id}',
            )
            last_payload = payload
            state = self._normalize_state(payload)
            if state in self._SUCCESS_STATES:
                return payload
            if state in self._FAILURE_STATES:
                raise RuntimeError(f'HeyGen generation failed: {payload}')
            time.sleep(float(self.settings.heygen_poll_interval_seconds))
        raise RuntimeError(f'HeyGen generation timed out: {last_payload or {"generation_id": generation_id}}')

    def _poll_video_status(
        self,
        *,
        client: httpx.Client,
        video_id: str,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        started = time.time()
        last_payload: dict[str, Any] | None = None
        while time.time() - started < timeout_seconds:
            payload = self._request_json(
                client=client,
                method='GET',
                path='/v1/video_status.get',
                params={'video_id': video_id},
            )
            last_payload = payload
            state = self._normalize_state(payload)
            if state in self._SUCCESS_STATES:
                return payload
            if state in self._FAILURE_STATES:
                raise RuntimeError(f'HeyGen video generation failed: {payload}')
            time.sleep(float(self.settings.heygen_poll_interval_seconds))
        raise RuntimeError(f'HeyGen video generation timed out: {last_payload or {"video_id": video_id}}')

    def _poll_video_agent_status(
        self,
        *,
        client: httpx.Client,
        session_id: str,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        started = time.time()
        last_payload: dict[str, Any] | None = None
        while time.time() - started < timeout_seconds:
            payload = self._request_json(
                client=client,
                method='GET',
                path=f'/v3/video-agents/{session_id}',
            )
            last_payload = payload
            state = self._normalize_state(payload)
            if state in self._SUCCESS_STATES:
                return payload
            if state in self._FAILURE_STATES:
                raise RuntimeError(f'HeyGen video agent generation failed: {payload}')
            time.sleep(float(self.settings.heygen_poll_interval_seconds))
        raise RuntimeError(f'HeyGen video agent generation timed out: {last_payload or {"session_id": session_id}}')

    def _find_avatar_for_group(self, *, client: httpx.Client, avatar_group_id: str) -> dict[str, Any]:
        avatars = self._fetch_supported_avatar_looks(client, ownership='private')
        if not avatars:
            raise RuntimeError('HeyGen returned no avatars while resolving the generated group')
        for item in avatars:
            if str(item.get('group_id') or item.get('avatar_group_id') or '').strip() == avatar_group_id:
                return item
        return avatars[0]


    def _cache_preset_avatars(self, *, db, avatars: list[dict[str, Any]]) -> None:
        meta_ref = db.collection('heygen_avatars').document('_meta')
        batch = db.batch()
        cached_at = utcnow()
        
        for item in avatars:
            # DON'T call _normalize_supported_avatar_item() again!
            # The item is ALREADY normalized from _fetch_supported_avatar_looks()
            provider_avatar_id = str(item.get('provider_avatar_id') or '').strip()
            
            if not provider_avatar_id:
                continue
            
            doc_ref = db.collection('heygen_avatars').document(provider_avatar_id)
            batch.set(
                doc_ref,
                {
                    **item,  # Use item directly - it's already normalized
                    'id': provider_avatar_id,
                    'avatar_id': provider_avatar_id,
                    'recommended_voice': str(self.settings.heygen_default_voice_id or '').strip() or None,
                    'provider_voice_id': str(self.settings.heygen_default_voice_id or '').strip() or None,
                    'voice_provider': 'heygen',
                    'updated_at': cached_at,
                },
                merge=True,
            )
        
        batch.set(meta_ref, {'cached_at': cached_at, 'count': len(avatars), 'schema_version': 1}, merge=True)
        batch.commit()


    def _list_cached_preset_avatars(self, db) -> list[dict[str, Any]]:
        print(f"\n📖 READING cached avatars from Firestore...")
        items: list[dict[str, Any]] = []
        doc_count = 0
        
        for snap in db.collection('heygen_avatars').stream():
            doc_count += 1
            if snap.id == '_meta':
                print(f"  ℹ️  Skipping _meta document")
                continue
            data = snap.to_dict() or {}
            items.append({'id': str(data.get('id') or snap.id), **data})
            if len(items) <= 3:
                print(f"  ✅ Read avatar: {data.get('name')} ({snap.id})")
        
        items.sort(key=lambda item: str(item.get('name') or '').lower())
        print(f"📊 Total docs: {doc_count}, Avatars returned: {len(items)}\n")
        return items


    def _fetch_supported_avatar_looks(
        self,
        client: httpx.Client,
        *,
        ownership: str | None = None,
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for avatar_type in self._SUPPORTED_AVATAR_TYPES:
            ownerships = [ownership] if ownership else (['public'] if avatar_type == 'photo_avatar' else [])
            if not ownership and avatar_type == 'digital_twin':
                ownerships.append('private')
            if not ownerships:
                continue
            for current_ownership in ownerships:
                payload = self._request_json(
                    client=client,
                    method='GET',
                    path='/v3/avatars/looks',
                    params={'avatar_type': avatar_type, 'ownership': current_ownership},
                )
                for item in self._extract_avatar_items(payload):
                    normalized = self._normalize_supported_avatar_item(
                        item,
                        avatar_type=avatar_type,
                        ownership=current_ownership,
                    )
                    if normalized:
                        results.append(normalized)
        deduped: dict[str, dict[str, Any]] = {}
        for item in results:
            avatar_id = str(item.get('provider_avatar_id') or '').strip()
            if avatar_id:
                deduped[avatar_id] = item
        return list(deduped.values())

    def _request_json(
        self,
        *,
        client: httpx.Client,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f'{self.settings.heygen_api_base.rstrip("/")}{path}'
        last_error: Exception | None = None
        for attempt in range(self._REQUEST_RETRIES + 1):
            try:
                response = client.request(method, url, json=json, params=params, timeout=self._timeout)
                response.raise_for_status()
                payload = response.json()
                if isinstance(payload, dict):
                    return payload
                raise RuntimeError(f'HeyGen returned a non-object response for {path}')
            except httpx.HTTPStatusError as exc:
                response_text = ''
                try:
                    response_text = exc.response.text[:1000]
                except Exception:
                    response_text = ''
                last_error = RuntimeError(
                    f'HTTP {exc.response.status_code} for {path}: {response_text or str(exc)}'
                )
                if attempt >= self._REQUEST_RETRIES:
                    break
                logger.warning(
                    'heygen_request_retry',
                    extra={
                        'method': method,
                        'path': path,
                        'attempt': attempt + 1,
                        'status_code': exc.response.status_code,
                        'response_text': response_text,
                    },
                )
                time.sleep(1.0 + attempt)
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt >= self._REQUEST_RETRIES:
                    break
                logger.warning(
                    'heygen_request_retry',
                    extra={
                        'method': method,
                        'path': path,
                        'attempt': attempt + 1,
                        'error': str(exc),
                    },
                )
                time.sleep(1.0 + attempt)
        raise RuntimeError(f'HeyGen request failed for {path}: {last_error}') from last_error

    def _resolve_heygen_voice_id(self, voice_id: str | None) -> str | None:
        candidate = str(voice_id or '').strip()
        if candidate and candidate.lower() not in self._INTERNAL_VOICE_LABELS:
            return candidate
        fallback = str(self.settings.heygen_default_voice_id or '').strip()
        if fallback and fallback.lower() not in self._INTERNAL_VOICE_LABELS:
            return fallback
        return None

    def _build_video_agent_file_reference(self, value: str) -> str:
        normalized = str(value or '').strip()
        if not normalized:
            raise ValueError('product_image_url is required')
        return normalized

    def _aspect_ratio_to_orientation(self, aspect_ratio: str | None) -> str:
        normalized = str(aspect_ratio or '').strip()
        if normalized == '16:9':
            return 'landscape'
        if normalized == '1:1':
            return 'square'
        return 'portrait'

    def _client(self) -> httpx.Client:
        if not str(self.settings.heygen_api_key or '').strip():
            raise RuntimeError('HEYGEN_API_KEY is not configured')
        return httpx.Client(
            headers={
                'X-Api-Key': str(self.settings.heygen_api_key).strip(),
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        )

    def _normalize_state(self, payload: dict[str, Any]) -> str:
        candidates = [
            payload.get('status'),
            payload.get('state'),
            payload.get('phase'),
            (payload.get('data') or {}).get('status') if isinstance(payload.get('data'), dict) else None,
            (payload.get('data') or {}).get('state') if isinstance(payload.get('data'), dict) else None,
        ]
        for item in candidates:
            normalized = str(item or '').strip().lower()
            if normalized:
                return normalized
        return ''

    def _extract_avatar_items(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        candidates = [
            payload.get('avatars'),
            payload.get('looks'),
            (payload.get('data') or {}).get('avatars') if isinstance(payload.get('data'), dict) else None,
            (payload.get('data') or {}).get('looks') if isinstance(payload.get('data'), dict) else None,
            payload.get('data') if isinstance(payload.get('data'), list) else None,
            payload.get('list') if isinstance(payload.get('list'), list) else None,
        ]
        for candidate in candidates:
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
        return []

    def _normalize_supported_avatar_item(
        self,
        item: dict[str, Any],
        *,
        avatar_type: str | None = None,
        ownership: str | None = None,
    ) -> dict[str, Any]:
        provider_avatar_id = self._extract_string(item, ('id',), ('avatar_id',), ('talking_photo_id',))
        if not provider_avatar_id:
            return {}
        preview_url = self._extract_string(
            item,
            ('preview_url',),
            ('preview_image_url',),
            ('thumbnail_url',),
            ('image_url',),
            ('photo_url',),
        )
        resolved_avatar_type = str(
            avatar_type
            or item.get('avatar_type')
            or item.get('type')
            or item.get('avatarType')
            or ''
        ).strip() or 'photo_avatar'
        resolved_ownership = str(
            ownership
            or item.get('ownership')
            or item.get('visibility')
            or ''
        ).strip() or ('public' if resolved_avatar_type == 'photo_avatar' else 'private')
        tags = ['preset', 'heygen', 'avatar', 'avatar_iv', resolved_avatar_type]
        if resolved_avatar_type == 'digital_twin':
            tags.append('digital_twin')
        return {
            'provider': 'heygen',
            'provider_api_version': 'v3',
            'provider_avatar_id': provider_avatar_id,
            'name': self._extract_string(item, ('name',), ('avatar_name',), ('title',)) or f'HeyGen Avatar {provider_avatar_id[-6:]}',
            'scope': 'public' if resolved_ownership == 'public' else 'own',
            'style': str(item.get('style') or 'heygen_avatar_iv').strip() or 'heygen_avatar_iv',
            'thumbnail_url': preview_url,
            'preview_url': preview_url,
            'primary_image': preview_url,
            'reference_images': [preview_url] if preview_url else [],
            'category': 'preset_avatar',
            'tags': list(dict.fromkeys([tag for tag in tags if tag])),
            'language_support': list(item.get('language_support') or ['en-IN']),
            'status': 'active',
            'source': 'heygen_avatar_iv',
            'avatar_family': 'avatar_iv',
            'avatar_type': resolved_avatar_type,
            'ownership': resolved_ownership,
            'supports_avatar_video_generation': True,
            'raw': item,
        }

    def _extract_string(self, payload: dict[str, Any], *paths: tuple[str, ...]) -> str | None:
        for path in paths:
            current: Any = payload
            for key in path:
                if not isinstance(current, dict):
                    current = None
                    break
                current = current.get(key)
            normalized = str(current or '').strip()
            if normalized:
                return normalized
        return None
