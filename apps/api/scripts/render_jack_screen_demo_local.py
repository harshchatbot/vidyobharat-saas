"""JACK V0.7 local screen-demo prototype using illustrated slides and macOS speech.

Requires macOS 'say', ffmpeg, ffprobe and Pillow. No real Salesforce UI,
screen capture, cloud TTS, or automatic publication. Narration is synthetic.
Run with --storyboard /path/to/jack_first_ai_script.json --output-dir /path/to/output
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path


def _run(args: list[str]) -> None:
    subprocess.run(args, check=True, timeout=240)


def _duration(path: Path) -> float:
    output = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True, timeout=30,
    )
    return float(output.strip())


def _font(size: int):
    from PIL import ImageFont
    for name in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Helvetica.ttf",
    ):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def _wrap(draw, text: str, font, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        if draw.textbbox((0, 0), candidate, font=font)[2] > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _illustration(scene: dict, index: int, path: Path) -> None:
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (720, 1280), "#101a30")
    d = ImageDraw.Draw(image)
    headline = _font(51)
    body = _font(30)
    small = _font(24)
    d.rounded_rectangle((48, 64, 672, 140), radius=24, fill="#243858")
    d.text((75, 86), "JACK  /  SCREEN-DEMO PROTOTYPE", font=small, fill="#e4edff")
    title = {
        "hook": "WHY CHANGE DATA CAPTURE?",
        "value": "RECORD  >  EVENT  >  SUBSCRIBER",
        "takeaway": "EVENT-DRIVEN SYNCHRONIZATION",
        "cta": "EXPLORE SALESFORCE DOCS",
    }[scene["beat"]]
    for j, line in enumerate(_wrap(d, title, headline, 610)):
        d.text((55, 195 + j * 70), line, font=headline, fill="#ffffff")
    # This is a conceptual illustration, not a recording of a Salesforce UI.
    labels = {
        "hook": ("Record changes", "No repeated polling illustration"),
        "value": ("Salesforce record", "CDC event", "External subscriber"),
        "takeaway": ("Change event", "Subscriber processes update"),
        "cta": ("Read official docs", "Build a verified demo"),
    }[scene["beat"]]
    count = len(labels)
    top = 420
    for j, label in enumerate(labels):
        y = top + j * 150
        d.rounded_rectangle((70, y, 650, y + 105), radius=24,
                            fill="#263e60", outline="#77c9ff", width=3)
        for k, line in enumerate(_wrap(d, label, body, 510)):
            d.text((100, y + 23 + k * 38), line, font=body, fill="#f3f7ff")
        if j < count - 1:
            d.line((360, y + 105, 360, y + 144), fill="#77c9ff", width=6)
    d.text((60, 1130), f"SCENE {index + 1}/4  •  CONCEPTUAL GRAPHICS", font=small, fill="#bed2ed")
    image.save(path)


def render_prototype(storyboard: dict, output_dir: Path, *, voice: str | None = None) -> Path:
    if storyboard.get("format") != "screen_demo":
        raise ValueError("V0.7 prototype currently supports screen_demo only")
    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or [s.get("beat") for s in scenes] != [
        "hook", "value", "takeaway", "cta"
    ]:
        raise ValueError("Expected ordered four-scene storyboard")
    if not all(isinstance(s.get("narration"), str) and 0 < len(s["narration"]) <= 2000 for s in scenes):
        raise ValueError("Missing or invalid narration")
    for command in ("say", "ffmpeg", "ffprobe"):
        if not shutil.which(command):
            raise RuntimeError(f"Missing required executable: {command}")
    try:
        from PIL import Image  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("Install Pillow in the API virtualenv") from exc

    output_dir.mkdir(parents=True, exist_ok=True)
    segments = []
    timing = []
    for i, scene in enumerate(scenes):
        picture = output_dir / f"jack_scene_{i + 1:02d}.png"
        speech = output_dir / f"jack_voice_{i + 1:02d}.aiff"
        segment = output_dir / f"jack_segment_{i + 1:02d}.mp4"
        _illustration(scene, i, picture)
        cmd = ["say"]
        if voice:
            cmd.extend(["-v", voice])
        cmd.extend(["-o", str(speech), scene["narration"]])
        _run(cmd)
        seconds = _duration(speech) + 0.7
        _run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-loop", "1", "-framerate", "30", "-i", str(picture),
            "-i", str(speech), "-t", f"{seconds:.3f}",
            "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "22", "-r", "30", "-c:a", "aac", "-b:a", "160k",
            "-af", "apad", "-movflags", "+faststart", str(segment),
        ])
        segments.append(segment)
        timing.append({"beat": scene["beat"], "audio_seconds": round(seconds - .7, 3),
                       "segment_seconds": round(seconds, 3)})
    concat = output_dir / "jack_segments.txt"
    concat.write_text("".join(f"file '{p.name}'\n" for p in segments), encoding="utf-8")
    output = output_dir / "jack_screen_demo_prototype.mp4"
    _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
          "-f", "concat", "-safe", "0", "-i", str(concat),
          "-c", "copy", "-movflags", "+faststart", str(output)])
    manifest = {
        "schema_version": "jack-prototype-render/v0.7",
        "output": str(output),
        "format": "screen_demo",
        "graphics": "conceptual_illustrations_not_salesforce_screen_recordings",
        "voice": "macos_say_synthetic",
        "timing": timing,
        "rendered_duration_seconds": round(_duration(output), 3),
        "claims_verified": False,
        "publish_authorized": False,
        "review_required": True,
    }
    (output_dir / "jack_render_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--storyboard", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--voice", default=None)
    args = parser.parse_args()
    payload = json.loads(Path(args.storyboard).expanduser().read_text(encoding="utf-8"))
    storyboard = payload.get("storyboard", payload)
    if not isinstance(storyboard, dict):
        raise ValueError("No storyboard found")
    output = render_prototype(storyboard, Path(args.output_dir).expanduser(), voice=args.voice)
    print(f"JACK prototype rendered: {output}")


if __name__ == "__main__":
    main()
