import json
import logging
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.image_generation_repository import ImageGenerationRepository
from app.models.entities import ImageGeneration, ImageGenerationStatus

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
    },
]


class ImageGenerationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ImageGenerationRepository(db)
        self.output_dir = Path('data/image_generations')
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.settings = get_settings()

    def list_models(self) -> list[ImageModelEntry]:
        return list(IMAGE_MODEL_REGISTRY.values())

    def list_user_images(self, user_id: str) -> list[ImageGeneration]:
        return self.repo.list_by_user(user_id)

    def list_inspiration(self) -> list[dict[str, str]]:
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
        svg_id = str(uuid4())
        output_file = self.output_dir / f'{svg_id}.svg'
        thumbnail_file = self.output_dir / f'{svg_id}_thumb.svg'

        svg_markup = self._build_svg(
            model=model,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=reference_urls,
            compact=False,
        )
        thumb_markup = self._build_svg(
            model=model,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=reference_urls,
            compact=True,
        )
        output_file.write_text(svg_markup, encoding='utf-8')
        thumbnail_file.write_text(thumb_markup, encoding='utf-8')

        generation = self.repo.create(
            user_id=user_id,
            model_key=model_key,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=json.dumps(reference_urls),
            image_url=f'/static/image_generations/{output_file.name}',
            thumbnail_url=f'/static/image_generations/{thumbnail_file.name}',
            status=ImageGenerationStatus.completed,
        )
        logger.info('image_generation_created', extra={'render_id': generation.id, 'model_key': model_key})
        return generation

    def apply_action(self, user_id: str, generation_id: str, action: str) -> ImageGeneration:
        generation = self.repo.get_by_id(generation_id)
        if generation is None or generation.user_id != user_id:
            raise ValueError('Image not found')

        reference_urls: list[str] = []
        try:
            reference_urls = json.loads(generation.reference_urls or '[]')
        except json.JSONDecodeError:
            reference_urls = []

        next_prompt = generation.prompt
        next_resolution = generation.resolution
        next_references = [generation.image_url, *reference_urls]

        if action == 'remove_background':
            next_prompt = f'{generation.prompt}. Isolated subject, clean transparent-style background, no environment clutter.'
        elif action == 'upscale':
            next_prompt = f'{generation.prompt}. Ultra-detailed upscale, sharper textures, polished high-resolution finish.'
            next_resolution = self._next_resolution(generation.resolution)
        elif action == 'variation':
            next_prompt = f'{generation.prompt}. Create a close variation with a fresh mood, lighting shift, and subtle composition change.'
        else:
            raise ValueError('Unsupported action')

        return self.create_image(
            user_id=user_id,
            model_key=generation.model_key,
            prompt=next_prompt,
            aspect_ratio=generation.aspect_ratio,
            resolution=next_resolution,
            reference_urls=next_references,
        )

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
