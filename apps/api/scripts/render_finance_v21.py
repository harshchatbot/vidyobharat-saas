"""Render a faceless 9:16 finance video from a Creative Director V2.1 timeline.

Unlike the old three-scene heredoc, all scene durations, graphic templates, and
spoken typography come from the validated finance timeline. No B-roll, music,
SFX, or other unverified asset is silently synthesized.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import re
import subprocess


PALETTE = {
    "keyword_card": ("0x142B45", "0xF5C75D"),
    "data_flow": ("0x153B49", "0x55DCE6"),
    "human_vs_ai": ("0x293653", "0xB49CFF"),
    "source_stack": ("0x293C49", "0x75DAB8"),
    "none": ("0x1C2B40", "0x8DB4C9"),
}


def validate(timeline: dict) -> None:
    if timeline.get("schema") != "finance_creative_director_timeline_v1":
        raise ValueError("Invalid finance timeline schema")
    if timeline.get("director_version") != "2.1":
        raise ValueError("Creative Director V2.1 is required")
    if (timeline.get("director_mode") != "creative_director_v2_openai"
            or timeline.get("ai_directed") is not True):
        raise ValueError("Refusing fallback or hardcoded timeline: actual AI direction is required")
    if timeline.get("source_audio_uninterrupted") is not True:
        raise ValueError("Audio must remain uninterrupted")
    if timeline.get("aspect_ratio") != "9:16":
        raise ValueError("Only 9:16 finance reels are supported")
    duration = timeline.get("duration_seconds")
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 0 < duration <= 60:
        raise ValueError("Invalid timeline duration")
    scenes = timeline.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("No Creative Director scenes")
    previous = 0.0
    for s in scenes:
        start, end = s.get("start"), s.get("end")
        if not all(isinstance(v, (float, int)) and math.isfinite(v) for v in (start, end)):
            raise ValueError("Invalid scene timing")
        if start < previous - 0.001 or end <= start or end > duration + 0.001:
            raise ValueError("Overlapping or out-of-range director scenes")
        if s.get("requires_asset_resolution") or s.get("visual") == "unresolved_verified_asset":
            raise ValueError("Unresolved stock/B-roll scene; review and resolve before rendering")
        if s.get("visual") not in {"procedural_graphic", "background_only"}:
            raise ValueError("Unsupported scene visual")
        if s.get("template") not in PALETTE:
            raise ValueError("Unsupported procedural graphic template")
        previous = end
    ids = set()
    for beat in timeline.get("visual_instructions", []):
        beat_id = beat.get("id")
        if not beat_id or beat_id in ids:
            raise ValueError("Duplicate/invalid visual beat ID")
        ids.add(beat_id)
        if (beat.get("kind") not in {"motion_graphic", "typography", "zoom"}
                or not isinstance(beat.get("start"), (float, int))
                or not isinstance(beat.get("end"), (float, int))
                or beat["start"] < 0 or beat["end"] <= beat["start"]
                or beat["end"] > duration + 0.001):
            raise ValueError("Invalid visual beat")


def ass_time(t: float) -> str:
    ticks = round(t * 100)
    h, ticks = divmod(ticks, 360000)
    m, ticks = divmod(ticks, 6000)
    s, cs = divmod(ticks, 100)
    return f"{h}:{m:02}:{s:02}.{cs:02}"


def safe_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()[:120].translate(str.maketrans({
        "{": "｛", "}": "｝", "\\": "＼",
    }))


def escape_filter_path(path: Path) -> str:
    return (str(path.resolve()).replace("\\", "\\\\").replace(":", r"\:")
            .replace("'", r"\'").replace(",", r"\,")
            .replace("[", r"\[").replace("]", r"\]"))


def make_ass(timeline: dict) -> str:
    header = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 2\n"
        "PlayResX: 720\nPlayResY: 1280\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Default,Arial,52,&H00FFFFFF,&H00FFFFFF,&H00112233&,"
        "&H55000000,-1,0,0,0,100,100,0,0,1,2,1,5,48,48,50,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, "
        "MarginL, MarginR, MarginV, Effect, Text\n"
    )
    events = []
    for scene in timeline["scenes"]:
        label = (scene["template"].replace("_", " ").upper()
                 if scene["visual"] == "procedural_graphic" else "KEY IDEA")
        events.append(
            f"Dialogue: 0,{ass_time(scene['start'])},{ass_time(scene['end'])},Default,,0,0,0,,"
            + r"{\an5\pos(360,315)\fs28\fad(150,150)}" + safe_text(label)
        )
    for beat in timeline.get("visual_instructions", []):
        if beat["kind"] not in {"motion_graphic", "typography"} or not beat.get("text"):
            continue
        events.append(
            f"Dialogue: 1,{ass_time(beat['start'])},{ass_time(beat['end'])},Default,,0,0,0,,"
            + r"{\an5\move(360,715,360,662,0,260)\fad(120,160)}"
            + safe_text(beat["text"])
        )
    return header + "\n".join(events) + "\n"


def make_filters(timeline: dict, ass_path: Path) -> str:
    filters = ["drawgrid=w=90:h=90:t=1:c=0x7FC2E6@0.10"]
    for scene in timeline["scenes"]:
        template = scene["template"] if scene["visual"] == "procedural_graphic" else "none"
        background, accent = PALETTE[template]
        active = f"gte(t\\,{scene['start']:.3f})*lt(t\\,{scene['end']:.3f})"
        filters.extend([
            f"drawbox=x=35:y=380:w=650:h=525:color={background}@0.96:t=fill:enable='{active}'",
            f"drawbox=x=35:y=380:w=8:h=525:color={accent}@1:t=fill:enable='{active}'",
            f"drawbox=x=98:y=435:w=524:h=5:color={accent}@0.8:t=fill:enable='{active}'",
        ])
        if template == "data_flow":
            for x in (104, 288, 472):
                filters.append(f"drawbox=x={x}:y=492:w=138:h=63:color={accent}@0.35:t=fill:enable='{active}'")
        elif template == "human_vs_ai":
            for x in (106, 384):
                filters.append(f"drawbox=x={x}:y=490:w=230:h=90:color={accent}@0.35:t=fill:enable='{active}'")
        elif template == "source_stack":
            for i in range(3):
                filters.append(f"drawbox=x={110+i*20}:y={480+i*70}:w={500-i*40}:h=36:color={accent}@0.35:t=fill:enable='{active}'")
    filters.append(f"subtitles=filename='{escape_filter_path(ass_path)}'")
    return ",".join(filters)


def render(timeline: dict, audio_path: Path, output: Path) -> dict:
    validate(timeline)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_format",
                            "-show_streams", "-of", "json", str(audio_path)],
                           capture_output=True, text=True, check=True)
    media = json.loads(probe.stdout)
    if not any(stream.get("codec_type") == "audio" for stream in media.get("streams", [])):
        raise ValueError("Narration audio missing")
    duration = float(media["format"]["duration"])
    if abs(duration - timeline["duration_seconds"]) > 0.35:
        raise ValueError("Narration duration does not match original Creative Director analysis")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.resolve() == audio_path.resolve():
        raise ValueError("Cannot overwrite narration source")
    ass = output.with_suffix(".ass")
    ass.write_text(make_ass(timeline), encoding="utf-8")
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=0x0A1728:s=720x1280:r=30",
        "-i", str(audio_path),
        "-filter_complex", f"[0:v]{make_filters(timeline, ass)}[video]",
        "-map", "[video]", "-map", "1:a:0",
        "-t", f"{timeline['duration_seconds']:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(output),
    ], check=True)
    if not output.is_file() or not output.stat().st_size:
        raise RuntimeError("Renderer did not produce an MP4")
    rendered = [beat["id"] for beat in timeline.get("visual_instructions", [])
                if beat["kind"] in {"motion_graphic", "typography"} and beat.get("text")]
    deferred = [beat["id"] for beat in timeline.get("visual_instructions", [])
                if beat["id"] not in rendered]
    deferred += [beat["id"] for beat in timeline.get("deferred_intents", [])]
    report = {"output": str(output), "director_mode": timeline["director_mode"],
              "scenes_executed": len(timeline["scenes"]),
              "rendered_beat_ids": rendered, "deferred_beat_ids": deferred,
              "review_required": True, "renderer": "ffmpeg_procedural_v21",
              "warning": "No B-roll, music or SFX added; only basic graphics/typography implemented."}
    output.with_suffix(".render_report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeline", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    timeline = json.loads(args.timeline.read_text(encoding="utf-8"))
    print(json.dumps(render(timeline, args.audio, args.output), indent=2))


if __name__ == "__main__":
    main()
