from __future__ import annotations

import logging
from base64 import b64decode
from pathlib import Path
from uuid import uuid4

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TogetherImageService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate(self, *, prompt: str, aspect_ratio: str, resolution: str, reference_urls: list[str]) -> tuple[str, str]:
        if not self.settings.together_api_key:
            raise RuntimeError('TOGETHER_API_KEY is not configured for Together image generation')

        output_dir = Path('data/image_generations')
        output_dir.mkdir(parents=True, exist_ok=True)
        image_id = str(uuid4())
        image_path = output_dir / f'{image_id}.png'
        thumb_path = output_dir / f'{image_id}_thumb.png'

        payload = {
            'model': self.settings.together_image_model,
            'prompt': prompt,
            'steps': 4,
            'n': 1,
            'width': self._width_for(aspect_ratio, resolution),
            'height': self._height_for(aspect_ratio, resolution),
        }
        if reference_urls:
            payload['image_url'] = reference_urls[0]

        with httpx.Client(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
            response = client.post(
                f'{self.settings.together_api_base.rstrip("/")}/images/generations',
                headers={'Authorization': f'Bearer {self.settings.together_api_key}'},
                json=payload,
            )
            if response.status_code >= 400:
                raise RuntimeError(f'Together image generation failed ({response.status_code}): {response.text[:240]}')
            data = response.json()

        base64_payload = None
        image_url = None
        if isinstance(data, dict):
            items = data.get('data') or data.get('output') or []
            if isinstance(items, list) and items:
                first = items[0] or {}
                base64_payload = first.get('b64_json') or first.get('base64')
                image_url = first.get('url') or first.get('image_url')

        if base64_payload:
            image_bytes = b64decode(base64_payload)
            image_path.write_bytes(image_bytes)
            thumb_path.write_bytes(image_bytes)
            return str(image_path), str(thumb_path)
        if isinstance(image_url, str) and image_url.strip():
            return image_url.strip(), image_url.strip()
        raise RuntimeError('Together image generation returned no image payload')

    def _width_for(self, aspect_ratio: str, resolution: str) -> int:
        mapping = {
            ('1:1', '1024'): 1024,
            ('1:1', '1536'): 1536,
            ('1:1', '2048'): 2048,
            ('9:16', '1024'): 1024,
            ('9:16', '1536'): 1080,
            ('9:16', '2048'): 1440,
            ('16:9', '1024'): 1280,
            ('16:9', '1536'): 1536,
            ('16:9', '2048'): 2048,
            ('4:5', '1024'): 1024,
            ('4:5', '1536'): 1228,
            ('4:5', '2048'): 1638,
        }
        return mapping.get((aspect_ratio, resolution), 1024)

    def _height_for(self, aspect_ratio: str, resolution: str) -> int:
        mapping = {
            ('1:1', '1024'): 1024,
            ('1:1', '1536'): 1536,
            ('1:1', '2048'): 2048,
            ('9:16', '1024'): 1820,
            ('9:16', '1536'): 1920,
            ('9:16', '2048'): 2560,
            ('16:9', '1024'): 720,
            ('16:9', '1536'): 1024,
            ('16:9', '2048'): 1152,
            ('4:5', '1024'): 1280,
            ('4:5', '1536'): 1536,
            ('4:5', '2048'): 2048,
        }
        return mapping.get((aspect_ratio, resolution), 1024)
