"""Deterministic 30fps HTML/SVG -> Chromium -> FFmpeg preview renderer.

No external CDNs, assets, or AI calls. Every frame is rendered from absolute
frame index. This first local renderer is foreground-only: add Celery before
allowing server-side jobs. It uses original synthesized SFX for private QA.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

from validate import load_and_validate, SFX


def synth_sfx(path: Path, kind: str, sample_rate: int = 44100) -> None:
    """Original tones/noise generated mathematically; not sampled media."""
    import array
    import random

    if kind not in SFX:
        raise ValueError("Unknown SFX")
    length = {"whoosh": .42, "pop": .19, "stamp": .28, "type_tick": .085,
              "ding": .49, "buzz": .29, "paper_flip": .22, "confetti": .45}[kind]
    samples = int(length * sample_rate)
    rng = random.Random(2026 + len(kind))
    items = array.array("h")
    for i in range(samples):
        t = i / sample_rate
        x = i / samples
        envelope = math.sin(math.pi * x) ** (1.6 if kind != "type_tick" else .5)
        tone = {"whoosh": 260, "pop": 390, "stamp": 95, "type_tick": 820,
                "ding": 880, "buzz": 145, "paper_flip": 350, "confetti": 1020}[kind]
        noise = rng.uniform(-1, 1)
        if kind in ("whoosh", "paper_flip", "confetti"):
            signal = .78 * noise + .22 * math.sin(2 * math.pi * (tone + 280*x) * t)
        elif kind in ("stamp", "pop"):
            signal = .55 * noise + .45 * math.sin(2 * math.pi * tone * t)
        elif kind == "buzz":
            signal = math.sin(2 * math.pi * tone * t) + .2*math.sin(2*math.pi*tone*2*t)
        else:
            signal = math.sin(2 * math.pi * tone * t)
        items.append(max(-32767, min(32767, round(signal * envelope * 7500))))
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(items.tobytes())


def call_ffmpeg(command: list[str]) -> None:
    proc = subprocess.run(command, capture_output=True, text=True)
    if proc.returncode:
        raise RuntimeError(proc.stderr[-2200:])


def render(plan_path: Path, output: Path, *, chromium: str | None = None,
           width: int = 540, qa_frames: int | None = None) -> dict:
    from playwright.sync_api import sync_playwright
    plan, proof = load_and_validate(plan_path)
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing output: {output}")
    if width not in (540, 1080):
        raise ValueError("Use 540px private preview or 1080px full-size render")
    total = proof["frames"] if qa_frames is None else min(int(qa_frames), proof["frames"])
    if total <= 0:
        raise ValueError("Invalid frame limit")
    height = width * 16 // 9
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rangmanch-v30-") as d:
        work = Path(d)
        silent = work / "video.mp4"
        cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
               "-f", "image2pipe", "-vcodec", "mjpeg", "-r", "30", "-i", "pipe:0",
               "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
               "-pix_fmt", "yuv420p", str(silent)]
        ffmpeg = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=chromium) if chromium else p.chromium.launch(headless=True)
                try:
                    page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
                    page.set_content(Path(__file__).with_name("stage.html").read_text(encoding="utf-8"), wait_until="load")
                    page.evaluate("(plan) => window.loadPlan(plan)", plan)
                    page.evaluate("(scale) => {document.getElementById('stage').style.transform='scale('+scale+')'}", width / 1080)
                    for frame in range(total):
                        page.evaluate("(f) => window.setFrame(f)", frame)
                        image = page.screenshot(type="jpeg", quality=88, animations="disabled", caret="hide")
                        assert ffmpeg.stdin is not None
                        ffmpeg.stdin.write(image)
                finally:
                    browser.close()
            assert ffmpeg.stdin is not None
            ffmpeg.stdin.close()
            err = ffmpeg.stderr.read().decode(errors="replace") if ffmpeg.stderr else ""
            if ffmpeg.wait() != 0:
                raise RuntimeError("Frame encoding failed: " + err[-1400:])
        except Exception:
            ffmpeg.kill()
            ffmpeg.wait()
            raise
        sfx_files = {}
        for name in sorted(SFX):
            dest = work / (name + ".wav")
            synth_sfx(dest, name)
            sfx_files[name] = dest
        cues = [(beat["start_frame"] + s["at_frame"], s["id"])
                for beat in plan["beats"] for s in beat["sfx"]
                if beat["start_frame"] + s["at_frame"] < total]
        command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(silent)]
        expr = []
        mix_inputs = []
        for idx, (at_frame, name) in enumerate(cues, 1):
            command += ["-i", str(sfx_files[name])]
            millis = round(at_frame * 1000 / 30)
            expr.append(f"[{idx}:a]asetpts=PTS-STARTPTS,volume=0.58,adelay={millis}:all=1,apad=whole_dur={total/30:.4f}[s{idx}]")
            mix_inputs.append(f"[s{idx}]")
        if expr:
            expr.append("".join(mix_inputs) + f"amix=inputs={len(cues)}:duration=longest:normalize=0,alimiter=limit=0.95[a]")
            command += ["-filter_complex", ";".join(expr), "-map", "0:v:0", "-map", "[a]"]
        else:
            command += ["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
                        "-map", "0:v:0", "-map", "1:a:0"]
        command += ["-t", f"{total/30:.6f}", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(output)]
        call_ffmpeg(command)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("No MP4 written")
    probe = subprocess.run(["ffprobe", "-v", "error", "-count_frames",
                            "-select_streams", "v:0", "-show_entries",
                            "stream=nb_read_frames,duration", "-of", "json", str(output)],
                           capture_output=True, text=True, check=True)
    info = json.loads(probe.stdout)["streams"][0]
    decoded_frames = int(info.get("nb_read_frames") or 0)
    if abs(decoded_frames - total) > 1:
        raise RuntimeError(f"QA frame count mismatch: expected {total}, got {decoded_frames}")
    report = {**proof, "output": str(output), "preview_frames_rendered": total, "decoded_frames_verified": decoded_frames,
              "preview_resolution": f"{width}x{height}", "render_engine": "chromium_absolute_frame_seek",
              "audio_engine": "original_synthesized_sfx", "muxed_sfx_events": len(cues),
              "notes": ["Preview only; needs visual QA", "Not connected to Celery or publish flow",
                        "Character/prop rigs are procedural original SVG", "Audio is procedural original synthesis"]}
    report_path = output.with_suffix(".qa.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storyboard", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chromium", default=None)
    parser.add_argument("--width", type=int, default=540, choices=[540, 1080])
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--smoke-frames", type=int, help="QA partial render (not a full export)")
    args = parser.parse_args()
    if args.validate_only:
        print(json.dumps(load_and_validate(args.storyboard)[1], indent=2))
    else:
        print(json.dumps(render(args.storyboard, args.output, chromium=args.chromium,
                                width=args.width, qa_frames=args.smoke_frames), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
