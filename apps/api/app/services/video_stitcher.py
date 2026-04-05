from __future__ import annotations

import tempfile
from pathlib import Path

from app.services.video_pipeline import VideoPipelineService


class VideoStitcher:
    def __init__(self) -> None:
        self.pipeline = VideoPipelineService()
        self.output_dir = Path('data/renders')
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def stitch_video(
        self,
        *,
        clips: list[str],
        render_id: str,
        aspect_ratio: str,
        resolution: str,
    ) -> Path:
        if not clips:
            raise ValueError('No clips provided for stitching')

        local_paths = [self.pipeline.ensure_local_media_path(clip) or Path(clip) for clip in clips]
        target_width, target_height = self.pipeline._resolve_target_size(aspect_ratio, resolution)
        normalized_paths: list[Path] = []
        for index, clip_path in enumerate(local_paths):
            if not clip_path.exists():
                raise FileNotFoundError(f'Clip not found for stitching: {clip_path}')
            normalized_path = self.output_dir / f'{render_id}-norm-{index}.mp4'
            self.pipeline._run(
                [
                    'ffmpeg',
                    '-y',
                    '-i',
                    str(clip_path),
                    '-vf',
                    f'scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p',
                    '-c:v',
                    'libx264',
                    '-preset',
                    'medium',
                    '-c:a',
                    'aac',
                    '-b:a',
                    '128k',
                    str(normalized_path),
                ]
            )
            normalized_paths.append(normalized_path)

        concat_file = Path(tempfile.mkdtemp(prefix='rangmanch-stitch-', dir='data/tmp')) / f'{render_id}.txt'
        concat_file.parent.mkdir(parents=True, exist_ok=True)
        concat_file.write_text(
            '\n'.join(f"file '{path.resolve()}'" for path in normalized_paths),
            encoding='utf-8',
        )

        concat_path = self.output_dir / f'{render_id}-concat.mp4'
        final_path = self.output_dir / f'{render_id}-stitched.mp4'
        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-f',
                'concat',
                '-safe',
                '0',
                '-i',
                str(concat_file),
                '-c:v',
                'libx264',
                '-preset',
                'medium',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                str(concat_path),
            ]
        )
        total_duration = max(0.1, self.pipeline._probe_duration(concat_path))
        fade_out_start = max(0.0, total_duration - 0.45)
        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(concat_path),
                '-vf',
                f'fade=t=in:st=0:d=0.35,fade=t=out:st={fade_out_start:.2f}:d=0.45',
                '-c:v',
                'libx264',
                '-preset',
                'medium',
                '-pix_fmt',
                'yuv420p',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                str(final_path),
            ]
        )
        return final_path
