import json
import logging
import subprocess
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
from app.models.entities import ImageGeneration, ImageGenerationStatus
from app.services.asset_tagging_service import AssetTaggingService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ImageModelEntry:
    key: str
    label: str
    description: str
    frontend_hint: str


IMAGE_MODEL_REGISTRY: dict[str, ImageModelEntry] = {
    'nano_banana': ImageModelEntry(
        key='nano_banana',
        label='Nano Banana',
        description='Best for crisp social visuals and fast prompt-to-image drafts with bold composition.',
        frontend_hint='Use this for punchy reel covers, posters, and quick campaign concepts.',
    ),
    'openai_image': ImageModelEntry(
        key='openai_image',
        label='OpenAI Images',
        description='Best for dependable prompt-following, clean composition, and practical testing with a verified OpenAI image key.',
        frontend_hint='Use this when you want the most reliable live image generation path in RangManch AI right now.',
    ),
    'seedream': ImageModelEntry(
        key='seedream',
        label='Seedream',
        description='Best for premium editorial imagery, elegant lighting, and refined visual storytelling.',
        frontend_hint='Use this for polished brand shots, fashion-style frames, and premium moodboards.',
    ),
    'flux_spark': ImageModelEntry(
        key='flux_spark',
        label='Flux Spark',
        description='Best for product concepts, realistic scenes, and clean commercial-style outputs.',
        frontend_hint='Use this for realistic mockups, product storytelling, and ad-ready frames.',
    ),
    'recraft_studio': ImageModelEntry(
        key='recraft_studio',
        label='Recraft Studio',
        description='Best for stylized illustrations, design-forward visuals, and graphic-first compositions.',
        frontend_hint='Use this for illustrated storytelling, album art, and creator-brand graphics.',
    ),
}

TOGETHER_IMAGE_MODELS = {
    'nano_banana': 'google/gemini-3-pro-image',
    'seedream': 'ByteDance-Seed/Seedream-4.0',
    'flux_spark': 'black-forest-labs/FLUX.1-schnell-Free',
    'recraft_studio': 'black-forest-labs/FLUX.1-schnell-Free',
}
GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview'

INSPIRATION_ITEMS = [
    {
        'id': 'insp-1',
        'creator_name': 'Aarohi',
        'model_key': 'seedream',
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
        'model_key': 'nano_banana',
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
        'model_key': 'flux_spark',
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
        self.tagging = AssetTaggingService(db)
        self.output_dir = Path('data/image_generations')
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.settings = get_settings()

    def list_models(self) -> list[ImageModelEntry]:
        return list(IMAGE_MODEL_REGISTRY.values())

    def list_user_images(self, user_id: str) -> list[ImageGeneration]:
        return self.repo.list_by_user(user_id)

    def list_inspiration(self) -> list[dict[str, object]]:
        return INSPIRATION_ITEMS

    def enhance_prompt(self, prompt: str, model_key: str | None = None) -> str:
        cleaned = prompt.strip()
        if not cleaned:
            return cleaned

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
                logger.warning('image_prompt_enhance_fallback', extra={'error': str(exc), 'model_key': model_key})

        descriptors = {
            'nano_banana': 'bold composition, social-ready framing, cinematic lighting',
            'seedream': 'editorial lighting, premium atmosphere, refined details',
            'flux_spark': 'realistic materials, commercial polish, soft studio shadows',
            'recraft_studio': 'illustrative composition, design-forward styling, rich color contrast',
        }
        suffix = descriptors.get(model_key or '', 'cinematic lighting, refined detail, premium composition')
        return f'{cleaned}, {suffix}, high detail, creator-grade output'

    def create_image(
        self,
        user_id: str,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
    ) -> ImageGeneration:
        model = IMAGE_MODEL_REGISTRY[model_key]
        image_url: str
        thumbnail_url: str
        if model_key == 'openai_image':
            if not self.settings.openai_api_key:
                raise RuntimeError('OPENAI_API_KEY is not configured for OpenAI image generation')
            logger.info('image_generation_provider_selected', extra={'provider': 'openai_images', 'model_key': model_key})
            image_url, thumbnail_url = self._generate_with_openai_image(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
            )
        elif model_key == 'nano_banana' and self.settings.gemini_api_key:
            logger.info('image_generation_provider_selected', extra={'provider': 'gemini', 'model_key': model_key})
            image_url, thumbnail_url = self._generate_with_gemini(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
            )
        elif self.settings.together_api_key:
            try:
                logger.info('image_generation_provider_selected', extra={'provider': 'together', 'model_key': model_key})
                remote_url = self._generate_with_together(
                    model_key=model_key,
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    reference_urls=reference_urls,
                )
                image_url = remote_url
                thumbnail_url = remote_url
            except Exception as exc:
                logger.warning('together_image_generation_fallback', extra={'error': str(exc), 'model_key': model_key})
                image_url, thumbnail_url = self._create_local_placeholder(
                    model=model,
                    prompt=prompt,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    reference_urls=reference_urls,
                )
        else:
            image_url, thumbnail_url = self._create_local_placeholder(
                model=model,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                reference_urls=reference_urls,
            )

        generation = self.repo.create(
            user_id=user_id,
            parent_image_id=None,
            model_key=model_key,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=json.dumps(reference_urls),
            image_url=image_url,
            thumbnail_url=thumbnail_url,
            action_type=None,
            status=ImageGenerationStatus.completed,
        )
        self.tagging.auto_tag_image(generation)
        logger.info('image_generation_created', extra={'render_id': generation.id, 'model_key': model_key})
        return generation

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
        source_path = self._url_to_local_path(source.image_url)

        if source_path.exists():
            self._run_ffmpeg_png(
                source_path=source_path,
                output_path=output_file,
                alpha=0.72,
            )
        else:
            self._write_placeholder_png(output_file, source.aspect_ratio)
        self._write_placeholder_png(thumb_file, source.aspect_ratio)

        reference_urls = self._parse_reference_urls(source)
        item = self.repo.create(
            user_id=source.user_id,
            parent_image_id=source.id,
            model_key=source.model_key,
            prompt=source.prompt,
            aspect_ratio=source.aspect_ratio,
            resolution=source.resolution,
            reference_urls=json.dumps([source.image_url, *reference_urls]),
            image_url=f'/static/image_generations/{output_file.name}',
            thumbnail_url=f'/static/image_generations/{thumb_file.name}',
            action_type='remove_background',
            status=ImageGenerationStatus.completed,
        )
        self.tagging.auto_tag_image(item)
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

        item = self.repo.create(
            user_id=source.user_id,
            parent_image_id=source.id,
            model_key=source.model_key,
            prompt=source.prompt,
            aspect_ratio=source.aspect_ratio,
            resolution=next_resolution,
            reference_urls=json.dumps([source.image_url, *reference_urls]),
            image_url=f'/static/image_generations/{output_file.name}',
            thumbnail_url=f'/static/image_generations/{thumb_file.name}',
            action_type='upscale',
            status=ImageGenerationStatus.completed,
        )
        self.tagging.auto_tag_image(item)
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
            item = self.repo.create(
                    user_id=source.user_id,
                    parent_image_id=source.id,
                    model_key=source.model_key,
                    prompt=prompt,
                    aspect_ratio=source.aspect_ratio,
                    resolution=source.resolution,
                    reference_urls=json.dumps(base_seed_references),
                    image_url=f'/static/image_generations/{output_file.name}',
                    thumbnail_url=f'/static/image_generations/{thumb_file.name}',
                    action_type='variation',
                    status=ImageGenerationStatus.completed,
                )
            self.tagging.auto_tag_image(item)
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
            'nano_banana': ('#f59e0b', '#f97316', '#7c3aed'),
            'seedream': ('#0f172a', '#334155', '#c084fc'),
            'flux_spark': ('#0f766e', '#14b8a6', '#f8fafc'),
            'recraft_studio': ('#db2777', '#7c3aed', '#f59e0b'),
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

    def _generate_with_together(
        self,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str],
    ) -> str:
        provider_model = TOGETHER_IMAGE_MODELS.get(model_key)
        if not provider_model:
            raise ValueError(f'Unsupported Together model mapping for {model_key}')

        width, height = self._together_dimensions(aspect_ratio, resolution)
        payload: dict[str, object] = {
            'model': provider_model,
            'prompt': prompt,
            'width': width,
            'height': height,
            'steps': 28,
            'n': 1,
            'response_format': 'url',
        }
        if reference_urls:
            payload['image_url'] = reference_urls[0]

        request = urllib.request.Request(
            url=f'{self.settings.together_api_base.rstrip("/")}/images/generations',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {self.settings.together_api_key}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode('utf-8')
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='ignore')
            raise RuntimeError(f'Together API HTTP {exc.code}: {detail[:400]}') from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f'Together API connection failed: {exc.reason}') from exc

        data = json.loads(raw)
        if not isinstance(data, dict):
            raise RuntimeError('Together API returned unexpected payload')
        items = data.get('data') or []
        if not isinstance(items, list) or not items:
            raise RuntimeError('Together API returned no image data')
        url = items[0].get('url')
        if not url:
            raise RuntimeError('Together API returned no image URL')
        return str(url)

    def _generate_with_gemini(
        self,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
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
            url=f'{self.settings.gemini_api_base.rstrip("/")}/models/{GEMINI_IMAGE_MODEL}:generateContent',
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
        for candidate in candidates:
            content = candidate.get('content', {})
            parts = content.get('parts') or []
            for part in parts:
                if 'inlineData' in part:
                    inline_data = part.get('inlineData')
                    break
            if inline_data:
                break
        if not inline_data:
            raise RuntimeError(f'Gemini API returned no image payload: {raw[:500]}')

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
            raise RuntimeError('OpenAI Images returned no image data')

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

        raise RuntimeError('OpenAI Images returned neither base64 data nor URL')

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
