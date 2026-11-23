"""JACK V1.1 review-only plan-driven preview. Requires Pillow, ffmpeg and V0.9 renderer."""
import argparse
import json
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
from render_jack_cdc_cinematic_v09 import render_frame, W, H, FPS, font

CAMERAS = {"wide_to_push_in", "three_quarter_orbit", "tracking_follow_event", "pull_back_to_end_card"}
MODULES = {"kinetic_typography", "layered_hyperframe"}

def validate_plan(plan):
    if plan.get("schema_version") != "jack-creative-director-bridge/v1":
        raise ValueError("Unsupported plan")
    scenes = plan.get("hyperframe_proposals")
    if not isinstance(scenes, list) or len(scenes) != 4:
        raise ValueError("Four hyperframes required")
    cursor = 0.0
    for scene in scenes:
        a, b = scene.get("start_seconds_estimated"), scene.get("end_seconds_estimated")
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in (a, b)):
            raise ValueError("Invalid timeline")
        if abs(a - cursor) > 0.035 or b <= a:
            raise ValueError("Discontinuous timeline")
        if scene.get("camera_proposal") not in CAMERAS or scene.get("visual_module_proposal") not in MODULES:
            raise ValueError("Unsupported creative instruction")
        cursor = b
    if cursor > 65:
        raise ValueError("Timeline too long")
    return scenes

def frame_for_plan(scene, t):
    a, b = scene["start_seconds_estimated"], scene["end_seconds_estimated"]
    u = max(0, min(1, (t - a) / (b - a)))
    im = render_frame((t * .55) % 7)
    cam = scene["camera_proposal"]
    if cam == "wide_to_push_in":
        zoom, dx = 1 + .11 * u, 0
    elif cam == "three_quarter_orbit":
        zoom, dx = 1.07, int(24 * math.sin(u * math.pi * 2))
    elif cam == "tracking_follow_event":
        zoom, dx = 1.11, int(32 * (2 * u - 1))
    else:
        zoom, dx = 1.13 - .13 * u, 0
    cw, ch = int(W / zoom), int(H / zoom)
    left = max(0, min(W - cw, (W - cw) // 2 + dx))
    top = (H - ch) // 2
    im = im.crop((left, top, left + cw, top + ch)).resize((W, H), Image.Resampling.BICUBIC).convert("RGBA")
    overlay = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(overlay)
    d.rounded_rectangle((28, 370, 692, 775), radius=28, fill=(6, 15, 30, 224), outline=(255, 142, 79, 230), width=2)
    d.text((52, 394), scene["beat"].upper(), font=font(19, True), fill="#ffae7c")
    words = scene.get("typography_text", "").split()
    lines, line = [], ""
    for word in words:
        if len(line) + len(word) + 1 > 23 and line:
            lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    if line:
        lines.append(line)
    for i, text in enumerate(lines[:5]):
        if u >= i * .11:
            d.text((52, 460 + i * 53), text, font=font(30, True), fill="white")
    d.rectangle((52, 738, 52 + int(590 * u), 743), fill="#ff9a5b")
    d.rounded_rectangle((24, 1136, 696, 1208), radius=13, fill=(7, 12, 25, 225))
    d.text((42, 1154), "UNAPPROVED PREVIEW - ESTIMATED TIMING", font=font(18, True), fill="#f9be91")
    return Image.alpha_composite(im, overlay).convert("RGB")

def render(plan, output_dir, seconds=12):
    scenes = validate_plan(plan)
    if not 0 < seconds <= scenes[-1]["end_seconds_estimated"]:
        raise ValueError("Invalid preview duration")
    dest = Path(output_dir)
    dest.mkdir(parents=True, exist_ok=True)
    output = dest / "jack_creative_director_preview_v11.mp4"
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", str(output)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for n in range(math.ceil(seconds * FPS)):
            t = n / FPS
            scene = next((s for s in scenes if s["start_seconds_estimated"] <= t < s["end_seconds_estimated"]), scenes[-1])
            p.stdin.write(frame_for_plan(scene, t).tobytes())
        p.stdin.close()
        if p.wait(timeout=240):
            raise RuntimeError("FFmpeg failed")
    except BaseException:
        if p.stdin and not p.stdin.closed:
            p.stdin.close()
        p.kill()
        p.wait()
        raise
    (dest / "jack_creative_director_preview_manifest.json").write_text(json.dumps({"video": str(output), "preview_seconds": seconds, "approved": False, "narration_aligned": False, "sfx_mixed": False, "assets_resolved": False, "true_3d_camera": False, "publish_authorized": False}, indent=2))
    return output

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seconds", type=float, default=12)
    args = parser.parse_args()
    print(render(json.loads(Path(args.plan).expanduser().read_text()), args.output_dir, args.seconds))
