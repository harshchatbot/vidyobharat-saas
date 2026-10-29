from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from app.services.editor_service import EditorService, EditorValidationError, MediaProbeError, MediaTrimError


def _create_test_video(path: Path, *, with_audio: bool) -> None:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=160x120:rate=24",
    ]
    if with_audio:
        command.extend(
            [
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=880:sample_rate=44100",
            ]
        )
    command.extend(["-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p"])
    if with_audio:
        command.extend(["-c:a", "aac", "-shortest"])
    command.append(str(path))
    subprocess.run(command, check=True, capture_output=True)


def test_trim_video_outputs_h264_aac_mp4(tmp_path: Path) -> None:
    source = tmp_path / "source-with-audio.mp4"
    output = tmp_path / "trimmed.mp4"
    _create_test_video(source, with_audio=True)
    service = EditorService()

    assert service.get_duration(source) == pytest.approx(2.0, abs=0.05)

    result = service.trim_video(
        source,
        output,
        start_seconds=0.4,
        end_seconds=1.4,
    )

    assert output.is_file()
    assert output.stat().st_size > 0
    assert result.video_codec == "h264"
    assert result.audio_codec == "aac"
    assert result.has_video is True
    assert result.has_audio is True
    assert result.duration_seconds == pytest.approx(1.0, abs=0.12)


@pytest.mark.parametrize(
    ("start_seconds", "end_seconds"),
    [
        (-0.1, 1.0),
        (0.5, 0.5),
        (1.2, 0.8),
        (0.0, 2.5),
        (float("nan"), 1.0),
    ],
)
def test_trim_video_rejects_invalid_ranges(
    tmp_path: Path,
    start_seconds: float,
    end_seconds: float,
) -> None:
    source = tmp_path / "source.mp4"
    _create_test_video(source, with_audio=True)

    with pytest.raises(EditorValidationError):
        EditorService().trim_video(
            source,
            tmp_path / "invalid.mp4",
            start_seconds=start_seconds,
            end_seconds=end_seconds,
        )


def test_trim_video_rejects_input_output_collision(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    _create_test_video(source, with_audio=True)

    with pytest.raises(EditorValidationError, match="must be different"):
        EditorService().trim_video(
            source,
            source,
            start_seconds=0.0,
            end_seconds=1.0,
        )


def test_trim_video_rejects_output_symlink_without_changing_target(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    target = tmp_path / "existing-target.mp4"
    output_link = tmp_path / "output.mp4"
    _create_test_video(source, with_audio=True)
    target.write_bytes(b"do-not-overwrite")
    output_link.symlink_to(target)

    with pytest.raises(EditorValidationError, match="symbolic link"):
        EditorService().trim_video(
            source,
            output_link,
            start_seconds=0.0,
            end_seconds=1.0,
        )

    assert target.read_bytes() == b"do-not-overwrite"


def test_trim_video_cleans_temporary_file_when_ffmpeg_fails(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    output = tmp_path / "failed.mp4"
    _create_test_video(source, with_audio=True)

    with pytest.raises(MediaTrimError, match="Required media binary"):
        EditorService(ffmpeg_binary="missing-rangmanch-ffmpeg").trim_video(
            source,
            output,
            start_seconds=0.0,
            end_seconds=1.0,
        )

    assert not output.exists()
    assert list(tmp_path.glob(".failed-*.mp4")) == []


@pytest.mark.parametrize("timeout", [0.0, -1.0, float("inf"), float("nan"), None])
def test_editor_service_rejects_invalid_timeout(timeout: float | None) -> None:
    with pytest.raises(EditorValidationError, match="positive finite"):
        EditorService(command_timeout_seconds=timeout)  # type: ignore[arg-type]


def test_media_probe_reports_subprocess_timeout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    source = tmp_path / "source.mp4"
    source.write_bytes(b"placeholder")

    def raise_timeout(*args: object, **kwargs: object) -> None:
        raise subprocess.TimeoutExpired(cmd="ffprobe", timeout=0.01)

    monkeypatch.setattr(subprocess, "run", raise_timeout)

    with pytest.raises(MediaProbeError, match="command timed out"):
        EditorService(command_timeout_seconds=0.01).inspect_media(source)


def test_trim_video_handles_input_without_audio(tmp_path: Path) -> None:
    source = tmp_path / "silent-source.mp4"
    output = tmp_path / "silent-trimmed.mp4"
    _create_test_video(source, with_audio=False)

    result = EditorService().trim_video(
        source,
        output,
        start_seconds=0.25,
        end_seconds=1.25,
    )

    assert output.is_file()
    assert result.video_codec == "h264"
    assert result.has_video is True
    assert result.has_audio is False
    assert result.audio_codec is None
    assert result.duration_seconds == pytest.approx(1.0, abs=0.12)
