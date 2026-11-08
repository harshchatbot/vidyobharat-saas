"""Bridge existing Visual Analysis V2 + Creative Director V2.1 to timed ASS captions.

This is a *renderer adapter*, not a second speech/face/creative model.
All words, timings, emphasis and caption zones come from the existing
validated report and V2.1 composition. No new transcript is fabricated.

Each caption reuses the current timeline editor's ASS caption implementation
(including its active-word highlighting and font-size fitting).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

from app.schemas.editor import TimelineCaptionWord, TimelineTextOverlay
from app.schemas.video_analysis import VideoAnalysisReport
from app.services.timeline_render_service import _write_timed_caption_ass
from app.services.video_creative_context import CreativeContext
from app.services.video_creative_director_v21 import CompositionPlanV21


@dataclass(frozen=True)
class CaptionBridgeResult:
    caption_count: int
    word_count: int
    review_required: bool
    warnings: tuple[str, ...]


def build_caption_overlays(
    report: VideoAnalysisReport,
    context: CreativeContext,
    composition: CompositionPlanV21,
    *, visual_style: str = "classic",
) -> tuple[list[TimelineTextOverlay], list[str]]:
    """Get source-faithful, face-guided captions with V2.1 emphasis choices.

    Position guidance is advisory; no face-free region is guaranteed between
    sparse YuNet observations. Review is always required.
    """
    if not composition.base_video_uninterrupted or not composition.source_audio_uninterrupted:
        raise ValueError("Cannot caption a composition that changes original timing")
    if abs(composition.duration_seconds - report.media.duration_seconds) > 0.1:
        raise ValueError("Composition duration differs from Visual Analysis V2")
    if composition.aspect_ratio != report.media.aspect_ratio:
        raise ValueError("Composition aspect ratio differs from Visual Analysis V2")
    allowed = {p.id for p in context.phrases}
    accent_ids = {
        b.text_from_phrase_id for b in composition.beats
        if b.kind == "typography" and b.template == "bold_accent"
        and b.text_from_phrase_id in allowed
    }
    zones = {z.segment_id: z for z in context.caption_zones}
    words = report.speech.words
    overlays: list[TimelineTextOverlay] = []
    warnings: list[str] = []
    if not words or not context.phrases:
        return overlays, ["No source-timed words available; captions not invented."]
    missing_guidance = False
    total_duration = composition.duration_seconds
    for phrase in context.phrases:
        matched = [
            w for w in words
            if w.start >= phrase.start - .011 and w.end <= phrase.end + .011
            and w.start < w.end and w.text.strip()
        ]
        if not matched:
            continue
        start = max(0.0, matched[0].start)
        end = min(total_duration, matched[-1].end)
        if end < start + 0.1:
            continue
        zone = zones.get(phrase.segment_id)
        safe = zone is not None and zone.status == "suggested"
        if not safe:
            missing_guidance = True
        # Warm style reserves the lower part of the upper explainer plate
        # for speech captions. Presenter-only shots use a lower-third caption.
        # This is renderer layout, not a second face-detection algorithm.
        if visual_style == "harshverse_warm":
            midpoint = (start + end) / 2
            on_graphic = any(
                b.kind == "motion_graphic" and b.start <= midpoint < b.end
                for b in composition.beats
            )
            x, y, width = (0.5, 0.43, 0.82) if on_graphic else (0.5, 0.83, 0.82)
        elif visual_style == "classic":
            x = zone.x if safe else 0.5
            y = zone.y if safe else 0.84
            width = zone.width if safe else 0.82
        else:
            raise ValueError("Unknown caption visual style")
        # V2.1 emphasis is permitted only while Visual Analysis still
        # reports a suggested safe caption zone for this speech segment.
        accent = safe and phrase.id in accent_ids
        caption_words = [
            TimelineCaptionWord(
                text=w.text.strip(),
                start=round(max(0.0, w.start - start), 3),
                end=round(min(end - start, w.end - start), 3),
            )
            for w in matched
        ]
        overlays.append(TimelineTextOverlay(
            id=f"hv-caption-{phrase.id}",
            text=" ".join(w.text for w in caption_words),
            caption_words=caption_words,
            start_seconds=round(start, 3),
            duration_seconds=round(end - start, 3),
            font_family="Noto Sans Devanagari" if (report.speech.language or "").lower().startswith("hi") else "Inter",
            font_size=(38 if visual_style == "harshverse_warm" else (49 if accent else 43)),
            bold=True,
            outline_width=4 if visual_style == "classic" else 2,
            color=("#FFFFFF" if visual_style == "classic"
                   else "#30302E" if on_graphic else "#FFF9E9"),
            outline_color=("#0B1220" if visual_style == "classic"
                           else "#F8F3E9" if on_graphic else "#544439"),
            x=x, y=y, width=width,
            in_animation_duration=0.1, out_animation_duration=0.1,
        ))
    if missing_guidance:
        warnings.append("Some captions use review-only fallback placement; face safety is not established.")
    if any(p.timing_status == "review" for p in context.phrases):
        warnings.append("Speech timestamps are estimates and require manual synchronization review.")
    if not overlays:
        warnings.append("No phrases with valid word timing; captions not rendered.")
    return overlays, warnings


def write_caption_track(
    path: Path,
    overlays: list[TimelineTextOverlay],
    *,
    width: int = 720,
    height: int = 1280,
    visual_style: str = "classic",
) -> CaptionBridgeResult:
    """Write one ASS file using the existing editor's active-word renderer.

    A short phrase entrance adds scale/fade kinetic motion without changing
    the editor's spoken-word or highlight timing. Do not add new text.
    """
    if width < 2 or height < 2 or width % 2 or height % 2:
        raise ValueError("Invalid output size")
    if not overlays:
        raise ValueError("Cannot generate a caption track without timed captions")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    dimensions = SimpleNamespace(width=width, height=height)
    header = ""
    events: list[str] = []
    for index, overlay in enumerate(overlays):
        partial = path.parent / f".hv-caption-phrase-{index:03d}.ass"
        try:
            _write_timed_caption_ass(partial, dimensions, overlay)
            source = partial.read_text(encoding="utf-8")
        finally:
            partial.unlink(missing_ok=True)
        if index == 0:
            header = source.split("Dialogue:", 1)[0]
        lines = [line for line in source.splitlines() if line.startswith("Dialogue:")]
        if not lines:
            continue
        # Only the first event of a phrase gets an entrance. Every later word
        # highlight changes color at its source timestamp without re-animating.
        if overlay.duration_seconds >= 0.16:
            lines[0] = lines[0].replace(
                r"{\an5",
                r"{\fad(65,0)\fscx94\fscy94\t(0,120,\fscx100\fscy100)\an5",
                1,
            )
        if visual_style == "harshverse_warm":
            # The shared subtitle renderer defaults to white + neon yellow.
            # Replace only color overrides for this opt-in brand style.
            # ASS colors use BGR, not RGB. Never modify source text/timing.
            raw = overlay.color.lstrip("#")
            bgr = f"{raw[4:6]}{raw[2:4]}{raw[0:2]}".upper()
            base = f"&H{bgr}&"
            warm_accent = "&H5481CF&"  # RGB #CF8154
            lines = [
                line.replace(r"{\1c&H66E0FF&}", r"{\1c" + warm_accent + "}")
                    .replace(r"{\1c&HFFFFFF&}", r"{\1c" + base + "}")
                for line in lines
            ]
            # The ASS header is taken from the first phrase. Inject each
            # phrase's own color explicitly, so dark text on a cream
            # graphic doesn't inherit presenter caption white.
            lines = [
                line.replace(r"\an5", r"\1c" + base + r"\an5", 1)
                for line in lines
            ]
        elif visual_style != "classic":
            raise ValueError("Unknown caption render visual style")
        events.extend(lines)
    if not events:
        raise ValueError("No valid caption events were generated")
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return CaptionBridgeResult(
        caption_count=len(overlays),
        word_count=sum(len(o.caption_words) for o in overlays),
        review_required=True,
        warnings=(),
    )
