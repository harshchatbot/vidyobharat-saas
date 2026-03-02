import base64
import json
import logging
import mimetypes
import subprocess
import tempfile
from collections.abc import Iterable
from pathlib import Path
from urllib.parse import urlparse

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.asset_tag_repository import AssetTagRepository
from app.models.entities import ImageGeneration, Video

logger = logging.getLogger(__name__)

STOP_WORDS = {
    'the', 'and', 'with', 'from', 'into', 'your', 'this', 'that', 'for', 'using', 'high', 'quality',
    'image', 'video', 'make', 'look', 'like', 'shot', 'soft', 'clean', 'premium', 'create', 'created',
}


class AssetTaggingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = AssetTagRepository(db)
        self.settings = get_settings()

    def list_tags(self, asset_id: str, asset_type: str) -> tuple[list[str], list[str]]:
        rows = self.repo.list_for_asset(asset_id=asset_id, asset_type=asset_type)
        auto_tags = [row.tag for row in rows if row.source == 'auto']
        user_tags = [row.tag for row in rows if row.source == 'user']
        return auto_tags, user_tags

    def replace_user_tags(self, asset_id: str, asset_type: str, tags: list[str]) -> tuple[list[str], list[str]]:
        rows = self.repo.replace_user_tags(asset_id=asset_id, asset_type=asset_type, tags=tags)
        auto_tags = [row.tag for row in rows if row.source == 'auto']
        user_tags = [row.tag for row in rows if row.source == 'user']
        return auto_tags, user_tags

    def auto_tag_image(self, generation: ImageGeneration) -> list[str]:
        prompt = generation.prompt
        vision_tags = self._extract_vision_tags(image_url=generation.image_url, prompt=prompt, content_type='image')
        derived = self._derive_tags(f'{prompt} {generation.model_key} {generation.aspect_ratio} {generation.resolution}')
        tags = self._dedupe_tags([*vision_tags, *derived, generation.model_key, generation.aspect_ratio, generation.resolution])
        self.repo.add_tags(asset_id=generation.id, asset_type='image', tags=tags, source='auto')
        return tags

    def auto_tag_video(self, video: Video) -> list[str]:
        prompt = ' '.join(filter(None, [video.title or '', video.script or '', video.selected_model or '', video.aspect_ratio, video.resolution]))
        # Tag multiple representative frames so video search is not limited to a single thumbnail.
        frame_urls = self._extract_video_frame_urls(video)
        vision_tags: list[str] = []
        for frame_url in frame_urls:
            vision_tags.extend(self._extract_vision_tags(image_url=frame_url, prompt=prompt, content_type='video'))
        if not vision_tags and video.thumbnail_url:
            vision_tags.extend(self._extract_vision_tags(image_url=video.thumbnail_url, prompt=prompt, content_type='video'))
        derived = self._derive_tags(prompt)
        tags = self._dedupe_tags([*vision_tags, *derived, video.selected_model or 'local_render', video.aspect_ratio, video.resolution])
        self.repo.add_tags(asset_id=video.id, asset_type='video', tags=tags, source='auto')
        return tags

    def tag_script(self, script: str) -> list[str]:
        if self.settings.openai_api_key:
            try:
                client = OpenAI(api_key=self.settings.openai_api_key)
                response = client.chat.completions.create(
                    model=self.settings.openai_model,
                    temperature=0.2,
                    response_format={'type': 'json_object'},
                    messages=[
                        {
                            'role': 'system',
                            'content': 'Return JSON only with {"tags": ["..."]}. Extract topic, style, character, setting, and intent tags.',
                        },
                        {'role': 'user', 'content': script},
                    ],
                )
                raw = response.choices[0].message.content or '{}'
                parsed = json.loads(raw)
                tags = parsed.get('tags', [])
                if isinstance(tags, list):
                    return self._dedupe_tags([str(tag) for tag in tags])
            except Exception as exc:
                logger.warning('script_tagging_fallback', extra={'error': str(exc)})
        return self._dedupe_tags(self._derive_tags(script))

    def _extract_vision_tags(self, image_url: str | None, prompt: str, content_type: str) -> list[str]:
        if not self.settings.openai_api_key or not image_url:
            return []
        try:
            client = OpenAI(api_key=self.settings.openai_api_key)
            image_payload = self._to_openai_image_url(image_url)
            if not image_payload:
                return []
            response = client.responses.create(
                model=self.settings.openai_model,
                input=[
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'input_text',
                                'text': (
                                    f'Analyze this {content_type} asset and return JSON with a "tags" array only. '
                                    'Include concrete objects, visual styles, scenes, concepts, and mood keywords. '
                                    f'Base prompt/context: {prompt}'
                                ),
                            },
                            {'type': 'input_image', 'image_url': image_payload},
                        ],
                    }
                ],
            )
            raw = getattr(response, 'output_text', '') or ''
            parsed = json.loads(raw) if raw.strip().startswith('{') else {'tags': []}
            tags = parsed.get('tags', [])
            if isinstance(tags, list):
                return [str(tag).strip().lower() for tag in tags if str(tag).strip()]
        except Exception as exc:
            logger.warning('asset_auto_tagging_fallback', extra={'error': str(exc), 'content_type': content_type})
        return []

    def _derive_tags(self, text: str) -> list[str]:
        cleaned = (
            text.lower()
            .replace(',', ' ')
            .replace('.', ' ')
            .replace(':', ' ')
            .replace('/', ' ')
            .replace('-', ' ')
        )
        words = [word.strip() for word in cleaned.split() if len(word.strip()) > 2]
        tags = [word for word in words if word not in STOP_WORDS]
        return tags[:12]

    def _dedupe_tags(self, tags: Iterable[str]) -> list[str]:
        seen: set[str] = set()
        output: list[str] = []
        for raw in tags:
            tag = raw.strip().lower()
            if not tag or tag in seen:
                continue
            seen.add(tag)
            output.append(tag)
        return output

    def _to_openai_image_url(self, image_url: str) -> str | None:
        if image_url.startswith('http://') or image_url.startswith('https://'):
            return image_url
        local_path = self._url_to_local_path(image_url)
        if not local_path.exists():
            return None
        mime_type = mimetypes.guess_type(local_path.name)[0] or 'image/png'
        encoded = base64.b64encode(local_path.read_bytes()).decode('utf-8')
        return f'data:{mime_type};base64,{encoded}'

    def _url_to_local_path(self, url: str) -> Path:
        normalized = url.strip()
        parsed = urlparse(normalized)
        if parsed.scheme in {'http', 'https'}:
            path = parsed.path
        else:
            path = normalized
        if path.startswith('/static/'):
            path = path.replace('/static/', '', 1)
        elif path.startswith('/'):
            path = path.lstrip('/')
        return Path('data') / path

    def _extract_video_frame_urls(self, video: Video) -> list[str]:
        local_path = None
        if video.output_url:
            candidate = self._url_to_local_path(video.output_url)
            if candidate.exists():
                local_path = candidate
        if not local_path:
            return []

        duration = self._probe_video_duration(local_path)
        if duration <= 0:
            return []

        timestamps = self._representative_timestamps(duration)
        if not timestamps:
            return []

        frame_dir = Path('data/tmp/video_tag_frames')
        frame_dir.mkdir(parents=True, exist_ok=True)

        frame_urls: list[str] = []
        for index, second in enumerate(timestamps, start=1):
            frame_name = f'{video.id}-frame-{index}.jpg'
            frame_path = frame_dir / frame_name
            try:
                self._write_video_frame(local_path=local_path, output_path=frame_path, timestamp=second)
                frame_urls.append(f'/static/tmp/video_tag_frames/{frame_name}')
            except Exception as exc:
                logger.warning('video_frame_tag_extract_failed', extra={'asset_id': video.id, 'timestamp': second, 'error': str(exc)})
        return frame_urls

    def _probe_video_duration(self, local_path: Path) -> float:
        try:
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-show_entries',
                    'format=duration',
                    '-of',
                    'default=noprint_wrappers=1:nokey=1',
                    str(local_path),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            return float((result.stdout or '0').strip() or '0')
        except Exception as exc:
            logger.warning('video_duration_probe_failed', extra={'path': str(local_path), 'error': str(exc)})
            return 0.0

    def _representative_timestamps(self, duration: float) -> list[float]:
        if duration <= 1.2:
            return [0.1]
        if duration <= 4.5:
            points = [0.2, duration * 0.5, max(duration - 0.3, 0.2)]
        elif duration <= 10:
            points = [0.5, duration * 0.33, duration * 0.66, max(duration - 0.5, 0.5)]
        else:
            points = [0.8, duration * 0.25, duration * 0.5, duration * 0.75, max(duration - 0.8, 0.8)]
        deduped: list[float] = []
        seen: set[int] = set()
        for point in points:
            clamped = max(0.1, min(duration - 0.1, point))
            marker = int(clamped * 10)
            if marker in seen:
                continue
            seen.add(marker)
            deduped.append(round(clamped, 2))
        return deduped

    def _write_video_frame(self, *, local_path: Path, output_path: Path, timestamp: float) -> None:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False, dir=output_path.parent) as temp_file:
            temp_path = Path(temp_file.name)
        try:
            subprocess.run(
                [
                    'ffmpeg',
                    '-y',
                    '-ss',
                    str(timestamp),
                    '-i',
                    str(local_path),
                    '-frames:v',
                    '1',
                    '-q:v',
                    '2',
                    str(temp_path),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            temp_path.replace(output_path)
        except subprocess.CalledProcessError as exc:
            if temp_path.exists():
                temp_path.unlink()
            stderr = exc.stderr.decode('utf-8', errors='ignore') if isinstance(exc.stderr, bytes) else str(exc.stderr)
            raise RuntimeError(stderr[:400]) from exc
