import logging
import subprocess
from pathlib import Path

from app.providers.broll import BrollProvider

logger = logging.getLogger(__name__)


class VideoPipelineService:
    def __init__(self) -> None:
        self.renders_dir = Path('data/renders')
        self.renders_dir.mkdir(parents=True, exist_ok=True)
        self.broll_provider = BrollProvider()

    def build_video(self, render_id: str, script: str, include_broll: bool) -> tuple[str, str]:
        output_path = self.renders_dir / f'{render_id}.mp4'
        thumb_path = self.renders_dir / f'{render_id}.jpg'

        if include_broll:
            self.broll_provider.fetch_clip(topic='india startup growth')

        caption = (script or 'VidyoBharat Render').replace(':', ' ').replace("'", '')[:80]
        cmd = [
            'ffmpeg',
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=0x111827:s=1280x720:d=6',
            '-vf',
            f"drawtext=text='{caption}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2",
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            str(output_path),
        ]

        try:
            subprocess.run(cmd, check=True, capture_output=True)
            subprocess.run(
                ['ffmpeg', '-y', '-i', str(output_path), '-frames:v', '1', str(thumb_path)],
                check=True,
                capture_output=True,
            )
        except Exception as exc:
            logger.warning('ffmpeg_unavailable_fallback', extra={'render_id': render_id, 'error': str(exc)})
            output_path.write_bytes(b'VIDYOBHARAT-MOCK-MP4')
            thumb_path.write_bytes(b'VIDYOBHARAT-MOCK-THUMB')

        return str(output_path), str(thumb_path)
