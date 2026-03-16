import json
import logging
import mimetypes
import subprocess
import tempfile
import urllib.error
import urllib.request
from base64 import b64decode
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.image_generation_repository import ImageGenerationRepository
from app.db.repositories.project_repository import ProjectRepository
from app.models.entities import ImageGeneration, ImageGenerationStatus
from app.providers.storage import build_storage_provider
from app.services.asset_tagging_service import AssetTaggingService
from app.services.fal_image_service import FalImageService
from app.services.firestore_sync_service import FirestoreSyncService
from app.services.generation_router import resolve_generation_route
from app.services.model_registry import get_model_definition, resolve_model_key
from app.services.smart_model_router import SmartModelRouter, TierModelConfig
from app.services.together_image_service import TogetherImageService

logger = logging.getLogger(__name__)


class GeminiNoImagePayloadError(RuntimeError):
    pass


@dataclass(frozen=True)
class ImageModelEntry:
    key: str
    label: str
    description: str
    frontend_hint: str
    provider: str
    badge: str
    logo_label: str
    alias_hint: str | None = None
    provider_id: str | None = None
    canonical_model_key: str | None = None
    mode_ids: tuple[str, ...] = ()
    billing_unit: str | None = None
    visible: bool = True


IMAGE_MODEL_REGISTRY: dict[str, ImageModelEntry] = {
    'gemini_flash_image': ImageModelEntry(
        key='gemini_flash_image',
        label='Gemini 3.1 Flash Image',
        description='Affordable, fast, and high-volume image generation for social posts, thumbnails, and everyday creative testing.',
        frontend_hint='Formerly surfaced as Nano Banana. Use this for fast, budget-safe image generation.',
        provider='Google',
        badge='Affordable',
        logo_label='G',
        alias_hint='Formerly Nano Banana',
        provider_id='gemini',
        canonical_model_key='gemini_flash_image',
        mode_ids=('fast_social',),
        billing_unit='per_image',
    ),
    'gemini_pro_image': ImageModelEntry(
        key='gemini_pro_image',
        label='Gemini 3 Pro Image',
        description='Premium Gemini path for sharper composition control and more professional asset creation.',
        frontend_hint='Use this when you want a higher-end Gemini result for polished campaign assets.',
        provider='Google',
        badge='Premium',
        logo_label='G',
        provider_id='gemini',
        canonical_model_key='gemini_pro_image',
        mode_ids=('creator_quality',),
        billing_unit='per_image',
    ),
    'openai_image': ImageModelEntry(
        key='openai_image',
        label='OpenAI Image',
        description='Reliable general-purpose premium image generation with dependable prompt-following and practical production quality.',
        frontend_hint='Use this for consistent premium outputs when you want the most proven general-purpose path.',
        provider='OpenAI',
        badge='Premium',
        logo_label='O',
        provider_id='openai',
        canonical_model_key='gpt_image_1_5',
        mode_ids=('creator_quality',),
        billing_unit='per_image',
    ),
    'recraft_studio': ImageModelEntry(
        key='recraft_studio',
        label='Recraft Studio',
        description='Design-first image generation for branded visuals, ad layouts, and polished creative assets.',
        frontend_hint='Mapped to Recraft V4 for design-heavy outputs, ads, and branding surfaces.',
        provider='Recraft',
        badge='Design',
        logo_label='R',
        provider_id='recraft',
        canonical_model_key='recraft',
        mode_ids=('design_carousel',),
        billing_unit='per_image',
    ),
    'recraft_studio_pro': ImageModelEntry(
        key='recraft_studio_pro',
        label='Recraft Studio Pro',
        description='Higher-end Recraft path for premium branded asset generation.',
        frontend_hint='Reserved for future premium Recraft V4 Pro exposure.',
        provider='Recraft',
        badge='Premium',
        logo_label='R',
        provider_id='recraft',
        canonical_model_key='recraft_studio_pro',
        mode_ids=('design_carousel',),
        billing_unit='per_image',
        visible=False,
    ),
    'budget_image_model': ImageModelEntry(
        key='budget_image_model',
        label='Fast Social',
        description='Primary Together AI route for affordable, fast social-first image generation.',
        frontend_hint='Recommended for quick social posts and high-volume affordable image generation.',
        provider='Together AI',
        badge='Economy',
        logo_label='T',
        provider_id='together',
        canonical_model_key='budget_image_model',
        mode_ids=('fast_social',),
        billing_unit='per_image',
        visible=False,
    ),
    'gpt_image_1_5': ImageModelEntry(
        key='gpt_image_1_5',
        label='GPT Image 1.5',
        description='Primary creator-quality route for polished ad creatives, thumbnails, and realistic outputs.',
        frontend_hint='Recommended when you want realistic premium image quality with strong prompt fidelity.',
        provider='OpenAI',
        badge='Creator quality',
        logo_label='O',
        provider_id='openai',
        canonical_model_key='gpt_image_1_5',
        mode_ids=('creator_quality',),
        billing_unit='per_image',
        visible=False,
    ),
    'recraft': ImageModelEntry(
        key='recraft',
        label='Recraft',
        description='Design and carousel oriented route for graphics, editorial layouts, and clean branding output.',
        frontend_hint='Recommended for carousels, infographics, and design-first assets.',
        provider='Recraft',
        badge='Design',
        logo_label='R',
        provider_id='recraft',
        canonical_model_key='recraft',
        mode_ids=('design_carousel',),
        billing_unit='per_image',
        visible=False,
    ),
    'nano_banana': ImageModelEntry(
        key='nano_banana',
        label='Nano Banana',
        description='Legacy alias for Gemini 3.1 Flash Image.',
        frontend_hint='Legacy alias',
        provider='Google',
        badge='Legacy',
        logo_label='G',
        visible=False,
    ),
}
IMAGE_MODEL_ALIASES = {
    'nano_banana': 'gemini_flash_image',
    'budget_image_model': 'budget_image_model',
    'gpt_image_1_5': 'gpt_image_1_5',
    'recraft': 'recraft',
}
INSPIRATION_ITEMS = [
    {
        'id': 'insp-1',
        'creator_name': 'Aarohi',
        'model_key': 'recraft_studio',
        'title': 'Monsoon Cafe Poster',
        'prompt': 'Warm Mumbai monsoon cafe poster with cinematic rain reflections and saffron highlights',
        'image_url': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        'aspect_ratio': '4:5',
        'resolution': '1536',
        'created_at': '2026-01-20T09:48:49Z',
        'reference_urls': [],
        'tags': ['monsoon', 'cafe', 'poster', 'cinematic', 'rain', 'warm tones'],
    },
    {
        'id': 'insp-2',
        'creator_name': 'Kabir',
        'model_key': 'gemini_flash_image',
        'title': 'Streetwear Launch Cover',
        'prompt': 'High-energy streetwear launch cover with neon accents and urban motion blur',
        'image_url': 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=1200&q=80',
        'aspect_ratio': '1:1',
        'resolution': '1024',
        'created_at': '2026-01-18T17:18:10Z',
        'reference_urls': [],
        'tags': ['streetwear', 'launch', 'cover art', 'urban', 'neon', 'social'],
    },
    {
        'id': 'insp-3',
        'creator_name': 'Meera',
        'model_key': 'recraft_studio',
        'title': 'Mythology Art Card',
        'prompt': 'Illustrated mythology portrait with regal gold accents and modern poster layout',
        'image_url': 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=1200&q=80',
        'aspect_ratio': '9:16',
        'resolution': '2048',
        'created_at': '2026-01-15T14:05:00Z',
        'reference_urls': ['https://example.com/reference-moodboard-1.jpg'],
        'tags': ['mythology', 'illustration', 'portrait', 'gold accents', 'poster'],
    },
    {
        'id': 'insp-4',
        'creator_name': 'Rohan',
        'model_key': 'openai_image',
        'title': 'Product Hero Scene',
        'prompt': 'Premium headphone product scene with soft shadows, minimal props, and luxury mood',
        'image_url': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80',
        'aspect_ratio': '16:9',
        'resolution': '1536',
        'created_at': '2026-01-12T11:30:00Z',
        'reference_urls': ['https://example.com/reference-product-shot.jpg', 'https://example.com/reference-lighting.jpg'],
        'tags': ['product', 'headphones', 'luxury', 'soft shadows', 'hero scene'],
    },
]


class ImageGenerationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ImageGenerationRepository(db)
        self.project_repo = ProjectRepository(db)
        self.tagging = AssetTaggingService(db)
        self.sync = FirestoreSyncService()
        self.output_dir = Path('data/image_generations')
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.settings = get_settings()
        self.storage = build_storage_provider(self.settings)
        self.together = TogetherImageService()
        self.fal_image = FalImageService()
        self.model_router = SmartModelRouter(
            tier_registry={
                'fast': TierModelConfig(
                    tier='fast',
                    current_model_id=self.settings.gemini_flash_image_model_primary or self.settings.gemini_image_model_primary,
                    status='stable',
                    fallback_model_id=self.settings.gemini_flash_image_model_fallback or self.settings.gemini_image_model_fallback,
                ),
                'pro': TierModelConfig(
                    tier='pro',
                    current_model_id=self.settings.gemini_pro_image_model_primary,
                    status='active',
                    fallback_model_id=self.settings.gemini_pro_image_model_fallback
                    or self.settings.gemini_flash_image_model_primary
                    or self.settings.gemini_image_model_primary,
                ),
            }
        )

    def list_models(self) -> list[ImageModelEntry]:
        return [model for model in IMAGE_MODEL_REGISTRY.values() if model.visible]

    def list_user_images(self, user_id: str, limit: int | None = None) -> list[ImageGeneration]:
        return self.repo.list_by_user(user_id, limit=limit)

    def list_inspiration(self) -> list[dict[str, object]]:
        return INSPIRATION_ITEMS

    def enhance_prompt(self, prompt: str, model_key: str | None = None) -> str:
        cleaned = prompt.strip()
        if not cleaned:
            return cleaned
        normalized_model_key = IMAGE_MODEL_ALIASES.get(model_key or '', model_key or '')

        if self.settings.openai_api_key:
            try:
                client = OpenAI(api_key=self.settings.openai_api_key)
                response = client.chat.completions.create(
                    model=self.settings.openai_model,
                    temperature=0.7,
                    messages=[
                        {
                            'role': 'system',
                            'content': (
                                'Rewrite image prompts for creator-grade image generation. '
                                'Return only one refined prompt sentence. Keep it under 50 words.'
                            ),
                        },
                        {
                            'role': 'user',
                            'content': (
                                f'Base prompt: {cleaned}\n'
                                f'Model: {model_key or "general"}\n'
                                'Make it more cinematic, detailed, visually rich, and commercially useful.'
                            ),
                        },
                    ],
                )
                refined = (response.choices[0].message.content or '').strip()
                if refined:
                    return refined
            except Exception as exc:
                logger.warning('image_prompt_enhance_fallback', extra={'error': str(exc), 'model_key': normalized_model_key})

        descriptors = {
            'gemini_flash_image': 'fast composition, social-ready framing, cinematic lighting',
            'gemini_pro_image': 'high-end Gemini detailing, refined depth, premium composition',
            'openai_image': 'reliable composition, polished scene structure, premium detail',
            'recraft_studio': 'illustrative composition, design-forward styling, rich color contrast',
        }
        suffix = descriptors.get(normalized_model_key, 'cinematic lighting, refined detail, premium composition')
        return f'{cleaned}, {suffix}, high detail, creator-grade output'

    def create_image(
        self,
        user_id: str,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
        project_id: str | None = None,
        mode_id: str | None = None,
        template_id: str | None = None,
    ) -> ImageGeneration:
        model_key = IMAGE_MODEL_ALIASES.get(model_key, model_key)
        model = IMAGE_MODEL_REGISTRY[model_key]
        route = resolve_generation_route(medium='image', model_key=model_key)
        image_url: str
        thumbnail_url: str
        provider_result = self._generate_with_router(
            model_key=model_key,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=reference_urls,
        )
        if provider_result:
            image_url, thumbnail_url = provider_result
        else:
            image_url, thumbnail_url = self._create_local_placeholder(
                model=model,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                reference_urls=reference_urls,
            )
        image_url, thumbnail_url = self._normalize_generated_outputs(
            user_id=user_id,
            model_key=model_key,
            image_url=image_url,
            thumbnail_url=thumbnail_url,
        )

        generation = self.repo.create(
            user_id=user_id,
            project_id=project_id,
            mode_id=mode_id,
            template_id=template_id,
            parent_image_id=None,
            model_key=model_key,
            canonical_model_key=route.canonical_model_key,
            provider_id=route.provider_id,
            provider_name=route.provider_label,
            billing_model_key=route.billing_model_key,
            billing_status='estimated',
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=json.dumps(reference_urls),
            image_url=image_url,
            thumbnail_url=thumbnail_url,
            action_type=None,
            status=ImageGenerationStatus.completed,
        )
        if project_id:
            self.project_repo.touch_generation(
                project_id,
                medium='image',
                prompt=prompt,
                thumbnail_url=thumbnail_url,
            )
        auto_tags: list[str] = []
        user_tags: list[str] = []
        tagging_status = 'skipped_no_db' if self.tagging.repo is None else 'persisted'
        try:
            auto_tags = self.tagging.auto_tag_image(generation)
            if self.tagging.repo is not None:
                auto_tags, user_tags = self.tagging.list_tags(generation.id, 'image')
                tagging_status = 'persisted'
            else:
                tagging_status = 'skipped_no_db'
        except Exception as exc:
            tagging_status = 'failed'
            logger.warning(
                'image_auto_tagging_non_fatal',
                extra={'render_id': generation.id, 'model_key': model_key, 'error': str(exc)},
            )
        setattr(generation, 'auto_tags', auto_tags)
        setattr(generation, 'user_tags', user_tags)
        setattr(generation, 'tagging_status', tagging_status)
        self.sync.sync_image(generation, auto_tags=auto_tags, user_tags=user_tags)
        logger.info('image_generation_created', extra={'render_id': generation.id, 'model_key': model_key})
        return generation

    def _generate_with_router(
        self,
        *,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
        attempted_models: set[str] | None = None,
    ) -> tuple[str, str] | None:
        model_key = IMAGE_MODEL_ALIASES.get(model_key, model_key)
        attempted = attempted_models or set()
        if model_key in attempted:
            raise RuntimeError(f'Image model fallback loop detected for {model_key}')
        attempted.add(model_key)
        route = resolve_generation_route(medium='image', model_key=model_key)
        canonical_key = resolve_model_key(model_key) or model_key

        if route.provider_id == 'together':
            logger.info(
                'image_generation_provider_selected',
                extra={
                    'provider': 'together',
                    'model_key': model_key,
                    'canonical_model_key': canonical_key,
                    'provider_model_key': route.provider_model_key,
                },
            )
            try:
                return self.together.generate(
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    reference_urls=reference_urls,
                )
            except Exception as exc:
                fallback = get_model_definition(route.fallback_model_key)
                logger.warning(
                    'image_generation_provider_fallback',
                    extra={
                        'provider': 'together',
                        'model_key': model_key,
                        'canonical_model_key': canonical_key,
                        'fallback_model_key': route.fallback_model_key,
                        'error': str(exc),
                    },
                )
                if fallback:
                    return self._generate_with_router(
                        model_key=fallback.model_key,
                        prompt=prompt,
                        aspect_ratio=aspect_ratio,
                        resolution=resolution,
                        reference_urls=reference_urls,
                        attempted_models=attempted,
                    )
                raise

        if route.provider_id == 'openai':
            if not self.settings.openai_api_key:
                fallback = get_model_definition(route.fallback_model_key)
                logger.warning(
                    'image_generation_provider_fallback',
                    extra={
                        'provider': 'openai_images',
                        'model_key': model_key,
                        'canonical_model_key': canonical_key,
                        'fallback_model_key': route.fallback_model_key,
                        'error': 'OPENAI_API_KEY is not configured for OpenAI image generation',
                    },
                )
                if fallback:
                    return self._generate_with_router(
                        model_key=fallback.model_key,
                        prompt=prompt,
                        aspect_ratio=aspect_ratio,
                        resolution=resolution,
                        reference_urls=reference_urls,
                        attempted_models=attempted,
                    )
                raise RuntimeError('OPENAI_API_KEY is not configured for OpenAI image generation')
            logger.info(
                'image_generation_provider_selected',
                extra={
                    'provider': 'openai_images',
                    'model_key': model_key,
                    'canonical_model_key': canonical_key,
                    'provider_model_key': route.provider_model_key,
                },
            )
            return self._generate_with_openai_image(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
            )

        if route.provider_id == 'gemini' and canonical_key in {'gemini_flash_image', 'gemini_pro_image'} and self.settings.gemini_api_key:
            tier = self.model_router.resolve_tier('fast' if model_key == 'gemini_flash_image' else 'pro')
            if tier:
                fallback_ids = [tier.fallback_model_id] if tier.fallback_model_id else []
                try:
                    route = self.model_router.resolve_and_execute(
                        requested_model_id=tier.current_model_id,
                        fallback_model_ids=[item for item in fallback_ids if item],
                        execute=lambda model_id: self._generate_with_gemini(
                            prompt=prompt,
                            aspect_ratio=aspect_ratio,
                            resolution=resolution,
                            model_id=model_id,
                        ),
                    )
                    if route.fallback_used:
                        logger.warning(
                            'image_generation_model_fallback_used',
                            extra={
                                'model_key': model_key,
                                'primary_model': tier.current_model_id,
                                'resolved_model': route.resolved_model_id,
                            },
                        )
                    else:
                        logger.info(
                            'image_generation_provider_selected',
                            extra={'provider': 'gemini', 'model_key': model_key, 'resolved_model': route.resolved_model_id},
                        )
                    return route.value
                except GeminiNoImagePayloadError as exc:
                    logger.warning(
                        'image_generation_gemini_no_image_payload',
                        extra={
                            'model_key': model_key,
                            'primary_model': tier.current_model_id,
                            'fallback_models': [item for item in fallback_ids if item],
                            'error': str(exc),
                        },
                    )
                    if self.settings.openai_api_key:
                        logger.warning(
                            'image_generation_provider_fallback_to_openai',
                            extra={'model_key': model_key, 'reason': 'gemini_no_image_payload'},
                        )
                        return self._generate_with_openai_image(
                            prompt=prompt,
                            aspect_ratio=aspect_ratio,
                            resolution=resolution,
                        )
                    raise
                except RuntimeError as exc:
                    if 'Gemini API HTTP 404' in str(exc) and self.settings.openai_api_key:
                        logger.warning(
                            'image_generation_provider_fallback_to_openai',
                            extra={'model_key': model_key, 'reason': 'gemini_model_not_found', 'error': str(exc)},
                        )
                        return self._generate_with_openai_image(
                            prompt=prompt,
                            aspect_ratio=aspect_ratio,
                            resolution=resolution,
                        )
                    raise

        if route.provider_id == 'recraft' and canonical_key in {'recraft', 'recraft_studio', 'recraft_studio_pro'}:
            selected_model_key = 'recraft_studio' if canonical_key == 'recraft' else model_key
            if self.settings.recraft_api_key:
                logger.info(
                    'image_generation_provider_selected',
                    extra={
                        'provider': 'recraft',
                        'model_key': model_key,
                        'canonical_model_key': canonical_key,
                        'provider_model_key': route.provider_model_key,
                    },
                )
                remote_url = self._generate_with_recraft(
                    model_key=selected_model_key,
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    reference_urls=reference_urls,
                )
                return remote_url, remote_url

            if self.settings.fal_api_key:
                logger.info(
                    'image_generation_provider_selected',
                    extra={
                        'provider': 'fal.ai',
                        'model_key': model_key,
                        'canonical_model_key': canonical_key,
                        'provider_model_key': selected_model_key,
                        'route': 'recraft-via-fal',
                    },
                )
                try:
                    width, height = self._together_dimensions(aspect_ratio, resolution)
                    remote_url = self.fal_image.generate_recraft(
                        model_key=selected_model_key,
                        prompt=prompt,
                        width=width,
                        height=height,
                        reference_urls=reference_urls,
                    )
                    return remote_url, remote_url
                except Exception as exc:
                    logger.warning(
                        'image_generation_provider_fallback',
                        extra={
                            'provider': 'fal.ai',
                            'model_key': model_key,
                            'canonical_model_key': canonical_key,
                            'fallback_model_key': route.fallback_model_key,
                            'error': str(exc),
                            'route': 'recraft-via-fal',
                        },
                    )

            fallback = get_model_definition(route.fallback_model_key)
            logger.warning(
                'image_generation_provider_fallback',
                extra={
                    'provider': 'recraft',
                    'model_key': model_key,
                    'canonical_model_key': canonical_key,
                    'fallback_model_key': route.fallback_model_key,
                    'error': 'RECRAFT_API_KEY and fal recraft route are unavailable',
                },
            )
            if fallback and fallback.model_key not in attempted:
                return self._generate_with_router(
                    model_key=fallback.model_key,
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    reference_urls=reference_urls,
                    attempted_models=attempted,
                )
            raise RuntimeError('Recraft image generation is unavailable. Configure RECRAFT_API_KEY or FAL_API_KEY with a valid Recraft endpoint.')

        return None

    def apply_action(self, user_id: str, generation_id: str, action: str) -> list[ImageGeneration]:
        generation = self.repo.get_by_id(generation_id)
        if generation is None or generation.user_id != user_id:
            raise ValueError('Image not found')

        match action:
            case 'remove_background':
                return [self.process_background_removal(generation)]
            case 'upscale':
                return [self.process_upscale(generation)]
            case 'variation':
                return self.process_variations(generation)
            case _:
                raise ValueError('Unsupported action')

    def process_background_removal(self, source: ImageGeneration) -> ImageGeneration:
        output_id = str(uuid4())
        output_file = self.output_dir / f'{output_id}.png'
        thumb_file = self.output_dir / f'{output_id}_thumb.png'
        source_path = self._resolve_source_path(source.image_url)

        if source_path and source_path.exists():
            self._run_ffmpeg_png(
                source_path=source_path,
                output_path=output_file,
                alpha=0.72,
            )
        else:
            self._write_placeholder_png(output_file, source.aspect_ratio)
        self._write_placeholder_png(thumb_file, source.aspect_ratio)
        image_url, thumbnail_url = self._store_local_generated_pair(
            user_id=source.user_id,
            model_key=source.model_key,
            output_file=output_file,
            thumb_file=thumb_file,
        )

        reference_urls = self._parse_reference_urls(source)
        item = self.repo.create(
            user_id=source.user_id,
            project_id=getattr(source, 'project_id', None),
            mode_id=getattr(source, 'mode_id', None),
            template_id=getattr(source, 'template_id', None),
            parent_image_id=source.id,
            model_key=source.model_key,
            prompt=source.prompt,
            aspect_ratio=source.aspect_ratio,
            resolution=source.resolution,
            reference_urls=json.dumps([source.image_url, *reference_urls]),
            image_url=image_url,
            thumbnail_url=thumbnail_url,
            action_type='remove_background',
            status=ImageGenerationStatus.completed,
        )
        self.tagging.auto_tag_image(item)
        auto_tags, user_tags = self.tagging.list_tags(item.id, 'image')
        self.sync.sync_image(item, auto_tags=auto_tags, user_tags=user_tags)
        return item

    def process_upscale(self, source: ImageGeneration) -> ImageGeneration:
        next_resolution = self._upscaled_resolution(source.aspect_ratio, source.resolution)
        reference_urls = self._parse_reference_urls(source)
        model = IMAGE_MODEL_REGISTRY[source.model_key]
        output_id = str(uuid4())
        output_file = self.output_dir / f'{output_id}.svg'
        thumb_file = self.output_dir / f'{output_id}_thumb.svg'

        output_file.write_text(
            self._build_svg(
                model=model,
                prompt=f'{source.prompt}. Ultra-detailed upscale, sharper textures, refined HD finish.',
                aspect_ratio=source.aspect_ratio,
                resolution=next_resolution,
                reference_urls=[source.image_url, *reference_urls],
                compact=False,
            ),
            encoding='utf-8',
        )
        thumb_file.write_text(
            self._build_svg(
                model=model,
                prompt=source.prompt,
                aspect_ratio=source.aspect_ratio,
                resolution=next_resolution,
                reference_urls=[source.image_url, *reference_urls],
                compact=True,
            ),
            encoding='utf-8',
        )
        image_url, thumbnail_url = self._store_local_generated_pair(
            user_id=source.user_id,
            model_key=source.model_key,
            output_file=output_file,
            thumb_file=thumb_file,
        )

        item = self.repo.create(
            user_id=source.user_id,
            project_id=getattr(source, 'project_id', None),
            mode_id=getattr(source, 'mode_id', None),
            template_id=getattr(source, 'template_id', None),
            parent_image_id=source.id,
            model_key=source.model_key,
            prompt=source.prompt,
            aspect_ratio=source.aspect_ratio,
            resolution=next_resolution,
            reference_urls=json.dumps([source.image_url, *reference_urls]),
            image_url=image_url,
            thumbnail_url=thumbnail_url,
            action_type='upscale',
            status=ImageGenerationStatus.completed,
        )
        self.tagging.auto_tag_image(item)
        auto_tags, user_tags = self.tagging.list_tags(item.id, 'image')
        self.sync.sync_image(item, auto_tags=auto_tags, user_tags=user_tags)
        return item

    def process_variations(self, source: ImageGeneration) -> list[ImageGeneration]:
        model = IMAGE_MODEL_REGISTRY[source.model_key]
        reference_urls = self._parse_reference_urls(source)
        base_seed_references = [source.image_url, *reference_urls]
        prompts = [
            f'{source.prompt}. Variation 1: warmer mood, softer contrast, slightly closer framing.',
            f'{source.prompt}. Variation 2: bolder lighting, cleaner composition, stronger focal subject.',
            f'{source.prompt}. Variation 3: premium editorial treatment, richer shadows, polished color balance.',
            f'{source.prompt}. Variation 4: more dramatic atmosphere, subtle motion energy, elevated visual depth.',
        ]
        items: list[ImageGeneration] = []
        for prompt in prompts:
            output_id = str(uuid4())
            output_file = self.output_dir / f'{output_id}.svg'
            thumb_file = self.output_dir / f'{output_id}_thumb.svg'
            output_file.write_text(
                self._build_svg(
                    model=model,
                    prompt=prompt,
                    aspect_ratio=source.aspect_ratio,
                    resolution=source.resolution,
                    reference_urls=base_seed_references,
                    compact=False,
                ),
                encoding='utf-8',
            )
            thumb_file.write_text(
                self._build_svg(
                    model=model,
                    prompt=prompt,
                    aspect_ratio=source.aspect_ratio,
                    resolution=source.resolution,
                    reference_urls=base_seed_references,
                    compact=True,
                ),
                encoding='utf-8',
            )
            image_url, thumbnail_url = self._store_local_generated_pair(
                user_id=source.user_id,
                model_key=source.model_key,
                output_file=output_file,
                thumb_file=thumb_file,
            )
            item = self.repo.create(
                user_id=source.user_id,
                project_id=getattr(source, 'project_id', None),
                mode_id=getattr(source, 'mode_id', None),
                template_id=getattr(source, 'template_id', None),
                parent_image_id=source.id,
                model_key=source.model_key,
                prompt=prompt,
                aspect_ratio=source.aspect_ratio,
                resolution=source.resolution,
                reference_urls=json.dumps(base_seed_references),
                image_url=image_url,
                thumbnail_url=thumbnail_url,
                action_type='variation',
                status=ImageGenerationStatus.completed,
            )
            self.tagging.auto_tag_image(item)
            auto_tags, user_tags = self.tagging.list_tags(item.id, 'image')
            self.sync.sync_image(item, auto_tags=auto_tags, user_tags=user_tags)
            items.append(item)
        return items

    def _build_svg(
        self,
        model: ImageModelEntry,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
        compact: bool,
    ) -> str:
        width, height = self._dimensions_for(aspect_ratio, compact)
        palette = self._palette_for(model.key)
        prompt_lines = self._wrap(prompt, 42 if compact else 50, 2 if compact else 4)
        lines_svg = []
        base_y = 220 if compact else 420
        step = 30 if compact else 46
        for index, line in enumerate(prompt_lines):
            lines_svg.append(
                f"<text x='48' y='{base_y + index * step}' fill='rgba(255,255,255,0.92)' font-size='{18 if compact else 30}' font-family='Arial Unicode MS, Arial, sans-serif'>{self._escape_xml(line)}</text>"
            )

        return f"""<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>
  <defs>
    <linearGradient id='bg' x1='0%' y1='0%' x2='100%' y2='100%'>
      <stop offset='0%' stop-color='{palette[0]}' />
      <stop offset='50%' stop-color='{palette[1]}' />
      <stop offset='100%' stop-color='{palette[2]}' />
    </linearGradient>
    <radialGradient id='glow' cx='50%' cy='30%' r='75%'>
      <stop offset='0%' stop-color='rgba(255,255,255,0.30)' />
      <stop offset='100%' stop-color='rgba(255,255,255,0)' />
    </radialGradient>
  </defs>
  <rect width='{width}' height='{height}' rx='36' fill='url(#bg)' />
  <rect width='{width}' height='{height}' fill='url(#glow)' />
  <circle cx='{width - 110}' cy='110' r='86' fill='rgba(255,255,255,0.08)' />
  <circle cx='{width - 170}' cy='{height - 170}' r='124' fill='rgba(255,255,255,0.06)' />
  <rect x='32' y='32' width='{width - 64}' height='{height - 64}' rx='28' fill='rgba(15,23,42,0.15)' stroke='rgba(255,255,255,0.22)' />
  <text x='48' y='72' fill='rgba(255,255,255,0.78)' font-size='{16 if compact else 24}' font-family='Arial Unicode MS, Arial, sans-serif'>RangManch AI Image Studio</text>
  <text x='48' y='{120 if compact else 170}' fill='white' font-size='{30 if compact else 56}' font-weight='700' font-family='Arial Unicode MS, Arial, sans-serif'>{self._escape_xml(model.label)}</text>
  <text x='48' y='{160 if compact else 216}' fill='rgba(255,255,255,0.80)' font-size='{16 if compact else 24}' font-family='Arial Unicode MS, Arial, sans-serif'>{self._escape_xml(model.frontend_hint)}</text>
  {''.join(lines_svg)}
  <rect x='48' y='{height - 110}' rx='18' ry='18' width='{180 if compact else 240}' height='{44 if compact else 56}' fill='rgba(255,255,255,0.12)' stroke='rgba(255,255,255,0.28)' />
  <text x='72' y='{height - 81 if compact else height - 73}' fill='white' font-size='{16 if compact else 22}' font-family='Arial Unicode MS, Arial, sans-serif'>{self._escape_xml(aspect_ratio)} • {self._escape_xml(resolution)}px</text>
  <text x='{width - 240 if compact else width - 320}' y='{height - 72}' fill='rgba(255,255,255,0.72)' font-size='{14 if compact else 20}' font-family='Arial Unicode MS, Arial, sans-serif'>Refs: {len(reference_urls)} • Model: {self._escape_xml(model.key)}</text>
</svg>"""

    def _create_local_placeholder(
        self,
        model: ImageModelEntry,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
    ) -> tuple[str, str]:
        svg_id = str(uuid4())
        output_file = self.output_dir / f'{svg_id}.svg'
        thumbnail_file = self.output_dir / f'{svg_id}_thumb.svg'
        output_file.write_text(
            self._build_svg(
                model=model,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                reference_urls=reference_urls,
                compact=False,
            ),
            encoding='utf-8',
        )
        thumbnail_file.write_text(
            self._build_svg(
                model=model,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                reference_urls=reference_urls,
                compact=True,
            ),
            encoding='utf-8',
        )
        return f'/static/image_generations/{output_file.name}', f'/static/image_generations/{thumbnail_file.name}'

    def _normalize_generated_outputs(
        self,
        *,
        user_id: str,
        model_key: str,
        image_url: str,
        thumbnail_url: str,
    ) -> tuple[str, str]:
        image_signed = self._store_generated_asset(
            user_id=user_id,
            model_key=model_key,
            source=image_url,
            suffix='image',
        )
        thumb_signed = self._store_generated_asset(
            user_id=user_id,
            model_key=model_key,
            source=thumbnail_url,
            suffix='thumb',
        )
        return image_signed.public_url, thumb_signed.public_url

    def _store_local_generated_pair(
        self,
        *,
        user_id: str,
        model_key: str,
        output_file: Path,
        thumb_file: Path,
    ) -> tuple[str, str]:
        image_signed = self._store_generated_asset(
            user_id=user_id,
            model_key=model_key,
            source=str(output_file),
            suffix='image',
        )
        thumb_signed = self._store_generated_asset(
            user_id=user_id,
            model_key=model_key,
            source=str(thumb_file),
            suffix='thumb',
        )
        return image_signed.public_url, thumb_signed.public_url

    def _store_generated_asset(self, *, user_id: str, model_key: str, source: str, suffix: str):
        content, filename, content_type = self._read_asset_source(source)
        return self.storage.upload_bytes(
            f'{model_key}-{suffix}{Path(filename).suffix or ""}',
            content,
            content_type=content_type,
            kind=f'users/{user_id}/generated/images',
        )

    def _read_asset_source(self, source: str) -> tuple[bytes, str, str]:
        if source.startswith('http://') or source.startswith('https://'):
            with urllib.request.urlopen(source, timeout=60) as response:
                content = response.read()
                filename = Path(getattr(response, 'url', source)).name or 'generated.bin'
                content_type = response.headers.get_content_type() or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
                return content, filename, content_type

        path = Path(source)
        if path.exists():
            return path.read_bytes(), path.name, mimetypes.guess_type(path.name)[0] or 'application/octet-stream'

        local_path = self._url_to_local_path(source)
        if local_path.exists():
            return local_path.read_bytes(), local_path.name, mimetypes.guess_type(local_path.name)[0] or 'application/octet-stream'

        raise FileNotFoundError(f'Could not resolve generated asset source: {source}')

    def _resolve_source_path(self, source_url: str) -> Path | None:
        local_path = self._url_to_local_path(source_url)
        if local_path.exists():
            return local_path
        if source_url.startswith('http://') or source_url.startswith('https://'):
            try:
                content, filename, _ = self._read_asset_source(source_url)
                ext = Path(filename).suffix or '.img'
                tmp_root = Path('data/tmp')
                tmp_root.mkdir(parents=True, exist_ok=True)
                temp_dir = Path(tempfile.mkdtemp(prefix='rangmanch-img-src-', dir=tmp_root))
                target = temp_dir / f'{uuid4()}{ext}'
                target.write_bytes(content)
                return target
            except Exception:
                return None
        return None

    def _dimensions_for(self, aspect_ratio: str, compact: bool) -> tuple[int, int]:
        matrix = {
            '9:16': (540, 960) if compact else (1080, 1920),
            '1:1': (640, 640) if compact else (1024, 1024),
            '16:9': (640, 360) if compact else (1280, 720),
            '4:5': (640, 800) if compact else (1200, 1500),
        }
        return matrix.get(aspect_ratio, (540, 960) if compact else (1080, 1920))

    def _palette_for(self, model_key: str) -> tuple[str, str, str]:
        palettes = {
            'gemini_flash_image': ('#f59e0b', '#f97316', '#7c3aed'),
            'gemini_pro_image': ('#0f172a', '#334155', '#c084fc'),
            'openai_image': ('#111827', '#1f2937', '#f59e0b'),
            'recraft_studio': ('#db2777', '#7c3aed', '#f59e0b'),
            'recraft_studio_pro': ('#7c3aed', '#1f2937', '#f59e0b'),
        }
        return palettes.get(model_key, ('#111827', '#334155', '#f59e0b'))

    def _wrap(self, text: str, width: int, max_lines: int) -> list[str]:
        words = text.split()
        lines: list[str] = []
        current = ''
        for word in words:
            candidate = f'{current} {word}'.strip()
            if len(candidate) <= width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
            if len(lines) == max_lines:
                break
        if current and len(lines) < max_lines:
            lines.append(current)
        if not lines:
            lines.append(text[:width])
        if len(lines) == max_lines and len(' '.join(words)) > sum(len(line) for line in lines):
            lines[-1] = f"{lines[-1][: max(0, width - 1)]}…"
        return lines

    def _escape_xml(self, value: str) -> str:
        return (
            value.replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;')
        )

    def _next_resolution(self, current: str) -> str:
        order = ['1024', '1536', '2048']
        try:
            index = order.index(current)
        except ValueError:
            return '2048'
        return order[min(index + 1, len(order) - 1)]

    def _generate_with_recraft(
        self,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
    ) -> str:
        width, height = self._together_dimensions(aspect_ratio, resolution)
        model_id = (
            self.settings.recraft_image_model_pro
            if model_key == 'recraft_studio_pro'
            else self.settings.recraft_image_model
        )
        payload: dict[str, object] = {
            'model': model_id,
            'prompt': prompt,
            'width': width,
            'height': height,
            'n': 1,
        }
        if reference_urls:
            payload['image_url'] = reference_urls[0]

        request = urllib.request.Request(
            url=f'{self.settings.recraft_api_base.rstrip("/")}/images/generations',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {self.settings.recraft_api_key}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode('utf-8')
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='ignore')
            raise RuntimeError(f'Recraft API HTTP {exc.code}: {detail[:400]}') from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f'Recraft API connection failed: {exc.reason}') from exc

        data = json.loads(raw)
        if not isinstance(data, dict):
            raise RuntimeError('Recraft API returned unexpected payload')

        candidates: list[object] = []
        if isinstance(data.get('data'), list):
            candidates.extend(data['data'])
        if isinstance(data.get('images'), list):
            candidates.extend(data['images'])
        if isinstance(data.get('output'), list):
            candidates.extend(data['output'])

        for item in candidates:
            if isinstance(item, dict):
                for key in ('url', 'image_url', 'imageUrl'):
                    url = item.get(key)
                    if url:
                        return str(url)

        for key in ('url', 'image_url', 'imageUrl'):
            value = data.get(key)
            if value:
                return str(value)

        raise RuntimeError(f'Recraft API returned no image URL: {raw[:500]}')

    def _generate_with_gemini(
        self,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        model_id: str,
    ) -> tuple[str, str]:
        image_id = str(uuid4())
        output_file = self.output_dir / f'{image_id}.png'
        thumb_file = self.output_dir / f'{image_id}_thumb.png'

        payload = {
            'contents': [
                {
                    'parts': [
                        {
                            'text': (
                                f'{prompt}. Create a high-quality image output with aspect ratio {aspect_ratio} '
                                f'and resolution target around {resolution}px.'
                            )
                        }
                    ]
                }
            ],
            'generationConfig': {
                'responseModalities': ['TEXT', 'IMAGE'],
            },
        }
        request = urllib.request.Request(
            url=f'{self.settings.gemini_api_base.rstrip("/")}/models/{model_id}:generateContent',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'x-goog-api-key': str(self.settings.gemini_api_key),
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode('utf-8')
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='ignore')
            raise RuntimeError(f'Gemini API HTTP {exc.code}: {detail[:400]}') from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f'Gemini API connection failed: {exc.reason}') from exc

        data = json.loads(raw)
        candidates = data.get('candidates') or []
        inline_data = None
        part_kinds: list[str] = []
        text_preview = ''
        for candidate in candidates:
            content = candidate.get('content', {})
            parts = content.get('parts') or []
            for part in parts:
                if 'inlineData' in part:
                    part_kinds.append('inlineData')
                elif 'text' in part:
                    part_kinds.append('text')
                    if not text_preview:
                        text_preview = str(part.get('text') or '')[:240]
                else:
                    part_kinds.append(','.join(sorted(part.keys())) or 'unknown')
                if 'inlineData' in part:
                    inline_data = part.get('inlineData')
                    break
            if inline_data:
                break
        if not inline_data:
            logger.warning(
                'provider_poll_status',
                extra={
                    'provider': 'gemini',
                    'model_id': model_id,
                    'candidate_count': len(candidates),
                    'part_kinds': part_kinds[:12],
                    'text_preview': text_preview,
                },
            )
            raise GeminiNoImagePayloadError(
                f'Gemini API returned no image payload (model={model_id}, parts={part_kinds[:12]}, text_preview={text_preview!r})'
            )

        mime_type = inline_data.get('mimeType')
        image_bytes = b64decode(inline_data.get('data', ''))
        if not image_bytes:
            raise RuntimeError('Gemini API returned empty image data')

        suffix = '.png'
        if mime_type == 'image/jpeg':
            suffix = '.jpg'
        if suffix != '.png':
            output_file = output_file.with_suffix(suffix)
            thumb_file = thumb_file.with_suffix(suffix)

        output_file.write_bytes(image_bytes)
        thumb_file.write_bytes(image_bytes)
        return (
            f'/static/image_generations/{output_file.name}',
            f'/static/image_generations/{thumb_file.name}',
        )

    def _generate_with_openai_image(
        self,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
    ) -> tuple[str, str]:
        image_id = str(uuid4())
        size = self._openai_image_size(aspect_ratio, resolution)
        client = OpenAI(api_key=self.settings.openai_api_key)
        response = client.images.generate(
            model=self.settings.openai_image_model,
            prompt=(
                f'{prompt}. Create a polished creator-grade image with aspect ratio {aspect_ratio} '
                f'optimized for {resolution}px output.'
            ),
            size=size,
        )

        if not response.data:
            raise RuntimeError('OpenAI Image returned no image data')

        image_base64 = getattr(response.data[0], 'b64_json', None)
        image_url = getattr(response.data[0], 'url', None)
        output_file = self.output_dir / f'{image_id}.png'
        thumb_file = self.output_dir / f'{image_id}_thumb.png'

        if image_base64:
            image_bytes = b64decode(image_base64)
            output_file.write_bytes(image_bytes)
            thumb_file.write_bytes(image_bytes)
            return (
                f'/static/image_generations/{output_file.name}',
                f'/static/image_generations/{thumb_file.name}',
            )

        if image_url:
            return (str(image_url), str(image_url))

        raise RuntimeError('OpenAI Image returned neither base64 data nor URL')

    def _together_dimensions(self, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        base = int(resolution) if resolution.isdigit() else 1024
        if aspect_ratio == '9:16':
            return (max(512, round(base * 9 / 16)), base)
        if aspect_ratio == '16:9':
            return (base, max(512, round(base * 9 / 16)))
        if aspect_ratio == '4:5':
            return (max(512, round(base * 4 / 5)), base)
        return (base, base)

    def _openai_image_size(self, aspect_ratio: str, resolution: str) -> str:
        target = int(resolution) if resolution.isdigit() else 1024
        if aspect_ratio in {'9:16', '4:5'}:
            return '1024x1536'
        if aspect_ratio == '16:9':
            return '1536x1024'
        if target >= 1536:
            return '1536x1024' if aspect_ratio == '16:9' else '1024x1536' if aspect_ratio in {'9:16', '4:5'} else '1024x1024'
        return '1024x1024'

    def _upscaled_resolution(self, aspect_ratio: str, current: str) -> str:
        dims = self._dimensions_for(aspect_ratio, compact=False)
        try:
            numeric = int(current)
        except ValueError:
            numeric = max(dims)
        base = max(dims)
        factor = 2 if numeric < 2048 else 4
        scaled = tuple(value * factor for value in dims)
        return f'{scaled[0]}x{scaled[1]}' if base else '2048x2048'

    def _parse_reference_urls(self, generation: ImageGeneration) -> list[str]:
        try:
            return json.loads(generation.reference_urls or '[]')
        except json.JSONDecodeError:
            return []

    def _url_to_local_path(self, url: str) -> Path:
        normalized = url.strip()
        if normalized.startswith('/static/'):
            normalized = normalized.replace('/static/', '', 1)
        return Path('data') / normalized

    def _run_ffmpeg_png(self, source_path: Path, output_path: Path, alpha: float) -> None:
        result = subprocess.run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(source_path),
                '-vf',
                f'format=rgba,colorchannelmixer=aa={alpha:.2f}',
                '-frames:v',
                '1',
                str(output_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            self._write_placeholder_png(output_path, '1:1')

    def _write_placeholder_png(self, output_path: Path, aspect_ratio: str) -> None:
        width, height = self._dimensions_for(aspect_ratio, compact=True)
        result = subprocess.run(
            [
                'ffmpeg',
                '-y',
                '-f',
                'lavfi',
                '-i',
                f'color=c=black@0.0:s={width}x{height}:d=0.1',
                '-frames:v',
                '1',
                str(output_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            output_path.write_bytes(
                b64decode(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg=='
                )
            )
