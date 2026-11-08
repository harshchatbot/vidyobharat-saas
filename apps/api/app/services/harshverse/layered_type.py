"""Original HarshVerse warm editorial type: rear depth layer + front badge.

A real person matte is required for the rear title to pass behind the speaker.
Without a mask this pass remains a *foreground-only* headline, reported
explicitly as such. No tracked face boxes are misrepresented as a person mask.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

from app.services.harshverse.warm_style import PALETTE


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                 "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default(size=size)

W, H = 720, 1280
_STOP_WORDS = frozenset({
    "HAVE", "EVER", "YOU", "YOUR", "THIS", "THAT", "WHAT", "WHEN",
    "WHERE", "WITH", "FROM", "THINK", "ABOUT", "DOES", "LIKE",
    "JUST", "WELL", "HERE", "THE", "AND", "FOR", "ARE", "BUT",
})


@dataclass(frozen=True)
class LayeredTitleResult:
    path: Path
    mode: str
    headline: str


def choose_speech_keyword(words: list[str]) -> str:
    """Choose a *recorded* short content word for the animated intro.

    A semantic planner may later supply a better validated keyword. The
    deterministic path must not invent an unspoken product name or claim.
    """
    tokens = [
        re.sub(r"[^A-Za-z0-9]", "", word).upper()
        for word in words[:60]
    ]
    tokens = [t for t in tokens if t]
    # Local STT often separates spoken "Chat GPT" into two words. This
    # alias is supported ONLY when both original adjacent words occur;
    # the algorithm does not invent subjects from a guessed topic.
    recorded = set(tokens)
    if any(a == "CHAT" and b == "GPT"
           for a, b in zip(tokens, tokens[1:])):
        recorded.add("CHATGPT")
    priority = (
        "CHATGPT", "SALESFORCE", "GPT", "AGENTFORCE", "AGENT",
        "WORKFLOW", "PATTERNS", "HUMAN", "DATA", "MODEL", "BOOKS",
        "INFORMATION", "QUESTIONS", "AI",
    )
    for item in priority:
        if item in recorded:
            return item
    candidates = [
        t for t in tokens
        if 4 <= len(t) <= 16 and t not in _STOP_WORDS
    ]
    return candidates[0] if candidates else "HARSHVERSE"


def _fit(draw: ImageDraw.ImageDraw, headline: str, max_width=656):
    size = 119
    while size > 30:
        font = _font(size)
        if draw.textbbox((0, 0), headline, font=font)[2] <= max_width:
            return font
        size -= 3
    return _font(30)


def make_editorial_title_layers(directory: Path, headline: str) -> tuple[Path, Path]:
    """Generate PNG layers, transparent outside typography artwork.

    Typography is intentionally 100% original and is not extracted or
    traced from the reference video. Fonts must be installed locally.
    """
    headline = re.sub(r"\s+", " ", headline).strip().upper()
    if not 1 <= len(headline) <= 32 or not re.fullmatch(r"[A-Z0-9 .?!+-]+", headline):
        raise ValueError("Headline must be a short safe ASCII caption")
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    rear = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    front = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(rear)
    font = _fit(d, headline)
    size = d.textbbox((0, 0), headline, font=font)
    tx = max(22, (W - (size[2] - size[0])) // 2)
    # Giant text intentionally spans behind the head/shoulders. Real
    # occlusion is applied by the matte compositor, not by this art.
    d.text((tx + 3, 432), headline, font=font, fill=(76, 59, 48, 95),
           stroke_width=0)
    d.text((tx, 427), headline, font=font, fill=PALETTE["orange"],
           stroke_width=0)
    d.rectangle((45, 555, 311, 563), fill=PALETTE["sunflower"])
    d = ImageDraw.Draw(front)
    d.rounded_rectangle((42, 76, 373, 126), radius=16,
                        fill=PALETTE["paper"], outline=PALETTE["outline"], width=2)
    d.text((61, 88), "HARSHVERSE  /  EXPLAINED",
           fill=PALETTE["charcoal"], font=_font(16))
    # Keep branding inside the upper mobile safe region. The lower
    # part of the frame belongs to spoken-word captions and platform UI.
    d.ellipse((55, 166, 69, 180), fill=PALETTE["orange"])
    d.rounded_rectangle((76, 150, 320, 192), radius=12,
                        fill=PALETTE["paper"])
    d.text((88, 162), "LEARN SOMETHING NEW",
           fill=PALETTE["charcoal"], font=_font(16))
    rear_path = directory / "depth_rear_title.png"
    front_path = directory / "depth_front_labels.png"
    rear.save(rear_path)
    front.save(front_path)
    return rear_path, front_path


def build_editorial_intro_filter(*, matte: bool, start: float,
                                end: float, width: int = W, height: int = H) -> str:
    """FFmpeg graph: grade source -> title -> masked person -> front label.

    Matte is the fourth input ([3:v]) if used; alpha combines using
    'alphamerge' after resizing the gray mask to full portrait resolution.
    Original source audio is copied and source timing is not modified.
    """
    if not (0 <= start < end <= 60):
        raise ValueError("Invalid intro timing")
    if (width, height) != (W, H):
        raise ValueError("Editorial V1 supports 720x1280 only")
    window = f"between(t\\,{start:.3f}\\,{end:.3f})"
    rear_x = f"if(lt(t\\,{start + .24:.3f})\\,max(0\\,({start + .24:.3f}-t)*180)\\,0)"
    source_chain = (
        f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},setsar=1,format=yuv420p"
    )
    if matte:
        source_chain += ",split[base][personbase]"
    else:
        source_chain += "[base]"
    graph = [
        source_chain,
        f"[base][1:v]overlay=x='{rear_x}':y=0:enable='{window}':"
        "format=auto[backtitle]",
    ]
    if matte:
        graph.extend([
            f"[3:v]scale={W}:{H}:flags=bicubic,format=gray[matte]",
            "[personbase]format=rgba[personrgb]",
            "[personrgb][matte]alphamerge[personalpha]",
            f"[backtitle][personalpha]overlay=0:0:enable='{window}':"
            "format=auto[depth]",
        ])
    else:
        graph.append("[backtitle]null[depth]")
    graph.extend([
        f"[depth][2:v]overlay=0:0:enable='{window}':format=auto,"
        "format=yuv420p[vout]",
    ])
    return ";".join(graph)


def render_editorial_intro(
    source: Path, output: Path, *,
    headline: str, duration: float,
    matte: Path | None = None, ffmpeg: str = "ffmpeg",
) -> LayeredTitleResult:
    """Render a warm introductory typographic treatment over the full video.

    The rear text is actually occluded by the presenter iff matte is valid.
    Otherwise it remains clearly marked as front-only in the report.
    """
    source = Path(source)
    output = Path(output)
    if not source.is_file():
        raise FileNotFoundError("Presenter video source missing")
    if matte is not None and not Path(matte).is_file():
        raise FileNotFoundError("Person matte video missing")
    if not 0 < duration <= 60:
        raise ValueError("Invalid intro source duration")
    end = min(2.25, max(.5, duration * .34))
    start = min(.20, end * .2)
    rear, front = make_editorial_title_layers(output.parent, headline)
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source),
        "-loop", "1", "-framerate", "30", "-i", str(rear),
        "-loop", "1", "-framerate", "30", "-i", str(front),
    ]
    if matte is not None:
        command += ["-i", str(matte)]
    command += [
        "-filter_complex",
        build_editorial_intro_filter(matte=matte is not None,start=start,end=end),
        "-map", "[vout]", "-map", "0:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "copy", "-t", f"{duration:.3f}", str(output),
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(command, check=True, capture_output=True, timeout=300)
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="replace")[-700:] if exc.stderr else ""
        raise RuntimeError(f"Editorial layered title render failed: {detail}") from exc
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Layered editorial intro missing")
    return LayeredTitleResult(
        path=output,
        mode="subject_matte_occlusion" if matte is not None else "foreground_only_no_person_matte",
        headline=headline,
    )
