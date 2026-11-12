"""HarshVerse V0.17 opt-in professional finishing pass.

Applies explicitly timed visual beats and original SFX to an EXISTING MP4.
Does not decide when cuts are safe, download B-roll, or authorize publishing.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
import subprocess
import tempfile

from .warm_sfx import synthesize_warm_sfx

_RENDERABLE = frozenset({"punch_zoom", "impact_shake", "headline", "tick", "cross", "sfx"})
_UNRESOLVED = frozenset({
    "jump_cut", "j_cut", "l_cut", "broll", "money_stack",
    "calendar", "emoji", "transition",
})
SFX_KINDS = frozenset({"whoosh", "pop", "click", "faahh", "typewriter"})


@dataclass(frozen=True)
class Effect:
    id: str
    kind: str
    start: float
    end: float
    text: str = ""
    cue: str = ""


def parse_effects(raw: dict, *, duration: float) -> tuple[list[Effect], list[dict]]:
    """Validate each request and return renderable events plus honest deferrals."""
    if not isinstance(raw, dict) or raw.get("schema_version") != "harshverse-effects/v0.17":
        raise ValueError("Invalid V0.17 effects document")
    items = raw.get("effects")
    if not isinstance(items, list) or len(items) > 30:
        raise ValueError("effects must be an array with <=30 items")
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 0 < duration <= 60:
        raise ValueError("Invalid source duration")
    seen = set()
    accepted, deferred = [], []
    for obj in items:
        if not isinstance(obj, dict):
            raise ValueError("Effect must be an object")
        ident, kind = obj.get("id"), obj.get("kind")
        start, end = obj.get("start"), obj.get("end")
        if not isinstance(ident, str) or not 1 <= len(ident) <= 60 or ident in seen:
            raise ValueError("Missing or duplicate effect ID")
        seen.add(ident)
        if (type(start) not in (float, int) or type(end) not in (float, int)
            or not math.isfinite(start) or not math.isfinite(end)
            or not 0 <= start < end <= duration):
            raise ValueError(f"Invalid interval for effect {ident}")
        if kind not in _RENDERABLE | _UNRESOLVED:
            raise ValueError(f"Unknown effect kind: {kind}")
        text = obj.get("text", "")
        cue = obj.get("cue", "")
        if not isinstance(text, str) or not isinstance(cue, str) or len(text) > 80:
            raise ValueError("Invalid text or cue")
        if kind == "headline" and (not text.strip() or "\n" in text):
            raise ValueError("Headline requires short single-line verified text")
        if kind == "sfx" and (cue not in SFX_KINDS or end - start < .05):
            raise ValueError("Invalid procedural SFX request")
        event = Effect(ident, kind, float(start), float(end), text, cue)
        if kind in _UNRESOLVED:
            deferred.append({"id": ident, "kind": kind,
                             "status": "not_rendered",
                             "reason": "Requires separate verified media, safe-cut timing or production compositor"})
        else:
            accepted.append(event)
    if sum(e.kind != "sfx" for e in accepted) > 12:
        raise ValueError("Too many simultaneously requested graphics")
    # Dense beats degrade video quality and are particularly unsafe for presenter face.
    visual = sorted((e for e in accepted if e.kind in {"punch_zoom", "impact_shake"}),
                    key=lambda e: e.start)
    for previous, following in zip(visual, visual[1:]):
        if following.start < previous.end + .15:
            raise ValueError("Camera movements must not overlap or crowd each other")
    return accepted, deferred


def _probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=30)
    return json.loads(result.stdout)


def _source_info(path: Path) -> tuple[float, int, int]:
    meta = _probe(path)
    duration = float(meta["format"]["duration"])
    video = next((s for s in meta["streams"] if s["codec_type"] == "video"), None)
    if video is None or not any(s["codec_type"] == "audio" for s in meta["streams"]):
        raise ValueError("Input must contain video and speech audio")
    return duration, int(video["width"]), int(video["height"])


def _window(event: Effect) -> str:
    return f"between(t,{event.start:.3f},{event.end:.3f})"


def build_video_filter(events: list[Effect], *, width: int, height: int, fontfile: Path) -> str:
    """One picture pipeline; source audio is independently mapped unchanged in time."""
    if width < 64 or height < 64 or width % 2 or height % 2:
        raise ValueError("Requires even source dimensions")
    if not fontfile.is_file():
        raise FileNotFoundError(f"Required local font missing: {fontfile}")
    visuals = [e for e in events if e.kind != "sfx"]
    layers = [e for e in visuals if e.kind in {"punch_zoom", "impact_shake"}]
    parts = []
    if layers:
        labels = "".join(f"[z{i}]" for i in range(len(layers)))
        parts.append(f"[0:v]split={len(layers)+1}[base]{labels}")
        last = "base"
    else:
        parts.append("[0:v]null[base]")
        last = "base"
    for i, event in enumerate(layers):
        # Frame-synchronous scale/crop with a fixed 1.065x increase; source audio unaltered.
        zoom = 1.065 if event.kind == "punch_zoom" else 1.025
        scaled_w = int(math.ceil(width * zoom / 2) * 2)
        scaled_h = int(math.ceil(height * zoom / 2) * 2)
        if event.kind == "impact_shake":
            x = f"(in_w-out_w)/2+7*sin(73*t)"
            y = f"(in_h-out_h)/2+6*cos(61*t)"
        else:
            x, y = "(in_w-out_w)/2", "(in_h-out_h)/2"
        parts.append(f"[z{i}]scale={scaled_w}:{scaled_h},crop={width}:{height}:x='{x}':y='{y}',setpts=PTS-STARTPTS[m{i}]")
        parts.append(f"[{last}][m{i}]overlay=0:0:enable='{_window(event)}':shortest=1[v{i}]")
        last = f"v{i}"
    for i, event in enumerate(e for e in visuals if e.kind in {"headline", "tick", "cross"}):
        if event.kind == "headline":
            # Textfile avoids injection into FFmpeg filter syntax.
            safe = event.text.replace("'", "").replace(":", "").replace("\\", "")
            # No user-controlled FFmpeg syntax; short trusted evidence only.
            textpart = f"text='{safe}'"
            size = max(20, width // 16)
            y = "h*0.19"
        else:
            textpart = "text='✓'" if event.kind == "tick" else "text='✕'"
            size, y = max(38, width // 7), "h*0.22"
        parts.append(
            f"[{last}]drawtext=fontfile='{fontfile.as_posix()}':{textpart}:"
            f"fontsize={size}:expansion=none:fontcolor=white:"
            "borderw=4:bordercolor=0x252525:"
            "x=(w-text_w)/2:"
            f"y={y}:enable='{_window(event)}'[t{i}]"
        )
        last = f"t{i}"
    parts.append(f"[{last}]format=yuv420p[vout]")
    return ";".join(parts)


def render_effects(
    source: Path, destination: Path, raw: dict, *,
    fontfile: Path = Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
) -> dict:
    """Write MP4 and audit JSON. A failing render never falsely marks effects applied."""
    source, destination, fontfile = Path(source), Path(destination), Path(fontfile)
    if not source.is_file():
        raise FileNotFoundError(source)
    if source.resolve() == destination.resolve():
        raise ValueError("Cannot overwrite original source")
    duration, width, height = _source_info(source)
    events, deferred = parse_effects(raw, duration=duration)
    if not events:
        raise ValueError("No supported effects to render; see deferred effect IDs")
    has_visuals = any(e.kind != "sfx" for e in events)
    sfx = sorted((e for e in events if e.kind == "sfx"), key=lambda e: e.start)
    audit = {
        "schema_version": "harshverse-effects-audit/v0.17",
        "source": str(source), "output": str(destination),
        "status": "not_rendered", "rendered": [], "deferred": deferred,
        "speech_cuts_performed": False, "approved_for_export": False,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="hv17-") as tmp:
        command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                   "-i", str(source)]
        sfx_count = 0
        if sfx:
            sfx_path, sfx_count = synthesize_warm_sfx(
                Path(tmp) / "original_sfx.wav", duration,
                [(e.start, e.cue) for e in sfx])
            command.extend(["-i", str(sfx_path)])
        if has_visuals:
            command.extend(["-filter_complex", build_video_filter(
                events, width=width, height=height, fontfile=fontfile),
                "-map", "[vout]", "-c:v", "libx264", "-crf", "19",
                "-preset", "medium", "-pix_fmt", "yuv420p"])
        else:
            command.extend(["-map", "0:v:0", "-c:v", "copy"])
        if sfx:
            # Single filter graph handles video and audio consistently.
            if has_visuals:
                graph = build_video_filter(events, width=width, height=height, fontfile=fontfile)
                idx = command.index("-filter_complex")
                command[idx+1] = graph + ";[0:a:0][1:a:0]amix=inputs=2:duration=first:normalize=0[aout]"
            else:
                command.extend(["-filter_complex", "[0:a:0][1:a:0]amix=inputs=2:duration=first:normalize=0[aout]"])
            command.extend(["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"])
        else:
            command.extend(["-map", "0:a:0", "-c:a", "copy"])
        command.extend(["-movflags", "+faststart", str(destination)])
        subprocess.run(command, check=True, timeout=300)
    if not destination.is_file() or destination.stat().st_size <= 0:
        raise RuntimeError("No rendered MP4 found")
    actual, _, _ = _source_info(destination)
    if abs(actual - duration) > .15:
        raise RuntimeError("Rendered duration mismatch")
    audit["status"] = "rendered_review_required"
    last_sfx_time = -3.0
    accepted_sfx = 0
    for event in events:
        if event.kind == "sfx":
            if event.start - last_sfx_time < 1.05 or accepted_sfx >= 5:
                audit["deferred"].append({"id": event.id, "kind": event.kind,
                                          "status": "not_rendered", "reason": "SFX density limiter"})
                continue
            last_sfx_time = event.start
            accepted_sfx += 1
        audit["rendered"].append({"id": event.id, "kind": event.kind})
    return audit
