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


@dataclass(frozen=True)
class ModelRegistryEntry:
    key: str
    label: str
    description: str
    frontend_hint: str
    api_adapter: str


@dataclass
class ProviderResult:
    provider_name: str
    video_url: str
    model_key: str
    model_label: str
    model_hint: str
    duration: int
    quality: str
    metadata: dict[str, Any]


class AIVideoOrchestrator:
    # Frontend can call list_models() to populate dropdowns/cards with:
    # - label: human-readable choice
    # - description: short best-use-case text
    # - frontend_hint: concise "why choose this" helper copy
    MODEL_REGISTRY: dict[str, ModelRegistryEntry] = {
        'sora2_pro': ModelRegistryEntry(
            key='sora2_pro',
            label='Sora 2 Pro',
            description='Best for narrative social clips with realistic motion, polished continuity, and creator-friendly storytelling.',
            frontend_hint='Use this for premium reels that need believable motion and strong story flow.',
            api_adapter='generate_with_sora2_pro',
        ),
        'veo3_1': ModelRegistryEntry(
            key='veo3_1',
            label='Veo 3.1',
            description='Best for cinematic visuals, longer narrative beats, and refined creative control across scenes.',
            frontend_hint='Use this for cinematic campaigns, ad films, and visually rich branded videos.',
            api_adapter='generate_with_veo3_1',
        ),
        'kling2_1': ModelRegistryEntry(
            key='kling2_1',
            label='Kling 2.1',
            description='Best for fast, stylized, and visually artistic clips where speed and visual flair matter most.',
            frontend_hint='Use this for trend-led content, stylized promos, and quick creative drafts.',
            api_adapter='generate_with_kling2_1',
        ),
        'luma_style': ModelRegistryEntry(
            key='luma_style',
            label='Luma Style',
            description='Best for experimental, mood-driven, and concept-heavy outputs where exploration beats strict realism.',
            frontend_hint='Use this for prototype concepts, mood videos, and exploratory creative directions.',
            api_adapter='generate_with_luma_style',
        ),
    }

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.pipeline = VideoPipelineService()
        self.metadata_dir = Path('data/ai_video_generations')
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.providers = {
            'sora2_pro': self.generate_with_sora2_pro,
            'veo3_1': self.generate_with_veo3_1,
            'kling2_1': self.generate_with_kling2_1,
            'luma_style': self.generate_with_luma_style,
        }

    def list_models(self) -> list[ModelRegistryEntry]:
        return list(self.MODEL_REGISTRY.values())

    def generate(self, payload: dict[str, Any]) -> ProviderResult:
        selected = payload['selectedModel']
        registry_entry = self.MODEL_REGISTRY.get(selected)
        adapter = self.providers.get(selected)
        if registry_entry is None or adapter is None:
            raise ProviderError(f'Unsupported model: {selected}')

        try:
            result = adapter(payload, registry_entry)
        except Exception as exc:
            logger.warning(
                'ai_video_provider_failed',
                extra={'provider': selected, 'error': str(exc)},
            )
            result = self._generate_with_fallback(payload, registry_entry, source_error=str(exc))

        self._store_metadata(payload=payload, result=result)
        return result

    def generate_with_sora2_pro(self, payload: dict[str, Any], model: ModelRegistryEntry) -> ProviderResult:
        # Real integration point:
        # Call OpenAI Sora / orchestration layer here with script, voice, bgm, aspect ratio, and resolution.
        if not self.settings.openai_api_key:
            raise ProviderError('OPENAI_API_KEY is not configured')
        request_payload = {
            'script': payload['script'],
            'voice': payload.get('voice'),
            'bgm': payload.get('bgm'),
            'aspect_ratio': payload['aspectRatio'],
            'resolution': payload['resolution'],
            'duration_mode': payload['durationMode'],
        }
        return ProviderResult(
            provider_name='OpenAI',
            video_url=self._mock_remote_video_url(model.key),
            model_key=model.key,
            model_label=model.label,
            model_hint=model.frontend_hint,
            duration=40,
            quality=payload['resolution'],
            metadata={'request': request_payload, 'adapter': model.api_adapter},
        )

    def generate_with_veo3_1(self, payload: dict[str, Any], model: ModelRegistryEntry) -> ProviderResult:
        # Real integration point:
        # Call Google Veo 3.1 / Vertex AI video generation here.
        request_payload = {
            'prompt': payload['script'],
            'voice': payload.get('voice'),
            'bgm': payload.get('bgm'),
            'aspect_ratio': payload['aspectRatio'],
            'resolution': payload['resolution'],
            'duration_mode': payload['durationMode'],
        }
        raise ProviderError('Veo 3.1 adapter is not connected yet')

    def generate_with_kling2_1(self, payload: dict[str, Any], model: ModelRegistryEntry) -> ProviderResult:
        # Real integration point:
        # Call Kling 2.1 API here for fast stylized rendering.
        request_payload = {
            'prompt': payload['script'],
            'voice': payload.get('voice'),
            'aspect_ratio': payload['aspectRatio'],
            'resolution': payload['resolution'],
            'duration_mode': payload['durationMode'],
            'bgm': payload.get('bgm'),
        }
        raise ProviderError(f'Kling 2.1 adapter is not connected yet: {json.dumps(request_payload)[:80]}')

    def generate_with_luma_style(self, payload: dict[str, Any], model: ModelRegistryEntry) -> ProviderResult:
        # Real integration point:
        # Call Luma / experimental text-to-video provider here.
        request_payload = {
            'prompt': payload['script'],
            'voice': payload.get('voice'),
            'aspect_ratio': payload['aspectRatio'],
            'resolution': payload['resolution'],
            'duration_mode': payload['durationMode'],
            'bgm': payload.get('bgm'),
        }
        raise ProviderError(f'Luma Style adapter is not connected yet: {json.dumps(request_payload)[:80]}')

    def _generate_with_fallback(
        self,
        payload: dict[str, Any],
        model: ModelRegistryEntry,
        source_error: str | None = None,
    ) -> ProviderResult:
        render_id = str(uuid4())
        output_path, _ = self.pipeline.build_video(
            render_id=render_id,
            script=payload['script'],
            include_broll=False,
        )
        path = Path(output_path)
        video_url = f'/static/renders/{path.name}'
        return ProviderResult(
            provider_name='Fallback Local',
            video_url=video_url,
            model_key=model.key,
            model_label=model.label,
            model_hint=model.frontend_hint,
            duration=12,
            quality=payload['resolution'],
            metadata={
                'fallback_reason': source_error,
                'requested_model': model.key,
                'adapter': model.api_adapter,
                'voice': payload.get('voice'),
                'bgm': payload.get('bgm'),
            },
        )

    def _mock_remote_video_url(self, model_key: str) -> str:
        return f'https://example.com/generated/{model_key}/{uuid4()}.mp4'

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
            'provider_name': result.provider_name,
            'video_url': result.video_url,
            'model_key': result.model_key,
            'model_label': result.model_label,
            'model_hint': result.model_hint,
            'duration': result.duration,
            'quality': result.quality,
            'request': payload,
            'metadata': result.metadata,
        }
        target = self.metadata_dir / f'{uuid4()}.json'
        target.write_text(json.dumps(record, indent=2), encoding='utf-8')
