"""FFmpeg pre-render adapter for V1 HarshVerse recipes.

Keeps original presenter frames (no face generation) and original audio unmodified
except ordinary audio encoding. No network/API calls. Pre-rendered MP4 can enter
RangManch through its existing guest media upload endpoint.
"""
from __future__ import annotations

from pathlib import Path
import json
import subprocess
from .scene_plan import ScenePlan


def _probe(path: Path, ffprobe: str = 'ffprobe') -> dict:
    result = subprocess.run([ffprobe, '-v', 'error', '-show_format', '-show_streams',
                             '-of', 'json', str(path)], capture_output=True, text=True, check=True, timeout=30)
    return json.loads(result.stdout)


def _duration(meta: dict) -> float:
    return float(meta['format']['duration'])


def build_filter(plan: ScenePlan, *, visual_style: str = "classic", face_center_y: float = 0.5) -> str:
    """One continuous video track; source audio is mapped independently unchanged in timing."""
    if visual_style not in ("classic", "harshverse_warm"):
        raise ValueError("Unknown HarshVerse style")
    if not (0 <= face_center_y <= 1):
        raise ValueError("Invalid detected face center")
    w, h, fps = plan.width, plan.height, plan.fps
    strings: list[str] = []
    for i, scene in enumerate(plan.scenes):
        duration = scene.end - scene.start
        base = (f'[0:v]trim=start={scene.start:.6f}:duration={duration:.6f},'
                f'setpts=PTS-STARTPTS,fps={fps},'
                f'scale={w}:{h}:force_original_aspect_ratio=increase,'
                f'crop={w}:{h},setsar=1,format=yuv420p')
        if scene.recipe in ('presenter_hook', 'presenter_outro'):
            strings.append(base + f'[s{i}]')
            continue
        if scene.recipe == 'presenter_split':
            strings.append(base + f'[p{i}]')
        a = (f'[1:v]trim=start={scene.asset_offset:.6f}:duration={duration:.6f},'
             f'setpts=PTS-STARTPTS,fps={fps},')
        if scene.recipe == 'animated_explainer':
            strings.append(a + f'scale={w}:{h}:force_original_aspect_ratio=increase,'
                           f'crop={w}:{h},setsar=1,format=yuv420p[s{i}]')
        elif scene.recipe == 'presenter_split':
            # Show FULL presenter frame (rather than cropping away the face) in lower half.
            half = h // 2
            if visual_style == "harshverse_warm":
                # Portrait talking head fills the lower panel, instead of
                # shrinking to a narrow full-body frame with wide side bars.
                # Analysis V2 YuNet supplies a sparse face center as guidance.
                # No face synthesis, tracking or identity recognition occurs.
                top = max(0, min(h - half, round(face_center_y * h - half * 0.51)))
                strings.append(
                    f'[p{i}]crop={w}:{half}:0:{top},'
                    f'format=yuv420p[bot{i}]'
                )
            else:
                strings.append(f'[p{i}]scale={w}:{half}:force_original_aspect_ratio=decrease,'
                               f'pad={w}:{half}:(ow-iw)/2:(oh-ih)/2:color=0xF5F1E8[bot{i}]')
            if visual_style == "harshverse_warm":
                # Warm cream reveal conceals harsh plate boundaries without
                # trimming speech or shortening the scene. The plate remains
                # full size and only its opacity changes for 180 ms.
                fade = min(0.18, duration * 0.20)
                fade_out = max(0, duration - fade)
                strings.append(
                    f'color=c=0xF8F3E9:s={w}x{half}:r={fps}:'
                    f'd={duration:.6f}[cream{i}]'
                )
                strings.append(
                    a + f'scale={w}:{half}:force_original_aspect_ratio=increase,'
                    f'crop={w}:{half},setsar=1,format=yuva420p,'
                    f'fade=t=in:st=0:d={fade:.4f}:alpha=1,'
                    f'fade=t=out:st={fade_out:.4f}:d={fade:.4f}:alpha=1'
                    f'[panel{i}]'
                )
                strings.append(
                    f'[cream{i}][panel{i}]overlay=x=0:y=0:'
                    f'shortest=1:format=auto,format=yuv420p[top{i}]'
                )
            else:
                strings.append(a + f'scale={w}:{half}:force_original_aspect_ratio=increase,'
                               f'crop={w}:{half},setsar=1,format=yuv420p[top{i}]')
            strings.append(f'[top{i}][bot{i}]vstack=inputs=2,format=yuv420p[s{i}]')
    labels = ''.join(f'[s{i}]' for i in range(len(plan.scenes)))
    strings.append(f'{labels}concat=n={len(plan.scenes)}:v=1:a=0,format=yuv420p[vout]')
    return ';'.join(strings)


def render(plan: ScenePlan, presenter: Path, animation: Path, output: Path,
           *, ffmpeg: str = 'ffmpeg', ffprobe: str = 'ffprobe',
           visual_style: str = "classic", face_center_y: float = 0.5) -> None:
    presenter, animation, output = map(Path, (presenter, animation, output))
    if not presenter.is_file() or not animation.is_file():
        raise FileNotFoundError('presenter and animation videos must both exist')
    p_meta, a_meta = _probe(presenter, ffprobe), _probe(animation, ffprobe)
    p_duration, a_duration = _duration(p_meta), _duration(a_meta)
    plan.validate(asset_duration=a_duration)
    if p_duration + 0.05 < plan.duration:
        raise ValueError('presenter video shorter than the edit plan')
    if not any(s.get('codec_type') == 'audio' for s in p_meta['streams']):
        raise ValueError('presenter video must include original audio')
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
               '-i', str(presenter), '-i', str(animation),
               '-filter_complex', build_filter(plan, visual_style=visual_style, face_center_y=face_center_y),
               '-map', '[vout]', '-map', '0:a:0',
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
               '-r', str(plan.fps), '-c:a', 'aac', '-b:a', '192k',
               '-t', f'{plan.duration:.6f}', '-movflags', '+faststart', str(output)]
    subprocess.run(command, check=True, timeout=240)
    result = _probe(output, ffprobe)
    if abs(_duration(result) - plan.duration) > 0.12:
        raise RuntimeError('export duration mismatch')
