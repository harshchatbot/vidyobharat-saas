from __future__ import annotations

import logging
import mimetypes
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.core.config import get_settings
from app.db.firestore_utils import utcnow
from app.db.repositories.template_repository import TemplateRepository
from app.models.entities import ImageGenerationStatus
from app.providers.storage import build_storage_provider
from app.schemas.catalog import TemplateResponse
from app.schemas.template_management import TemplateGenerateRequest, TemplateGenerateResponse, TemplateUpsertRequest, UnifiedTemplateResponse
from app.services.ai_video_service import AIVideoCreateService, ProviderError
from app.services.credit_service import CreditCapExceededError, CreditService, InsufficientCreditsError
from app.services.image_generation_service import ImageGenerationService

logger = logging.getLogger(__name__)


class TemplateManagementService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repo = TemplateRepository()
        self.credit_service = CreditService()
        self.storage = build_storage_provider(self.settings)
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
        rows = self.repo.list()
        if not rows:
            rows = self._seed_templates()
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
                    for key in ('name', 'description', 'short_description', 'category', 'subcategory', 'slug')
                ).lower()
                if keyword not in haystack:
                    continue
            result.append(self._to_unified_template(row))
        result.sort(key=lambda item: (-int(item.featured), -int(item.trending), item.order, item.name.lower()))
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
            for seed in self._seed_templates():
                if seed['id'] == template_id:
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
        prompt = self._render_prompt(template, payload.inputs)
        if template.type == 'image':
            return self._generate_image_from_template(user_id=user_id, template=template, payload=payload, prompt=prompt)
        return self._generate_video_from_template(user_id=user_id, template=template, payload=payload, prompt=prompt)

    def _generate_image_from_template(
        self,
        *,
        user_id: str,
        template: UnifiedTemplateResponse,
        payload: TemplateGenerateRequest,
        prompt: str,
    ) -> TemplateGenerateResponse:
        model_key = payload.model_key or template.generation_defaults.model_key or 'gemini_flash_image'
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
    ) -> TemplateGenerateResponse:
        model_key = payload.model_key or template.generation_defaults.model_key or 'sora2'
        aspect_ratio = payload.aspect_ratio or template.generation_defaults.aspect_ratio or template.aspect_ratio or '9:16'
        resolution = payload.resolution or template.generation_defaults.resolution or '720p'
        voice = payload.voice or template.generation_defaults.voice or 'Shubh'
        language = payload.language or template.generation_defaults.language or str(payload.inputs.get('language') or 'English')
        duration_seconds = payload.duration_seconds or template.generation_defaults.duration_seconds or 8
        quality = payload.quality or template.generation_defaults.quality or 'standard'
        script = self._build_video_script(template=template, prompt=prompt, language=language)
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
            video = AIVideoCreateService(None, self.settings).create_video(
                user_id=user_id,
                template=template.name,
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
            AIVideoCreateService(None, self.settings).repo.update(video, applied_credits=estimate.required_credits, request_quality=quality)
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
        except Exception:
            if deduction_amount > 0:
                self.credit_service.top_up_credits(
                    user_id=user_id,
                    credits=deduction_amount,
                    metadata={'refund_for': 'template_generate_video_error', 'template_id': template.id},
                )
            raise

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
        return UnifiedTemplateResponse.model_validate(data)

    def _stringify_value(self, value: Any) -> str:
        if isinstance(value, bool):
            return 'true' if value else 'false'
        return str(value).strip()

    def _ensure_seeded(self) -> None:
        if self._seeded:
            return
        try:
            self.repo.seed_missing(self._seed_templates())
        except Exception:
            logger.exception('template_seed_failed')
        self._seeded = True

    def _seed_templates(self) -> list[dict[str, Any]]:
        now = utcnow()
        return [
            {
                'id': 'cinematic_infographic',
                'type': 'image',
                'category': 'education',
                'subcategory': 'infographic',
                'name': 'Cinematic Infographic',
                'slug': 'cinematic-infographic',
                'description': 'Generate an editorial infographic-style image with cinematic atmosphere and layered information hierarchy.',
                'short_description': 'Aerial documentary visuals with infographic overlays',
                'thumbnail_url': 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Aerial documentary frame, infographic overlays, premium editorial typography spacing, cinematic light.',
                'aspect_ratio': '4:5',
                'inputs': [
                    {'key': 'topic', 'label': 'Topic', 'type': 'text', 'required': True, 'placeholder': 'Future of electric mobility'},
                    {'key': 'style', 'label': 'Style', 'type': 'select', 'required': True, 'options': ['Documentary', 'Editorial', 'Premium News']},
                    {'key': 'language', 'label': 'Language', 'type': 'select', 'required': False, 'options': ['English', 'Hindi', 'Hinglish']},
                ],
                'script_hint': 'Keep the composition readable and premium with clear visual hierarchy.',
                'topic_hint': 'Aerial visual + 3 key data callouts',
                'prompt_template': 'Create a premium cinematic infographic image about {topic}. Style: {style}. Language context: {language}.',
                'active': True,
                'trending': True,
                'featured': True,
                'order': 1,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'recraft_studio', 'aspect_ratio': '4:5', 'resolution': '1536'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'did_you_know',
                'type': 'image',
                'category': 'education',
                'subcategory': 'fact',
                'name': 'Did You Know',
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
                'active': True,
                'trending': True,
                'featured': False,
                'order': 2,
                'created_by': 'system',
                'source': 'seed',
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
                'active': True,
                'trending': False,
                'featured': False,
                'order': 3,
                'created_by': 'system',
                'source': 'seed',
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
                'active': True,
                'trending': False,
                'featured': True,
                'order': 4,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'openai_image', 'aspect_ratio': '16:9', 'resolution': '1536'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'organ_explainer',
                'type': 'video',
                'category': 'education',
                'subcategory': 'body_explainer',
                'name': 'Organ Explainer',
                'slug': 'organ-explainer',
                'description': 'Create a cinematic educational reel where organs explain body facts in a simple, engaging voice.',
                'short_description': 'Talking organs explain the body',
                'thumbnail_url': 'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Happy heart character in center, kidney and lungs around it, educational cinematic cartoon style.',
                'aspect_ratio': '9:16',
                'inputs': [
                    {'key': 'organ', 'label': 'Organ', 'type': 'text', 'required': True, 'placeholder': 'Heart'},
                    {'key': 'language', 'label': 'Language', 'type': 'select', 'required': True, 'options': ['English', 'Hindi', 'Hinglish']},
                    {'key': 'style', 'label': 'Style', 'type': 'select', 'required': False, 'options': ['Educational', 'Cute Animated', 'Cinematic']},
                ],
                'script_hint': 'Explain how the organ works in a simple and engaging way.',
                'topic_hint': 'Heart, Brain, Lungs, Kidney',
                'prompt_template': 'Create a cinematic educational video where {organ} explains its role in the human body in {language}. Style: {style}.',
                'active': True,
                'trending': True,
                'featured': True,
                'order': 10,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'sora2', 'aspect_ratio': '9:16', 'resolution': '720p', 'voice': 'Shubh', 'language': 'English', 'duration_seconds': 8, 'quality': 'standard'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'historical_character_explainer',
                'type': 'video',
                'category': 'history',
                'subcategory': 'character',
                'name': 'Historical Character Explainer',
                'slug': 'historical-character-explainer',
                'description': 'Create a premium talking-character video where a historical figure explains a key event or idea.',
                'short_description': 'A leader or warrior speaks to camera',
                'thumbnail_url': 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Dramatic king, warrior, or leader speaking toward camera with cinematic authority.',
                'aspect_ratio': '9:16',
                'inputs': [
                    {'key': 'character', 'label': 'Character', 'type': 'text', 'required': True, 'placeholder': 'Ashoka'},
                    {'key': 'topic', 'label': 'Topic', 'type': 'text', 'required': True, 'placeholder': 'Why the Kalinga war changed my life'},
                    {'key': 'language', 'label': 'Language', 'type': 'select', 'required': True, 'options': ['English', 'Hindi', 'Hinglish']},
                ],
                'script_hint': 'Let the character explain the event in first person with emotional clarity.',
                'topic_hint': 'Historical POV storytelling',
                'prompt_template': 'Create a cinematic first-person historical explainer where {character} explains {topic} in {language}.',
                'active': True,
                'trending': False,
                'featured': True,
                'order': 11,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'sora2', 'aspect_ratio': '9:16', 'resolution': '720p', 'voice': 'Shubh', 'language': 'English', 'duration_seconds': 8, 'quality': 'standard'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'history_revisit',
                'type': 'video',
                'category': 'history',
                'subcategory': 'documentary',
                'name': 'History Revisit',
                'slug': 'history-revisit',
                'description': 'Create a time-travel style historical revisit with ruins, archives, and emotional cinematic narration.',
                'short_description': 'Travel through time with cinematic history scenes',
                'thumbnail_url': 'https://images.unsplash.com/photo-1484502249930-e1da807099a5?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1484502249930-e1da807099a5?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Ancient ruins, cinematic time-travel atmosphere, epic documentary feel.',
                'aspect_ratio': '16:9',
                'inputs': [
                    {'key': 'era', 'label': 'Era / place', 'type': 'text', 'required': True, 'placeholder': 'Ancient Rome'},
                    {'key': 'hook', 'label': 'Hook', 'type': 'text', 'required': False, 'placeholder': 'What this place looked like at its peak'},
                ],
                'script_hint': 'Use a revisit format: then vs now, with visual journey cues.',
                'topic_hint': 'Then vs now documentary reel',
                'prompt_template': 'Create a cinematic history revisit video about {era}. Hook: {hook}.',
                'active': True,
                'trending': False,
                'featured': False,
                'order': 12,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'sora2', 'aspect_ratio': '16:9', 'resolution': '720p', 'voice': 'Shubh', 'language': 'English', 'duration_seconds': 8, 'quality': 'standard'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'map_highlight_explainer',
                'type': 'video',
                'category': 'geography',
                'subcategory': 'map',
                'name': 'Map Highlight Explainer',
                'slug': 'map-highlight-explainer',
                'description': 'Create a geography or route explainer with a glowing map path and clear motion-led narration.',
                'short_description': 'Glowing route map explainer',
                'thumbnail_url': 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Animated map route, infographic markers, cinematic geography education.',
                'aspect_ratio': '16:9',
                'inputs': [
                    {'key': 'route', 'label': 'Route / location', 'type': 'text', 'required': True, 'placeholder': 'Silk Route'},
                    {'key': 'language', 'label': 'Language', 'type': 'select', 'required': False, 'options': ['English', 'Hindi', 'Hinglish']},
                ],
                'script_hint': 'Explain the route with movement, significance, and key markers.',
                'topic_hint': 'Map-based explainer',
                'prompt_template': 'Create a cinematic map highlight explainer about {route} in {language}.',
                'active': True,
                'trending': False,
                'featured': False,
                'order': 13,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'sora2', 'aspect_ratio': '16:9', 'resolution': '720p', 'voice': 'Shubh', 'language': 'English', 'duration_seconds': 8, 'quality': 'standard'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'ai_story_slides',
                'type': 'video',
                'category': 'social',
                'subcategory': 'storytelling',
                'name': 'AI Story Slides',
                'slug': 'ai-story-slides',
                'description': 'Create a short slide-style storytelling video with bold hook, visual beats, and strong closing line.',
                'short_description': 'Slide-based story reel',
                'thumbnail_url': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Story slides, premium social framing, clean scene transitions.',
                'aspect_ratio': '9:16',
                'inputs': [
                    {'key': 'story_topic', 'label': 'Story topic', 'type': 'text', 'required': True, 'placeholder': 'How a local founder built trust online'},
                    {'key': 'tone', 'label': 'Tone', 'type': 'select', 'required': False, 'options': ['Inspirational', 'Dramatic', 'Sharp']},
                ],
                'script_hint': 'Make the story easy to consume scene by scene with a strong emotional arc.',
                'topic_hint': '3-5 slide story arc',
                'prompt_template': 'Create a vertical AI story-slide video about {story_topic}. Tone: {tone}.',
                'active': True,
                'trending': True,
                'featured': False,
                'order': 14,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'sora2', 'aspect_ratio': '9:16', 'resolution': '720p', 'voice': 'Shubh', 'language': 'English', 'duration_seconds': 8, 'quality': 'standard'},
                'created_at': now,
                'updated_at': now,
            },
            {
                'id': 'comparison_vs',
                'type': 'video',
                'category': 'viral-comparisons',
                'subcategory': 'comparison',
                'name': 'Comparison VS',
                'slug': 'comparison-vs',
                'description': 'Create a split-screen comparison video for two ideas, products, or historical contrasts.',
                'short_description': 'Split-screen contrast explainer',
                'thumbnail_url': 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80',
                'preview_image_url': 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80',
                'visual_prompt': 'Split-screen visual contrast, clear comparison energy, social-first motion.',
                'aspect_ratio': '9:16',
                'inputs': [
                    {'key': 'left_side', 'label': 'Left side', 'type': 'text', 'required': True, 'placeholder': 'Ancient education'},
                    {'key': 'right_side', 'label': 'Right side', 'type': 'text', 'required': True, 'placeholder': 'Modern education'},
                    {'key': 'language', 'label': 'Language', 'type': 'select', 'required': False, 'options': ['English', 'Hindi', 'Hinglish']},
                ],
                'script_hint': 'Make the contrast clear, punchy, and social-friendly.',
                'topic_hint': 'This vs that format',
                'prompt_template': 'Create a split-screen comparison video contrasting {left_side} vs {right_side} in {language}.',
                'active': True,
                'trending': True,
                'featured': True,
                'order': 15,
                'created_by': 'system',
                'source': 'seed',
                'generation_defaults': {'model_key': 'sora2', 'aspect_ratio': '9:16', 'resolution': '720p', 'voice': 'Shubh', 'language': 'English', 'duration_seconds': 8, 'quality': 'standard'},
                'created_at': now,
                'updated_at': now,
            },
        ]
