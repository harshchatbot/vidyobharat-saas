"""Deterministic Chromium frame capture for JACK V3.1 visual proof of concept.

No narration, licensed SFX, motion blur, or Blender is implied. Requires playwright
and its Chromium browser, plus ffmpeg. Review-only visual preview.
"""
import argparse
import subprocess
from pathlib import Path

def render(output, width=540, height=960, fps=30, frames=210):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit("Install playwright and run: python -m playwright install chromium") from exc
    if frames < 1 or frames > 210 or (width, height) not in ((540, 960), (1080, 1920)):
        raise ValueError("Unsupported preview settings")
    source = Path(__file__).with_name("jack_cinematic25d_v31.html").resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    target = Path(output).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-vcodec", "png", "-framerate", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            page.goto(source.as_uri() + "?frame=0")
            page.evaluate("([w,h])=>{document.getElementById('stage').style.transform='scale('+w/540+')'}", [width,height])
            proc = subprocess.Popen(command, stdin=subprocess.PIPE)
            try:
                for i in range(frames):
                    page.evaluate("(frame)=>window.seekFrame(frame)", i)
                    proc.stdin.write(page.screenshot(type="png"))
                proc.stdin.close()
                if proc.wait() != 0:
                    raise RuntimeError("ffmpeg failed")
            except BaseException:
                if proc.stdin and not proc.stdin.closed:
                    proc.stdin.close()
                proc.kill()
                proc.wait()
                raise
        finally:
            browser.close()
    print(f"Review-only silent preview: {target}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, default=540)
    parser.add_argument("--height", type=int, default=960)
    parser.add_argument("--frames", type=int, default=210)
    args = parser.parse_args()
    render(args.output, width=args.width, height=args.height, frames=args.frames)
