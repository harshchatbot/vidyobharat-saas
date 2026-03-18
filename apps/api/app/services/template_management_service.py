from __future__ import annotations

import logging
import mimetypes
import re
from typing import Any

from fastapi import UploadFile

from app.core.config import get_settings
from app.db.firestore_utils import utcnow
from app.db.repositories.template_repository import TemplateRepository
from app.models.entities import ImageGenerationStatus
from app.providers.storage import build_storage_provider
from app.schemas.catalog import TemplateResponse
from app.schemas.project import CreateProjectRequest
from app.schemas.template_management import (
    TemplateGenerateRequest,
    TemplateGenerateResponse,
    TemplatePreviewResponse,
    TemplateRecommendedModel,
    TemplateUpsertRequest,
    UnifiedTemplateResponse,
)
from app.services.ai_video_service import AIVideoCreateService, ProviderError
from app.services.credit_service import CreditCapExceededError, CreditService, InsufficientCreditsError
from app.services.hero_template_registry import (
    get_hero_template_documents,
    get_recommended_model_mode,
    resolve_legacy_template_mapping,
)
from app.services.image_generation_service import ImageGenerationService
from app.services.project_service import ProjectService
from app.services.template_prompt_assembler import TemplatePromptAssembler, get_recommended_model_display

logger = logging.getLogger(__name__)


class TemplateManagementService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repo = TemplateRepository()
        self.credit_service = CreditService()
        self.storage = build_storage_provider(self.settings)
        self.assembler = TemplatePromptAssembler()
        self.project_service = ProjectService(None)
        self._seeded = False

    def list_templates(
        self,
        *,
        type: str | None = None,
        category: str | None = None,
        trending: bool | None = None,
        featured: bool | None = None,
        active: bool | None = None,
        aspect_ratio: str | None = None,
        search: str | None = None,
        include_inactive: bool = False,
        type_default_for_legacy: str | None = None,
    ) -> list[UnifiedTemplateResponse]:
        self._ensure_seeded()
        rows = self.repo.list() or self._seed_templates()
        normalized_type = (type or type_default_for_legacy or '').strip().lower() or None
        normalized_category = (category or '').strip().lower() or None
        normalized_ratio = (aspect_ratio or '').strip().lower() or None
        keyword = (search or '').strip().lower()
        result: list[UnifiedTemplateResponse] = []
        for row in rows:
            if normalized_type and row['type'] != normalized_type:
                continue
            if normalized_category and str(row['category']).lower() != normalized_category:
                continue
            if normalized_ratio and str(row.get('aspect_ratio') or '').lower() != normalized_ratio:
                continue
            if trending is not None and bool(row.get('trending', False)) != trending:
                continue
            if featured is not None and bool(row.get('featured', False)) != featured:
                continue
            if active is not None and bool(row.get('active', True)) != active:
                continue
            if not include_inactive and not bool(row.get('active', True)):
                continue
            if keyword:
                haystack = ' '.join(
                    str(row.get(key) or '')
                    for key in ('name', 'title', 'description', 'short_description', 'category', 'subcategory', 'slug')
                ).lower()
                if keyword not in haystack:
                    continue
            result.append(self._to_unified_template(row))
        result.sort(key=lambda item: (-int(item.is_featured), -int(item.trending), item.order, item.name.lower()))
        return result

    def list_legacy_templates(self, *, search: str | None = None, category: str | None = None, aspect_ratio: str | None = None) -> list[TemplateResponse]:
        items = self.list_templates(
            type='video',
            search=search,
            category=category,
            aspect_ratio=aspect_ratio,
            include_inactive=False,
            type_default_for_legacy='video',
        )
        return [TemplateResponse.model_validate(item.model_dump()) for item in items]

    def get_template(self, template_id: str, *, include_inactive: bool = False) -> UnifiedTemplateResponse | None:
        self._ensure_seeded()
        row = self.repo.get(template_id)
        if not row:
            legacy_template_id = resolve_legacy_template_mapping(template_id)
            if legacy_template_id and legacy_template_id != template_id:
                row = self.repo.get(legacy_template_id)
        if not row:
            for seed in self._seed_templates():
                if seed['id'] == template_id:
                    row = seed
                    break
                legacy_template_id = resolve_legacy_template_mapping(template_id)
                if legacy_template_id and seed['id'] == legacy_template_id:
                    row = seed
                    break
        if not row:
            return None
        if not include_inactive and not bool(row.get('active', True)):
            return None
        return self._to_unified_template(row)

    def create_template(self, payload: TemplateUpsertRequest, *, created_by: str) -> UnifiedTemplateResponse:
        template_id = payload.id or payload.slug
        now = utcnow()
        stored = self.repo.upsert(
            template_id,
            {
                **payload.model_dump(mode='python'),
                'id': template_id,
                'created_by': created_by,
                'source': 'firestore',
                'created_at': now,
                'updated_at': now,
            },
            merge=False,
        )
        return self._to_unified_template(stored)

    def update_template(self, template_id: str, payload: TemplateUpsertRequest, *, updated_by: str) -> UnifiedTemplateResponse:
        existing = self.repo.get(template_id)
        if not existing:
            raise ValueError('Template not found')
        stored = self.repo.upsert(
            template_id,
            {
                **payload.model_dump(mode='python'),
                'id': template_id,
                'created_by': existing.get('created_by') or updated_by,
                'source': 'firestore',
                'updated_at': utcnow(),
            },
        )
        return self._to_unified_template(stored)

    def update_status(self, template_id: str, *, active: bool, trending: bool | None = None, featured: bool | None = None) -> UnifiedTemplateResponse:
        existing = self.repo.get(template_id)
        if not existing:
            raise ValueError('Template not found')
        payload: dict[str, Any] = {'active': active, 'updated_at': utcnow()}
        if trending is not None:
            payload['trending'] = trending
        if featured is not None:
            payload['featured'] = featured
        return self._to_unified_template(self.repo.upsert(template_id, payload))

    def delete_template(self, template_id: str) -> UnifiedTemplateResponse:
        stored = self.repo.soft_delete(template_id)
        if not stored:
            raise ValueError('Template not found')
        return self._to_unified_template(stored)

    def upload_preview_media(self, *, file: UploadFile, kind: str = 'template-preview') -> str:
        content = file.file.read()
        if not content:
            raise ValueError('Uploaded file is empty')
        filename = file.filename or f'{kind}.bin'
        content_type = file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        uploaded = self.storage.upload_bytes(filename, content, content_type=content_type, kind=kind)
        return uploaded.public_url

    def generate_from_template(self, *, user_id: str, payload: TemplateGenerateRequest) -> TemplateGenerateResponse:
        template = self.get_template(payload.template_id)
        if not template:
            raise ValueError('Template not found')
        if not template.active:
            raise ValueError('Template is inactive')
        assembly = self.assembler.assemble(
            template=template,
            raw_inputs=payload.inputs,
            prompt_override=payload.prompt_override,
        )
        project_id = payload.project_id or self._ensure_template_project(
            user_id=user_id,
            template=template,
            payload=payload,
            prompt=assembly.master_prompt,
            script_preview=assembly.script_preview,
        )
        if template.type == 'image':
            return self._generate_image_from_template(
                user_id=user_id,
                template=template,
                payload=payload,
                prompt=assembly.image_prompt or assembly.master_prompt,
                project_id=project_id,
            )
        return self._generate_video_from_template(
            user_id=user_id,
            template=template,
            payload=payload,
            prompt=assembly.video_prompt or assembly.master_prompt,
            script_preview=assembly.script_preview,
            recommended_model_mode=assembly.recommended_model_mode,
            project_id=project_id,
        )

    def preview_template(self, payload: TemplateGenerateRequest) -> TemplatePreviewResponse:
        template = self.get_template(payload.template_id)
        if not template:
            raise ValueError('Template not found')
        assembly = self.assembler.assemble(
            template=template,
            raw_inputs=payload.inputs,
            prompt_override=payload.prompt_override,
        )
        recommended_model_payload = get_recommended_model_display(assembly.recommended_model_mode) or {}
        if isinstance(recommended_model_payload, TemplateRecommendedModel):
            recommended_model = recommended_model_payload
        elif isinstance(recommended_model_payload, dict):
            recommended_model = TemplateRecommendedModel(**recommended_model_payload)
        else:
            recommended_model = TemplateRecommendedModel()
        return TemplatePreviewResponse(
            template_id=template.id,
            content_type=template.type,
            prompt_preview=(assembly.master_prompt or '').strip(),
            script_preview=assembly.script_preview,
            recommended_model=recommended_model,
        )

    def _generate_image_from_template(
        self,
        *,
        user_id: str,
        template: UnifiedTemplateResponse,
        payload: TemplateGenerateRequest,
        prompt: str,
        project_id: str | None,
    ) -> TemplateGenerateResponse:
        model_key = payload.model_key or template.generation_defaults.model_key or self._default_model_for_mode(template.default_model_mode) or 'gemini_flash_image'
        aspect_ratio = payload.aspect_ratio or template.generation_defaults.aspect_ratio or template.aspect_ratio or '4:5'
        resolution = payload.resolution or template.generation_defaults.resolution or '1536'
        request_payload = {
            'model_key': model_key,
            'prompt': self._compose_image_prompt(template=template, prompt=prompt),
            'aspect_ratio': aspect_ratio,
            'resolution': resolution,
            'reference_urls': [],
        }
        estimate = self.credit_service.estimate('image_generate', request_payload)
        deduction_amount = 0
        remaining_credits: int | None = None
        try:
            deduction = self.credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='template_generate_image',
                metadata={'template_id': template.id, **request_payload},
                source='premium' if estimate.required_credits > 0 else 'free',
                idempotency_key=self.credit_service.make_idempotency_key(
                    'template_generate_image',
                    {'user_id': user_id, 'template_id': template.id, **request_payload},
                ),
            )
            deduction_amount = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
            generation = ImageGenerationService(None).create_image(
                user_id=user_id,
                model_key=model_key,
                prompt=request_payload['prompt'],
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                reference_urls=[],
                project_id=project_id,
                mode_id=template.default_model_mode,
                template_id=template.id,
            )
            if deduction_amount > 0 and getattr(generation, 'status', None) == ImageGenerationStatus.failed:
                self.credit_service.top_up_credits(
                    user_id=user_id,
                    credits=deduction_amount,
                    metadata={'refund_for': 'template_generate_image_failed', 'template_id': template.id},
                )
                deduction_amount = 0
            return TemplateGenerateResponse(
                templateId=template.id,
                contentType='image',
                assetId=generation.id,
                status=getattr(generation.status, 'value', str(generation.status)),
                imageUrl=generation.image_url,
                thumbnailUrl=generation.thumbnail_url,
                appliedCredits=estimate.required_credits,
                remainingCredits=remaining_credits,
                provider=model_key,
                modelKey=model_key,
            )
        except Exception:
            if deduction_amount > 0:
                self.credit_service.top_up_credits(
                    user_id=user_id,
                    credits=deduction_amount,
                    metadata={'refund_for': 'template_generate_image_error', 'template_id': template.id},
                )
            raise

    def _generate_video_from_template(
        self,
        *,
        user_id: str,
        template: UnifiedTemplateResponse,
        payload: TemplateGenerateRequest,
        prompt: str,
        script_preview: str | None = None,
        recommended_model_mode: str | None = None,
        project_id: str | None,
    ) -> TemplateGenerateResponse:
        model_key = payload.model_key or template.generation_defaults.model_key or self._default_model_for_mode(recommended_model_mode or template.default_model_mode) or 'sora2'
        aspect_ratio = payload.aspect_ratio or template.generation_defaults.aspect_ratio or template.aspect_ratio or '9:16'
        resolution = payload.resolution or template.generation_defaults.resolution or '720p'
        voice = payload.voice or template.generation_defaults.voice or 'Shubh'
        language = payload.language or template.generation_defaults.language or str(payload.inputs.get('language') or 'English')
        duration_seconds = payload.duration_seconds or template.generation_defaults.duration_seconds or 8
        quality = payload.quality or template.generation_defaults.quality or 'standard'
        script = script_preview or self._build_video_script(template=template, prompt=prompt, language=language)
        request_payload = {
            'model': model_key,
            'resolution': resolution,
            'durationSeconds': duration_seconds,
            'quality': quality,
            'captionsEnabled': True,
            'voice': voice,
            'imageUrls': [],
            'audioSettings': {'sampleRateHz': 22050},
        }
        estimate = self.credit_service.estimate('video_create', request_payload)
        deduction_amount = 0
        remaining_credits: int | None = None
        error_stage = 'deduct_credits'
        try:
            deduction = self.credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='template_generate_video',
                metadata={'template_id': template.id, **request_payload},
                source='premium' if estimate.required_credits > 0 else 'free',
                idempotency_key=self.credit_service.make_idempotency_key(
                    'template_generate_video',
                    {'user_id': user_id, 'template_id': template.id, **request_payload},
                ),
            )
            deduction_amount = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
            error_stage = 'create_video'
            service = AIVideoCreateService(None, self.settings)
            video = service.create_video(
                user_id=user_id,
                template=template.name,
                template_id=template.id,
                project_id=project_id,
                mode_id=recommended_model_mode or template.default_model_mode,
                language=language,
                image_urls=[],
                script=script,
                tags=[template.category, *(template.subcategory and [template.subcategory] or [])],
                model_key=model_key,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                duration_mode='custom',
                duration_seconds=duration_seconds,
                voice=voice,
                music={'type': 'none', 'url': None},
                audio_settings={'sampleRateHz': 22050, 'volume': 20, 'ducking': True},
                captions_enabled=True,
                caption_style='Classic',
            )
            error_stage = 'persist_video_metadata'
            service.repo.update(video, applied_credits=estimate.required_credits, request_quality=quality)
            return TemplateGenerateResponse(
                templateId=template.id,
                contentType='video',
                assetId=video.id,
                status='queued',
                videoUrl=video.output_url,
                thumbnailUrl=video.thumbnail_url,
                appliedCredits=estimate.required_credits,
                remainingCredits=remaining_credits,
                provider=video.provider_name,
                modelKey=model_key,
            )
        except (InsufficientCreditsError, CreditCapExceededError, ProviderError):
            if deduction_amount > 0:
                self.credit_service.top_up_credits(
                    user_id=user_id,
                    credits=deduction_amount,
                    metadata={'refund_for': 'template_generate_video_error', 'template_id': template.id},
                )
            raise
        except Exception as exc:
            logger.exception(
                'template_generate_video_unhandled_error',
                extra={
                    'template_id': template.id,
                    'user_id': user_id,
                    'model_key': model_key,
                    'error_stage': error_stage,
                    'error': str(exc),
                },
            )
            if deduction_amount > 0:
                self.credit_service.top_up_credits(
                    user_id=user_id,
                    credits=deduction_amount,
                    metadata={
                        'refund_for': 'template_generate_video_unhandled_error',
                        'template_id': template.id,
                        'error_stage': error_stage,
                    },
                )
            raise ProviderError(f'Template video generation failed at {error_stage}: {str(exc)[:200]}') from exc

    def _ensure_template_project(
        self,
        *,
        user_id: str,
        template: UnifiedTemplateResponse,
        payload: TemplateGenerateRequest,
        prompt: str,
        script_preview: str | None,
    ) -> str | None:
        if payload.project_id or not payload.auto_create_project:
            return payload.project_id
        draft_title = str(
            payload.inputs.get('topic')
            or payload.inputs.get('speakerName')
            or payload.inputs.get('productName')
            or payload.inputs.get('headline')
            or template.title
            or template.name
        ).strip()
        project = self.project_service.create_project(
            CreateProjectRequest(
                user_id=user_id,
                title=(draft_title or template.name)[:120],
                script=(script_preview or prompt or template.description or '')[:5000],
                language=payload.language or template.generation_defaults.language or str(payload.inputs.get('language') or 'English'),
                voice=payload.voice or template.generation_defaults.voice or 'Shubh',
                template=template.id,
            )
        )
        return project.id

    def _render_prompt(self, template: UnifiedTemplateResponse, raw_inputs: dict[str, Any]) -> str:
        values = {key: self._stringify_value(value) for key, value in raw_inputs.items() if value not in (None, '')}
        missing = [field.label for field in template.inputs if field.required and not values.get(field.key)]
        if missing:
            raise ValueError(f"Missing template inputs: {', '.join(missing)}")

        prompt = template.prompt_template
        for field in template.inputs:
            placeholder = '{' + field.key + '}'
            replacement = values.get(field.key) or field.placeholder or ''
            prompt = prompt.replace(placeholder, replacement)
        prompt = re.sub(r'\{[^}]+\}', '', prompt)
        return re.sub(r'\s+', ' ', prompt).strip()

    def _compose_image_prompt(self, *, template: UnifiedTemplateResponse, prompt: str) -> str:
        parts = [prompt]
        if template.visual_prompt:
            parts.append(f'Visual direction: {template.visual_prompt}.')
        if template.script_hint:
            parts.append(f'Creative goal: {template.script_hint}.')
        return ' '.join(part.strip() for part in parts if part and part.strip())

    def _build_video_script(self, *, template: UnifiedTemplateResponse, prompt: str, language: str) -> str:
        hook = template.topic_hint or template.short_description or template.name
        return (
            f'[Opening shot: {template.name} visual hook]\n'
            f'Narrator: "{hook}."\n\n'
            f'[Scene 1: Establish the idea]\n'
            f'Narrator: "{prompt}."\n'
            'Camera cue: cinematic medium shot with premium motion.\n'
            'Mood cue: clear, engaging, and creator-ready.\n\n'
            f'[Scene 2: Explain the core story]\n'
            f'Narrator: "{template.script_hint or template.description}."\n'
            'Camera cue: dynamic cutaways with infographic or environmental detail.\n'
            'Mood cue: polished and informative.\n\n'
            '[Closing shot: End frame and CTA]\n'
            f'Narrator: "Create with RangManch AI and share your next story in {language}."'
        )

    def _to_unified_template(self, data: dict[str, Any]) -> UnifiedTemplateResponse:
        payload = dict(data)
        payload.setdefault('medium', payload.get('type'))
        payload.setdefault('title', payload.get('name'))
        payload.setdefault('input_schema', payload.get('inputs', []))
        payload.setdefault('is_featured', payload.get('featured', False))
        payload.setdefault('is_quick_start', payload.get('is_quick_start', False))
        recommended = self._recommended_model_payload(payload)
        if recommended:
            payload['recommended_model'] = recommended
        return UnifiedTemplateResponse.model_validate(payload)

    def _stringify_value(self, value: Any) -> str:
        if isinstance(value, bool):
            return 'true' if value else 'false'
        return str(value).strip()

    def _ensure_seeded(self) -> None:
        if self._seeded:
            return
        seeds = self._seed_templates()
        try:
            self.repo.seed_missing(seeds)
            # Keep selected hero templates in sync even after initial seed,
            # so guided workflow simplifications roll out without manual DB edits.
            curated_ids = {
                'viral_dance_clip',
                'cinematic_infographic',
                'quote_infographic_post',
                'modern_infographic',
            }
            for seed in seeds:
                if seed.get('id') in curated_ids:
                    self.repo.upsert(str(seed['id']), seed)
        except Exception:
            logger.exception('template_seed_failed')
        self._seeded = True

    def _seed_templates(self) -> list[dict[str, Any]]:
        now = utcnow()
        seeds = get_hero_template_documents(now)
        hero_ids = {seed['id'] for seed in seeds}
        for seed in self._legacy_seed_templates(now):
            if seed['id'] not in hero_ids:
                seeds.append(seed)
        return seeds

    def _legacy_seed_templates(self, now: Any) -> list[dict[str, Any]]:
        return [
            {
                'id': 'modern_infographic',
                'type': 'image',
                'category': 'education',
                'subcategory': 'infographic',
                'name': 'Modern Infographic',
                'title': 'Modern Infographic',
                'slug': 'modern-infographic',
                'description': 'Generate a clean, structured flat/semi-flat vector infographic with clear sections, bold data callouts, charts, and professional business-style layout.',
                'short_description': 'Flat/semi-flat vector infographic with charts, icons, and clear hierarchy',
                'thumbnail_url': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Flat/semi-flat vector infographic, clean section blocks, icon-led data cards, bold numbers, modern business layout, light background, crisp charts, structured hierarchy.',
                'aspect_ratio': '4:5',
                'inputs': [
                    {
                        'key': 'topic',
                        'label': 'Topic',
                        'type': 'text',
                        'required': True,
                        'placeholder': 'Future of Indian cities'
                    },
                    {
                        'key': 'style',
                        'label': 'Style',
                        'type': 'select',
                        'required': True,
                        'options': ['Business', 'Educational', 'LinkedIn', 'Startup Report']
                    },
                    {
                        'key': 'language',
                        'label': 'Language',
                        'type': 'select',
                        'required': False,
                        'options': ['English', 'Hindi', 'Hinglish']
                    },
                ],
                'script_hint': 'Keep the infographic clean, readable, data-first, and well-structured with clear sections and strong visual hierarchy.',
                'topic_hint': 'Use 4–6 key stats, icons, and chart fragments arranged in clean sections',
                'prompt_template': (
                    'Create a clean modern flat/semi-flat vector infographic about {topic}. '
                    'Style: {style}. Language context: {language}. '
                    'Make it look like a professional business infographic used in reports, presentations, and LinkedIn posts. '
                    'Use a vertical infographic layout with clearly divided sections, strong hierarchy, and clean grid alignment. '
                    'Include 4 to 6 strong data points with large bold numbers, short explanation text, icon markers, and flat illustrations. '
                    'Include at least one line chart, one bar chart, and one pie or donut chart. '
                    'Use a light background, flat vector design, clean sans-serif typography, and evenly spaced data blocks. '
                    'Avoid cinematic lighting, photo backgrounds, dark textures, glow effects, and poster-style composition. '
                    'The result should feel like a polished modern infographic, not a cinematic poster.'
                ),
                'badge': 'Quick Start',
                'is_quick_start': True,
                'default_model_mode': 'best_graphics',
                'prompt_assembler_key': 'modern_infographic',
                'legacy_mappings': ['cinematic_infographic', 'modern_infographic'],
                'suggested_platforms': ['linkedin', 'instagram'],
                'suggested_durations': [],
                'suggested_styles': ['Business', 'Educational', 'LinkedIn', 'Startup Report'],
                'safety_profile': 'educational_safe',
                'active': True,
                'trending': True,
                'featured': True,
                'order': 200,
                'created_by': 'system',
                'source': 'legacy_seed',
                'generation_defaults': {
                    'model_key': 'gemini_flash_image',
                    'aspect_ratio': '4:5',
                    'resolution': '1536'
                },
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'cinematic_infographic',
                'type': 'image',
                'category': 'education',
                'subcategory': 'infographic',
                'name': 'Cinematic Infographic',
                'title': 'Cinematic Infographic',
                'slug': 'cinematic-infographic',
                'description': 'Generate a cinematic infographic-style visual with dramatic atmosphere, hero composition, and selective high-impact data callouts.',
                'short_description': 'Cinematic poster-style infographic with premium mood',
                'thumbnail_url': 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Cinematic infographic visual, dramatic lighting, hero image composition, selective data overlays, premium poster atmosphere.',
                'aspect_ratio': '4:5',
                'inputs': [
                    {
                        'key': 'topic',
                        'label': 'Topic',
                        'type': 'text',
                        'required': True,
                        'placeholder': 'Future of Indian cities'
                    },
                    {
                        'key': 'style',
                        'label': 'Style',
                        'type': 'select',
                        'required': True,
                        'options': ['Cinematic', 'Documentary', 'Premium Editorial']
                    },
                    {
                        'key': 'tone',
                        'label': 'Tone',
                        'type': 'select',
                        'required': False,
                        'options': ['Dramatic', 'Inspirational', 'Serious', 'Visionary']
                    },
                ],
                'script_hint': 'Use cinematic visual storytelling with limited but impactful infographic overlays.',
                'topic_hint': 'Hero visual + selective data callouts',
                'prompt_template': (
                    'Create a cinematic infographic-style visual about {topic}. '
                    'Style: {style}. Tone: {tone}. '
                    'Use one strong hero visual with premium dramatic lighting and atmospheric depth. '
                    'Overlay only a few high-impact stats or labels with clear typography-safe zones. '
                    'Prioritize mood, composition, and story impact over dense charts. '
                    'The output should feel like a cinematic poster with infographic cues.'
                ),
                'badge': 'Cinematic',
                'is_quick_start': True,
                'default_model_mode': 'best_graphics',
                'prompt_assembler_key': 'cinematic_infographic',
                'legacy_mappings': ['cinematic_infographic'],
                'suggested_platforms': ['instagram', 'linkedin'],
                'suggested_durations': [],
                'suggested_styles': ['Cinematic', 'Documentary', 'Premium Editorial'],
                'safety_profile': 'educational_safe',
                'active': True,
                'trending': True,
                'featured': True,
                'order': 199,
                'created_by': 'system',
                'source': 'legacy_seed',
                'generation_defaults': {
                    'model_key': 'gemini_flash_image',
                    'aspect_ratio': '4:5',
                    'resolution': '1536'
                },
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'did_you_know',
                'type': 'image',
                'category': 'education',
                'subcategory': 'fact',
                'name': 'Did You Know',
                'title': 'Did You Know',
                'slug': 'did-you-know',
                'description': 'Create a social-friendly knowledge card with one striking visual and a strong curiosity hook.',
                'short_description': 'Fast educational social visual',
                'thumbnail_url': 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Punchy educational composition, one central object, social-first framing.',
                'aspect_ratio': '4:5',
                'inputs': [
                    {'key': 'fact_topic', 'label': 'Fact topic', 'type': 'text', 'required': True, 'placeholder': 'Why octopuses have three hearts'},
                    {'key': 'style', 'label': 'Style', 'type': 'select', 'required': False, 'options': ['Educational', 'Cute Animated', 'Cinematic']},
                ],
                'script_hint': 'The image should feel instantly shareable and curiosity-driven.',
                'topic_hint': 'One big fact, one unforgettable visual',
                'prompt_template': 'Create a premium did-you-know image about {fact_topic}. Style: {style}.',
                'badge': 'Quick Start',
                'is_quick_start': True,
                'default_model_mode': 'best_graphics',
                'prompt_assembler_key': 'quote_infographic_post',
                'legacy_mappings': ['did_you_know'],
                'suggested_platforms': ['instagram', 'linkedin'],
                'suggested_durations': [],
                'suggested_styles': ['Educational', 'Cute Animated', 'Cinematic'],
                'safety_profile': 'educational_safe',
                'active': True,
                'trending': True,
                'featured': False,
                'order': 201,
                'created_by': 'system',
                'source': 'legacy_seed',
                'generation_defaults': {'model_key': 'gemini_flash_image', 'aspect_ratio': '4:5', 'resolution': '1024'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'top_5_places',
                'type': 'image',
                'category': 'geography',
                'subcategory': 'travel',
                'name': 'Top 5 Places',
                'title': 'Top 5 Places',
                'slug': 'top-5-places',
                'description': 'Generate a premium travel-explainer cover image for top places, destinations, or city lists.',
                'short_description': 'Travel ranking visual cover',
                'thumbnail_url': 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Map, travel landmarks, premium listicle cover feel.',
                'aspect_ratio': '16:9',
                'inputs': [
                    {'key': 'place_theme', 'label': 'Place theme', 'type': 'text', 'required': True, 'placeholder': 'Best mountain destinations in India'},
                    {'key': 'tone', 'label': 'Tone', 'type': 'select', 'required': False, 'options': ['Travel Documentary', 'Luxury Travel', 'Informative']},
                ],
                'script_hint': 'Use premium destination cues and ranking-cover composition.',
                'topic_hint': 'Destination list cover',
                'prompt_template': 'Create a polished travel ranking cover image for {place_theme}. Tone: {tone}.',
                'badge': 'Quick Start',
                'is_quick_start': True,
                'default_model_mode': 'best_photos',
                'prompt_assembler_key': 'thumbnail_cover_art',
                'legacy_mappings': ['top_5_places'],
                'suggested_platforms': ['instagram', 'youtube'],
                'suggested_durations': [],
                'suggested_styles': ['Travel Documentary', 'Luxury Travel', 'Informative'],
                'safety_profile': 'general_safe',
                'active': True,
                'trending': False,
                'featured': False,
                'order': 202,
                'created_by': 'system',
                'source': 'legacy_seed',
                'generation_defaults': {'model_key': 'gemini_pro_image', 'aspect_ratio': '16:9', 'resolution': '1536'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'history_timeline',
                'type': 'image',
                'category': 'history',
                'subcategory': 'timeline',
                'name': 'History Timeline',
                'title': 'History Timeline',
                'slug': 'history-timeline',
                'description': 'Create a cinematic history explainer cover with artifacts, ruins, and timeline energy.',
                'short_description': 'History cover with timeline mood',
                'thumbnail_url': 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Ancient ruins, archival visual language, cinematic historical atmosphere.',
                'aspect_ratio': '16:9',
                'inputs': [
                    {'key': 'civilization', 'label': 'Civilization / era', 'type': 'text', 'required': True, 'placeholder': 'Indus Valley Civilization'},
                    {'key': 'style', 'label': 'Style', 'type': 'select', 'required': False, 'options': ['Documentary', 'Epic', 'Museum Editorial']},
                ],
                'script_hint': 'The image should feel like the cover of a premium history documentary.',
                'topic_hint': 'Timeline cover visual',
                'prompt_template': 'Create a cinematic history timeline cover about {civilization}. Style: {style}.',
                'badge': 'Quick Start',
                'is_quick_start': True,
                'default_model_mode': 'best_photos',
                'prompt_assembler_key': 'history_timeline',
                'legacy_mappings': ['history_timeline'],
                'suggested_platforms': ['youtube', 'instagram'],
                'suggested_durations': [],
                'suggested_styles': ['Documentary', 'Epic', 'Museum Editorial'],
                'safety_profile': 'historical_educational_safe',
                'active': True,
                'trending': False,
                'featured': True,
                'order': 203,
                'created_by': 'system',
                'source': 'legacy_seed',
                'generation_defaults': {'model_key': 'openai_image', 'aspect_ratio': '16:9', 'resolution': '1536'},
                'created_at': now,
                'updated_at': now,
            },
        ]

    def _recommended_model_payload(self, data: dict[str, Any]) -> dict[str, Any] | None:
        if data.get('recommended_model'):
            existing = data['recommended_model']
            if isinstance(existing, dict):
                return existing
            return {
                'mode': getattr(existing, 'mode', data.get('default_model_mode')),
                'label': getattr(existing, 'label', None),
                'description': getattr(existing, 'description', None),
                'group': getattr(existing, 'group', None),
                'internal_model_key': getattr(existing, 'internal_model_key', None),
            }
        mode = data.get('default_model_mode')
        if not mode:
            return None
        recommended = get_recommended_model_mode(str(mode))
        if not recommended:
            return None
        if isinstance(recommended, dict):
            return {
                'mode': mode,
                'label': recommended.get('label'),
                'description': recommended.get('description'),
                'group': recommended.get('group'),
                'internal_model_key': recommended.get('internal_model_key'),
            }
        return {
            'mode': mode,
            'label': recommended.label,
            'description': recommended.description,
            'group': recommended.group,
            'internal_model_key': recommended.internal_model_key,
        }

    def _default_model_for_mode(self, mode: str | None) -> str | None:
        if not mode:
            return None
        recommended = get_recommended_model_mode(mode)
        if not recommended:
            return None
        if isinstance(recommended, dict):
            value = recommended.get('internal_model_key')
            return str(value) if value else None
        return recommended.internal_model_key
