"""Optional source-faithful video fade in/out, independent of audio.

A gentle whole-picture fade is a basic finalization effect, not a
cross-dissolve or an edit to speech. It deliberately runs AFTER the
presenter, motion graphics, buddy and captions are composited, so every
visual element fades as one coordinated frame.

True cross-shots transitions, J/L-cuts, jump cuts and B-roll require a
multi-clip cut-aware timeline and are NOT implemented by this module.
"""
from __future__ import annotations

from pathlib import Path
import math
import subprocess


def video_fade_filter(*, duration: float, fade_seconds: float) -> str:
    if not math.isfinite(duration) or not 0 < duration <= 60:
        raise ValueError("Invalid final video duration")
    if not math.isfinite(fade_seconds) or not 0 < fade_seconds <= 1.5:
        raise ValueError("Visual fade must be between zero and 1.5 seconds")
    if fade_seconds * 2 >= duration:
        raise ValueError("Visual fades would cover the entire video")
    fade_out = duration - fade_seconds
    return (f"fade=t=in:st=0:d={fade_seconds:.3f},"
            f"fade=t=out:st={fade_out:.3f}:d={fade_seconds:.3f},"
            "format=yuv420p")


def render_video_fades(
    source: Path, output: Path, *,
    duration: float, fade_seconds: float, ffmpeg: str = "ffmpeg",
) -> Path:
    source, output = Path(source), Path(output)
    if not source.is_file():
        raise FileNotFoundError("Final composite is missing")
    if source.resolve() == output.resolve():
        raise ValueError("Cannot overwrite final composite input")
    expr = video_fade_filter(duration=duration,fade_seconds=fade_seconds)
    output.parent.mkdir(parents=True,exist_ok=True)
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-map", "0:v:0", "-map", "0:a:0",
        "-vf", expr, "-t", f"{duration:.6f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "copy", "-movflags", "+faststart", str(output),
    ]
    result = subprocess.run(command,capture_output=True,text=True,
                            check=False,timeout=300)
    if result.returncode:
        raise RuntimeError("Visual fade render failed: " + result.stderr[-1000:])
    if not output.is_file() or not output.stat().st_size:
        raise RuntimeError("Visual fade output is empty")
    return output
