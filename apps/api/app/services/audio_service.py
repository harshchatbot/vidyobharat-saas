from __future__ import annotations

import logging
from pathlib import Path

from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS, VideoPipelineService

logger = logging.getLogger(__name__)

RECIPE_MUSIC_MAP = {
    'playful': 'soft-motivation',
}


class RecipeAudioService:
    def __init__(self) -> None:
        self.pipeline = VideoPipelineService()

    def add_audio(self, *, video_path: Path, recipe_music: str | None, render_id: str) -> Path:
        if not recipe_music:
            return video_path

        track_id = RECIPE_MUSIC_MAP.get(recipe_music)
        if not track_id or track_id not in BUILTIN_MUSIC_TRACKS:
            logger.info('recipe_audio_track_unavailable', extra={'render_id': render_id, 'recipe_music': recipe_music})
            return video_path

        music_path = self.pipeline._resolve_music_path('library', track_id, None)
        if not music_path or not music_path.exists():
            logger.info('recipe_audio_track_missing', extra={'render_id': render_id, 'track_id': track_id})
            return video_path

        output_path = Path('data/renders') / f'{render_id}-music.mp4'
        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(video_path),
                '-stream_loop',
                '-1',
                '-i',
                str(music_path),
                '-filter_complex',
                '[1:a]atrim=0,asetpts=N/SR/TB,volume=0.28[aout]',
                '-map',
                '0:v',
                '-map',
                '[aout]',
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-shortest',
                str(output_path),
            ]
        )
        return output_path
