from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.editor import (
    TimelineAudioItem,
    TimelineClip,
    TimelineComposition,
    TimelineCropMode,
    TimelineEffect,
    TimelineTextOverlay,
)
from app.services.timeline_render_service import (
    ResolvedTimelineMedia,
    TimelineProcessError,
    TimelineBusyError,
    TimelineRenderLimits,
    TimelineRenderService,
    TimelineValidationError,
)


RED = 'a' * 32
GREEN = 'b' * 32
BLUE = 'c' * 32
AUDIO = 'd' * 32


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True)


def _image(path: Path, color: str, *, size: str = '160x90') -> None:
    _run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', f'color=c={color}:s={size}',
            '-frames:v', '1', str(path),
        ]
    )


def _video(path: Path, color: str, *, with_audio: bool, duration: float = 1.2) -> None:
    command = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', f'color=c={color}:s=160x90:r=15:d={duration}',
    ]
    if with_audio:
        command.extend(['-f', 'lavfi', '-i', f'sine=frequency=600:sample_rate=48000:duration={duration}'])
    command.extend(['-c:v', 'libx264', '-pix_fmt', 'yuv420p'])
    if with_audio:
        command.extend(['-c:a', 'aac', '-shortest'])
    command.append(str(path))
    _run(command)


def _audio(path: Path, *, duration: float = 1.2) -> None:
    _run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', f'sine=frequency=880:sample_rate=48000:duration={duration}',
        '-c:a', 'aac', str(path),
    ])


def _two_color_video(path: Path) -> None:
    _run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=15:d=1',
            '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=15:d=1',
            '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
            '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(path),
        ]
    )


def _video_with_long_audio(path: Path) -> None:
    _run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=15:d=0.8',
            '-f', 'lavfi', '-i', 'sine=frequency=600:sample_rate=48000:duration=1.8',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(path),
        ]
    )


def _resolved(media_id: str, media_type: str, path: Path) -> ResolvedTimelineMedia:
    return ResolvedTimelineMedia(media_id, media_type, path, path.stat().st_size)


def _composition(*clips: TimelineClip, width: int = 180, height: int = 320, fps: int = 10) -> TimelineComposition:
    return TimelineComposition(width=width, height=height, fps=fps, clips=list(clips))


def _clip(media_id: str, order: int, duration: float, *, start: float = 0, crop: str = 'cover') -> TimelineClip:
    return TimelineClip(
        media_id=media_id,
        order=order,
        start_seconds=start,
        duration_seconds=duration,
        crop_mode=crop,
    )


def _pixel(path: Path, timestamp: float, *, x: int = 90, y: int = 160) -> tuple[int, int, int]:
    completed = subprocess.run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error',
            '-ss', f'{timestamp:.3f}', '-i', str(path),
            '-vf', f'crop=1:1:{x}:{y},format=rgb24',
            '-frames:v', '1', '-f', 'rawvideo', '-',
        ],
        check=True,
        capture_output=True,
    )
    return tuple(completed.stdout[:3])  # type: ignore[return-value]


def _probe(path: Path) -> dict:
    completed = subprocess.run(
        ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_images_only_renders_in_timeline_order_and_cleans_workspace(tmp_path: Path) -> None:
    red = tmp_path / 'red.png'
    blue = tmp_path / 'blue.png'
    _image(red, 'red')
    _image(blue, 'blue')
    timeline = _composition(_clip(BLUE, 1, 0.5), _clip(RED, 0, 0.5))

    result = TimelineRenderService().render(
        timeline,
        [_resolved(RED, 'image', red), _resolved(BLUE, 'image', blue)],
    )
    output = result.path
    assert _pixel(output, 0.2)[0] > 180
    assert _pixel(output, 0.7)[2] > 180
    assert result.metadata.duration_seconds == pytest.approx(1.0, abs=0.15)
    assert result.metadata.faststart is True
    result.close()
    assert not output.exists()


def test_video_trim_selects_requested_source_range(tmp_path: Path) -> None:
    source = tmp_path / 'two-colors.mp4'
    _two_color_video(source)
    timeline = _composition(_clip(RED, 0, 0.6, start=1.1))

    with TimelineRenderService().render(timeline, [_resolved(RED, 'video', source)]) as result:
        pixel = _pixel(result.path, 0.2)
        assert pixel[2] > 180 and pixel[0] < 80
        assert result.metadata.duration_seconds == pytest.approx(0.6, abs=0.15)


def test_mixed_audio_and_silent_media_produces_normalized_aac_audio(tmp_path: Path) -> None:
    image = tmp_path / 'green.png'
    silent = tmp_path / 'silent.mp4'
    audible = tmp_path / 'audible.mp4'
    _image(image, 'green')
    _video(silent, 'blue', with_audio=False)
    _video(audible, 'red', with_audio=True)
    timeline = _composition(
        _clip(GREEN, 0, 0.4),
        _clip(BLUE, 1, 0.4),
        _clip(RED, 2, 0.4),
    )

    with TimelineRenderService().render(
        timeline,
        [
            _resolved(GREEN, 'image', image),
            _resolved(BLUE, 'video', silent),
            _resolved(RED, 'video', audible),
        ],
    ) as result:
        probe = _probe(result.path)
        streams = probe['streams']
        video = next(stream for stream in streams if stream['codec_type'] == 'video')
        audio = next(stream for stream in streams if stream['codec_type'] == 'audio')
        assert video['codec_name'] == 'h264'
        assert video['pix_fmt'] == 'yuv420p'
        assert (video['width'], video['height']) == (180, 320)
        assert video['avg_frame_rate'] == '10/1'
        assert audio['codec_name'] == 'aac'


def test_text_audio_and_effects_render_into_browser_compatible_output(tmp_path: Path) -> None:
    image = tmp_path / 'image.png'
    audio = tmp_path / 'music.m4a'
    _image(image, 'red')
    _audio(audio)
    timeline = TimelineComposition(
        width=180,
        height=320,
        fps=10,
        clips=[_clip(RED, 0, 1)],
        text_overlays=[TimelineTextOverlay(
            id='title', text='RangManch', start_seconds=0, duration_seconds=1,
            font_family='Inter', font_size=28, color='#ffffff', bold=True, position='center',
        )],
        audio_items=[TimelineAudioItem(
            id='music', media_id=AUDIO, kind='music', start_seconds=0.2,
            duration_seconds=0.7, source_start_seconds=0.1, volume=0.5,
        )],
        effects=[
            TimelineEffect(id='contrast', preset='contrast', start_seconds=0, duration_seconds=1, amount=1.2),
            TimelineEffect(id='vignette', preset='vignette', start_seconds=0, duration_seconds=1, amount=0.5),
        ],
    )

    with TimelineRenderService().render(
        timeline,
        [_resolved(RED, 'image', image), _resolved(AUDIO, 'audio', audio)],
    ) as result:
        payload = _probe(result.path)
        assert any(stream['codec_type'] == 'audio' and stream['codec_name'] == 'aac' for stream in payload['streams'])
        assert result.metadata.duration_seconds == pytest.approx(1, abs=0.15)


def test_freeform_text_style_and_rotation_render_successfully(tmp_path: Path) -> None:
    image = tmp_path / 'image.png'
    _image(image, 'blue')
    timeline = TimelineComposition(
        width=180,
        height=320,
        fps=10,
        clips=[_clip(RED, 0, 0.5)],
        text_overlays=[TimelineTextOverlay(
            id='title', text='Freeform', start_seconds=0, duration_seconds=0.5,
            font_family='Inter', font_size=24, color='#ffffff', bold=True,
            x=0.3, y=0.22, width=0.5, rotation_degrees=-14, alignment='left',
            outline_color='#000000', outline_width=2, shadow=False,
            background_color='#ff0000', background_opacity=0.5,
        )],
    )

    with TimelineRenderService().render(timeline, [_resolved(RED, 'image', image)]) as result:
        assert result.metadata.video_codec == 'h264'
        assert result.metadata.duration_seconds == pytest.approx(0.5, abs=0.15)


def test_freeform_text_schema_rejects_unsafe_coordinates_and_non_finite_rotation() -> None:
    base = dict(id='title', text='Title', start_seconds=0.0, duration_seconds=0.5)
    with pytest.raises(ValidationError):
        TimelineTextOverlay(**base, x=0.0, y=0.5)
    with pytest.raises(ValidationError):
        TimelineTextOverlay(**base, x=0.5, y=0.5, rotation_degrees=float('nan'))


@pytest.mark.parametrize(
    ('in_animation', 'out_animation', 'loop_animation'),
    [
        ('fade-in', 'none', 'none'),
        ('slide-up', 'none', 'none'),
        ('pop-in', 'none', 'none'),
        ('none', 'fade-out', 'none'),
        ('none', 'slide-down', 'none'),
        ('none', 'none', 'pulse'),
        ('none', 'none', 'float'),
    ],
)
def test_text_animations_have_working_ffmpeg_mappings(
    tmp_path: Path,
    in_animation: str,
    out_animation: str,
    loop_animation: str,
) -> None:
    image = tmp_path / f'{in_animation}-{out_animation}-{loop_animation}.png'
    _image(image, 'blue')
    timeline = TimelineComposition(
        width=180, height=320, fps=10,
        clips=[_clip(RED, 0, 0.6)],
        text_overlays=[TimelineTextOverlay(
            id='animated-title', text='Animate', start_seconds=0, duration_seconds=0.6,
            font_size=24, x=0.5, y=0.5,
            in_animation=in_animation, out_animation=out_animation, loop_animation=loop_animation,
            in_animation_duration=0.2, out_animation_duration=0.2,
        )],
    )
    with TimelineRenderService().render(timeline, [_resolved(RED, 'image', image)]) as result:
        assert result.metadata.video_codec == 'h264'
        assert result.metadata.duration_seconds == pytest.approx(0.6, abs=0.15)


def test_text_animation_defaults_preserve_legacy_payload_compatibility() -> None:
    overlay = TimelineTextOverlay(id='legacy', text='Legacy', start_seconds=0, duration_seconds=1)
    assert overlay.in_animation.value == 'none'
    assert overlay.out_animation.value == 'none'
    assert overlay.loop_animation.value == 'none'


def test_text_schema_rejects_overlapping_in_and_out_animations() -> None:
    with pytest.raises(ValidationError, match='overlap'):
        TimelineTextOverlay(
            id='overlap', text='Overlap', start_seconds=0, duration_seconds=0.5,
            in_animation='fade-in', out_animation='fade-out',
            in_animation_duration=0.4, out_animation_duration=0.4,
        )


def test_enhanced_timeline_rejects_items_past_visual_duration() -> None:
    with pytest.raises(ValidationError, match='beyond the visual timeline'):
        TimelineComposition(
            clips=[_clip(RED, 0, 1)],
            effects=[TimelineEffect(id='late', preset='grayscale', start_seconds=0.8, duration_seconds=0.3)],
        )


@pytest.mark.parametrize(
    'preset,amount',
    [
        ('fade-in', 1), ('fade-out', 1), ('zoom-in', 1), ('grayscale', 1),
        ('blur', 0.4), ('brightness', 1.1), ('contrast', 1.2),
        ('vibrance', 1.2), ('vignette', 0.6), ('saturation', 1.3),
    ],
)
def test_each_supported_effect_has_an_ffmpeg_render_mapping(tmp_path: Path, preset: str, amount: float) -> None:
    image = tmp_path / f'{preset}.png'
    _image(image, 'green')
    timeline = TimelineComposition(
        width=180, height=320, fps=10,
        clips=[_clip(RED, 0, 0.4)],
        effects=[TimelineEffect(id=preset, preset=preset, start_seconds=0, duration_seconds=0.4, amount=amount)],
    )
    with TimelineRenderService().render(timeline, [_resolved(RED, 'image', image)]) as result:
        assert result.metadata.video_codec == 'h264'


def test_cover_and_contain_apply_expected_geometry(tmp_path: Path) -> None:
    source = tmp_path / 'wide.png'
    _image(source, 'red', size='320x80')
    service = TimelineRenderService()

    cover = _composition(_clip(RED, 0, 0.4, crop='cover'))
    with service.render(cover, [_resolved(RED, 'image', source)]) as result:
        assert _pixel(result.path, 0.2, x=90, y=5)[0] > 180

    contain = _composition(_clip(RED, 0, 0.4, crop='contain'))
    with service.render(contain, [_resolved(RED, 'image', source)]) as result:
        top = _pixel(result.path, 0.2, x=90, y=5)
        middle = _pixel(result.path, 0.2, x=90, y=160)
        assert max(top) < 30
        assert middle[0] > 180


def test_timeline_schema_rejects_invalid_order_ratio_and_values() -> None:
    with pytest.raises(ValidationError):
        _composition(_clip(RED, 1, 1))
    with pytest.raises(ValidationError):
        TimelineComposition(width=200, height=320, clips=[_clip(RED, 0, 1)])
    with pytest.raises(ValidationError):
        _clip(RED, 0, 0)
    with pytest.raises(ValidationError):
        _clip('not-a-media-id', 0, 1)
    with pytest.raises(ValidationError):
        _clip(RED, True, 1)  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        TimelineClip(media_id=RED, order=0, duration_seconds='1')  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        _clip(RED, 0, float('nan'))
    with pytest.raises(ValidationError):
        _clip(RED, 0, float('inf'))
    with pytest.raises(ValidationError):
        _clip(RED, 0, 1, crop='stretch')
    with pytest.raises(ValidationError):
        TimelineComposition(
            clips=[_clip(RED, 0, 60.1), _clip(BLUE, 1, 60.1)],
        )


def test_render_rejects_configured_clip_duration_and_output_limits() -> None:
    many_clips = [
        _clip(f'{index:032x}', index, 0.1)
        for index in range(13)
    ]
    with pytest.raises(TimelineValidationError, match='clip limit'):
        TimelineRenderService().render(_composition(*many_clips), [])
    with pytest.raises(TimelineValidationError, match='duration limit'):
        TimelineRenderService(limits=TimelineRenderLimits(max_total_duration_seconds=0.5)).render(
            _composition(_clip(RED, 0, 0.6)),
            [],
        )
    with pytest.raises(TimelineValidationError, match='resolution'):
        TimelineRenderService().render(
            _composition(_clip(RED, 0, 0.5), width=900, height=1600),
            [],
        )


def test_render_rejects_video_bounds_image_start_unknown_and_symlink(tmp_path: Path) -> None:
    video = tmp_path / 'video.mp4'
    image = tmp_path / 'image.png'
    link = tmp_path / 'link.png'
    _video(video, 'red', with_audio=False)
    _image(image, 'blue')
    link.symlink_to(image)
    service = TimelineRenderService()

    with pytest.raises(TimelineValidationError, match='source duration'):
        service.render(_composition(_clip(RED, 0, 1, start=0.5)), [_resolved(RED, 'video', video)])
    with pytest.raises(TimelineValidationError, match='source duration'):
        service.render(_composition(_clip(RED, 0, 0.20001, start=1.0)), [_resolved(RED, 'video', video)])
    with pytest.raises(TimelineValidationError, match='non-zero start'):
        service.render(_composition(_clip(BLUE, 0, 0.5, start=0.1)), [_resolved(BLUE, 'image', image)])
    with pytest.raises(TimelineValidationError, match='exactly once'):
        service.render(_composition(_clip(RED, 0, 0.5)), [_resolved(BLUE, 'image', image)])
    with pytest.raises(TimelineValidationError, match='non-symlink'):
        service.render(_composition(_clip(BLUE, 0, 0.5)), [_resolved(BLUE, 'image', link)])


def test_video_bounds_use_visual_stream_not_longer_audio_stream(tmp_path: Path) -> None:
    source = tmp_path / 'long-audio.mp4'
    _video_with_long_audio(source)

    with pytest.raises(TimelineValidationError, match='source duration'):
        TimelineRenderService().render(
            _composition(_clip(RED, 0, 0.3, start=1.0)),
            [_resolved(RED, 'video', source)],
        )


def test_render_rejects_malformed_media_and_source_byte_limit(tmp_path: Path) -> None:
    malformed = tmp_path / 'malformed.bin'
    malformed.write_bytes(b'not media')
    item = _resolved(RED, 'video', malformed)
    with pytest.raises(TimelineProcessError, match='FFprobe'):
        TimelineRenderService().render(_composition(_clip(RED, 0, 0.5)), [item])

    image = tmp_path / 'image.png'
    _image(image, 'red')
    limits = TimelineRenderLimits(max_source_bytes=image.stat().st_size - 1)
    with pytest.raises(TimelineValidationError, match='byte limit'):
        TimelineRenderService(limits=limits).render(
            _composition(_clip(RED, 0, 0.5)),
            [_resolved(RED, 'image', image)],
        )


def test_render_rejects_clip_shorter_than_one_output_frame(tmp_path: Path) -> None:
    image = tmp_path / 'image.png'
    _image(image, 'red')

    with pytest.raises(TimelineValidationError, match='one output frame'):
        TimelineRenderService().render(
            _composition(_clip(RED, 0, 0.01), fps=30),
            [_resolved(RED, 'image', image)],
        )


def test_reserved_workspace_bytes_count_toward_render_disk_limit(tmp_path: Path) -> None:
    image = tmp_path / 'image.png'
    fake = tmp_path / 'space-ffmpeg'
    _image(image, 'red')
    fake.write_text(
        '#!/bin/sh\nfor output do :; done\ndd if=/dev/zero of="$output" bs=1500 count=1 2>/dev/null\nsleep 2\n',
        encoding='ascii',
    )
    fake.chmod(0o700)
    limits = TimelineRenderLimits(
        max_workspace_bytes=100_000,
        max_output_bytes=90_000,
        ffmpeg_timeout_seconds=3,
    )

    with pytest.raises(TimelineProcessError, match='workspace byte limit'):
        TimelineRenderService(limits=limits, ffmpeg_binary=str(fake)).render(
            _composition(_clip(RED, 0, 0.4)),
            [_resolved(RED, 'image', image)],
            reserved_workspace_bytes=99_000,
        )


def test_ffprobe_metadata_output_is_bounded(tmp_path: Path) -> None:
    source = tmp_path / 'source.bin'
    fake_probe = tmp_path / 'fake-ffprobe'
    source.write_bytes(b'x')
    fake_probe.write_text(
        '#!/bin/sh\nyes x | head -c 1100000\n',
        encoding='ascii',
    )
    fake_probe.chmod(0o700)

    with pytest.raises(TimelineProcessError, match='safe output limit'):
        TimelineRenderService(ffprobe_binary=str(fake_probe)).render(
            _composition(_clip(RED, 0, 0.4)),
            [_resolved(RED, 'image', source)],
        )


@pytest.mark.parametrize(('script', 'message'), [('exit 2', 'failed'), ('sleep 2', 'timed out')])
def test_ffmpeg_failure_and_timeout_clean_temporary_workspace(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    script: str,
    message: str,
) -> None:
    image = tmp_path / 'image.png'
    fake = tmp_path / 'fake-ffmpeg'
    render_root = tmp_path / 'render-root'
    render_root.mkdir()
    _image(image, 'red')
    fake.write_text(f'#!/bin/sh\n{script}\n', encoding='ascii')
    fake.chmod(0o700)
    monkeypatch.setattr(tempfile, 'tempdir', str(render_root))
    limits = TimelineRenderLimits(ffmpeg_timeout_seconds=0.2 if 'sleep' in script else 2)

    with pytest.raises(TimelineProcessError, match=message):
        TimelineRenderService(limits=limits, ffmpeg_binary=str(fake)).render(
            _composition(_clip(RED, 0, 0.4)),
            [_resolved(RED, 'image', image)],
        )

    assert list(render_root.iterdir()) == []


def test_default_timeline_contract() -> None:
    timeline = TimelineComposition(clips=[_clip(RED, 0, 1)])
    assert timeline.aspect_ratio == '9:16'
    assert (timeline.width, timeline.height, timeline.fps) == (720, 1280, 30)
    assert timeline.clips[0].crop_mode == TimelineCropMode.cover


@pytest.mark.parametrize(
    ('aspect_ratio', 'width', 'height', 'fps', 'quality'),
    [
        ('9:16', 720, 1280, 24, 'standard'),
        ('16:9', 1920, 1080, 30, 'high'),
        ('1:1', 720, 720, 60, 'standard'),
        ('4:5', 1080, 1350, 24, 'high'),
    ],
)
def test_supported_export_presets_render_with_requested_geometry_and_fps(
    tmp_path: Path,
    aspect_ratio: str,
    width: int,
    height: int,
    fps: int,
    quality: str,
) -> None:
    image = tmp_path / f'{aspect_ratio.replace(":", "-")}.png'
    _image(image, 'red')
    timeline = TimelineComposition(
        aspect_ratio=aspect_ratio,
        width=width,
        height=height,
        fps=fps,
        quality=quality,
        clips=[_clip(RED, 0, 0.25)],
    )
    renderer = TimelineRenderService(limits=TimelineRenderLimits(
        max_output_width=1920,
        max_output_height=1920,
        max_fps=60,
        ffmpeg_timeout_seconds=60,
    ))

    with renderer.render(timeline, [_resolved(RED, 'image', image)]) as rendered:
        assert (rendered.metadata.width, rendered.metadata.height) == (width, height)
        assert rendered.metadata.fps == pytest.approx(fps, abs=0.01)
        assert rendered.metadata.faststart is True


def test_timeout_terminates_ffmpeg_process_group(tmp_path: Path) -> None:
    image = tmp_path / 'image.png'
    fake = tmp_path / 'tree-ffmpeg'
    child_pid_file = tmp_path / 'child.pid'
    _image(image, 'red')
    fake.write_text(
        f'#!/bin/sh\n(trap "" TERM; sleep 30) &\necho $! > "{child_pid_file}"\nwait\n',
        encoding='ascii',
    )
    fake.chmod(0o700)
    limits = TimelineRenderLimits(ffmpeg_timeout_seconds=1)

    with pytest.raises(TimelineProcessError, match='timed out'):
        TimelineRenderService(limits=limits, ffmpeg_binary=str(fake)).render(
            _composition(_clip(RED, 0, 0.4)),
            [_resolved(RED, 'image', image)],
        )

    assert child_pid_file.is_file()
    child_pid = int(child_pid_file.read_text().strip())
    for _ in range(20):
        try:
            os.kill(child_pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.05)
    else:
        pytest.fail('FFmpeg child process survived the render timeout')


def test_render_capacity_is_shared_across_service_instances(tmp_path: Path) -> None:
    image = tmp_path / 'image.png'
    fake = tmp_path / 'slow-ffmpeg'
    _image(image, 'red')
    fake.write_text('#!/bin/sh\nsleep 1\nexit 2\n', encoding='ascii')
    fake.chmod(0o700)
    limits = TimelineRenderLimits(max_concurrent_renders=1, ffmpeg_timeout_seconds=2)
    first = TimelineRenderService(limits=limits, ffmpeg_binary=str(fake))
    second = TimelineRenderService(limits=limits, ffmpeg_binary=str(fake))
    timeline = _composition(_clip(RED, 0, 0.4))
    source = [_resolved(RED, 'image', image)]
    started = threading.Event()

    def occupy_capacity() -> None:
        started.set()
        with pytest.raises(TimelineProcessError):
            first.render(timeline, source)

    thread = threading.Thread(target=occupy_capacity)
    thread.start()
    started.wait(timeout=1)
    time.sleep(0.1)
    try:
        with pytest.raises(TimelineBusyError):
            second.render(timeline, source)
    finally:
        thread.join(timeout=3)
    assert not thread.is_alive()
