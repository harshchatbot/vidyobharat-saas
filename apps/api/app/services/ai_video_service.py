import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import Settings
from app.services.video_pipeline import VideoPipelineService

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    pass


@dataclass
class ProviderResult:
    video_url: str
    provider: str
    duration: int
    quality: str
    metadata: dict[str, Any]


class AIVideoOrchestrator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.pipeline = VideoPipelineService()
        self.metadata_dir = Path('data/ai_video_generations')
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.providers = {
            'heygen': self._generate_with_heygen,
            'runway': self._generate_with_runway,
            'genericTextVideoAPI': self._generate_with_generic_provider,
            'fallback': self._generate_with_fallback,
        }

    def generate(self, payload: dict[str, Any]) -> ProviderResult:
        selected = payload['selectedModel']
        adapter = self.providers.get(selected)
        if adapter is None:
            raise ProviderError(f'Unsupported provider: {selected}')

        try:
            result = adapter(payload)
        except Exception as exc:
            logger.warning(
                'ai_video_provider_failed',
                extra={'provider': selected, 'error': str(exc)},
            )
            if selected == 'fallback':
                raise
            result = self._generate_with_fallback(payload, source_error=str(exc), source_provider=selected)

        self._store_metadata(payload=payload, result=result)
        return result

    def _generate_with_heygen(self, payload: dict[str, Any]) -> ProviderResult:
        if not self.settings.heygen_api_key:
            raise ProviderError('HEYGEN_API_KEY is not configured')
        request_payload = {
            'title': payload['topic'],
            'script': payload['topic'],
            'voice': payload.get('voice'),
            'language': payload['language'],
            'style': payload['templateId'],
            'tone': payload['tone'],
            'reference_images': payload.get('referenceImages', []),
        }
        raw = self._post_json(
            url=f'{self.settings.heygen_api_base.rstrip("/")}/v2/video/generate',
            api_key=self.settings.heygen_api_key,
            payload=request_payload,
            header_name='X-Api-Key',
        )
        video_url = raw.get('video_url') or raw.get('data', {}).get('video_url')
        if not video_url:
            raise ProviderError('HeyGen response did not include video_url')
        return ProviderResult(
            video_url=video_url,
            provider='heygen',
            duration=int(raw.get('duration') or 40),
            quality=str(raw.get('quality') or '1080p'),
            metadata={'request': request_payload, 'raw': raw},
        )

    def _generate_with_runway(self, payload: dict[str, Any]) -> ProviderResult:
        if not self.settings.runway_api_key:
            raise ProviderError('RUNWAY_API_KEY is not configured')
        prompt = f"{payload['topic']} | tone: {payload['tone']} | language: {payload['language']}"
        request_payload = {
            'promptText': prompt,
            'model': 'gen3a_turbo',
            'duration': 10,
            'referenceImages': payload.get('referenceImages', []),
        }
        raw = self._post_json(
            url=f'{self.settings.runway_api_base.rstrip("/")}/v1/text_to_video',
            api_key=self.settings.runway_api_key,
            payload=request_payload,
            header_name='Authorization',
            bearer=True,
        )
        video_url = raw.get('video_url') or raw.get('output', {}).get('video_url') or raw.get('url')
        if not video_url:
            raise ProviderError('Runway response did not include video_url')
        return ProviderResult(
            video_url=video_url,
            provider='runway',
            duration=int(raw.get('duration') or 10),
            quality=str(raw.get('quality') or '1080p'),
            metadata={'request': request_payload, 'raw': raw},
        )

    def _generate_with_generic_provider(self, payload: dict[str, Any]) -> ProviderResult:
        if not self.settings.generic_text_video_api_key:
            raise ProviderError('GENERIC_TEXT_VIDEO_API_KEY is not configured')
        request_payload = {
            'template': payload['templateId'],
            'topic': payload['topic'],
            'tone': payload['tone'],
            'language': payload['language'],
            'voice': payload.get('voice'),
            'referenceImages': payload.get('referenceImages', []),
        }
        raw = self._post_json(
            url=f'{self.settings.generic_text_video_api_base.rstrip("/")}/video/generate',
            api_key=self.settings.generic_text_video_api_key,
            payload=request_payload,
            header_name='Authorization',
            bearer=True,
        )
        video_url = raw.get('videoUrl') or raw.get('video_url') or raw.get('data', {}).get('videoUrl')
        if not video_url:
            raise ProviderError('Generic provider response did not include video URL')
        return ProviderResult(
            video_url=video_url,
            provider='genericTextVideoAPI',
            duration=int(raw.get('duration') or 30),
            quality=str(raw.get('quality') or '1080p'),
            metadata={'request': request_payload, 'raw': raw},
        )

    def _generate_with_fallback(
        self,
        payload: dict[str, Any],
        source_error: str | None = None,
        source_provider: str | None = None,
    ) -> ProviderResult:
        render_id = str(uuid4())
        output_path, _ = self.pipeline.build_video(
            render_id=render_id,
            script=f"{payload['templateId']} | {payload['topic']} | {payload['tone']} | {payload['language']}",
            include_broll=False,
        )
        path = Path(output_path)
        video_url = f"/static/renders/{path.name}"
        return ProviderResult(
            video_url=video_url,
            provider='fallback',
            duration=12,
            quality='720p',
            metadata={
                'fallback_reason': source_error,
                'requested_provider': source_provider or payload['selectedModel'],
                'template': payload['templateId'],
                'voice': payload.get('voice'),
            },
        )

    def _post_json(
        self,
        url: str,
        api_key: str,
        payload: dict[str, Any],
        header_name: str,
        bearer: bool = False,
    ) -> dict[str, Any]:
        headers = {
            'Content-Type': 'application/json',
            header_name: f'Bearer {api_key}' if bearer else api_key,
        }
        body = json.dumps(payload).encode('utf-8')
        request = urllib.request.Request(url=url, data=body, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode('utf-8')
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='ignore')
            raise ProviderError(f'Provider HTTP {exc.code}: {detail[:300]}') from exc
        except urllib.error.URLError as exc:
            raise ProviderError(f'Provider connection failed: {exc.reason}') from exc

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProviderError('Provider returned invalid JSON') from exc
        if not isinstance(data, dict):
            raise ProviderError('Provider returned unexpected payload')
        return data

    def _store_metadata(self, payload: dict[str, Any], result: ProviderResult) -> None:
        record = {
            'provider': result.provider,
            'video_url': result.video_url,
            'duration': result.duration,
            'quality': result.quality,
            'request': payload,
            'metadata': result.metadata,
        }
        target = self.metadata_dir / f'{uuid4()}.json'
        target.write_text(json.dumps(record, indent=2), encoding='utf-8')
