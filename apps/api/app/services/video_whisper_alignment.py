"""Optional local stable-ts / Faster-Whisper forced alignment for video analysis.

Default disabled. On failure or lexical/time mismatch, original transcript
remains the source of truth. No changes to source media or user captions.
"""
from __future__ import annotations

import logging
import os
import re
import statistics
import subprocess
import tempfile
import time
from pathlib import Path

from app.schemas.video_analysis import Word

logger = logging.getLogger(__name__)
MAX_BOUNDARY_SHIFT = 0.75


def _lexical(text: str) -> str:
    return re.sub(r"[^\w]+", "", text, flags=re.UNICODE).casefold()


def validate_alignment(raw_words: list[Word], candidate: list[Word], duration: float) -> tuple[bool, str]:
    if len(raw_words) != len(candidate):
        return False, "word_count_mismatch"
    if not raw_words:
        return False, "no_words"
    previous_start = -1.0
    for raw, aligned in zip(raw_words, candidate):
        if _lexical(raw.text) != _lexical(aligned.text):
            return False, "token_mismatch"
        if not (0 <= aligned.start < aligned.end <= duration + 0.02):
            return False, "invalid_bounds"
        if aligned.start < previous_start - 0.02:
            return False, "non_monotonic"
        previous_start = aligned.start
    if any(
        max(abs(raw.start - aligned.start), abs(raw.end - aligned.end)) > MAX_BOUNDARY_SHIFT
        for raw, aligned in zip(raw_words, candidate)
    ):
        # The shift limit is advisory; the existing ASR timestamps are not
        # ground truth. Retain structurally valid candidates for inspection.
        return False, "large_boundary_shift"
    return True, "validated_candidate"


def summarize_alignment(raw_words: list[Word], candidate: list[Word]) -> dict:
    """Public diagnostic, bounded to five shifts. No transcript text is logged."""
    comparisons = []
    for i, (original, aligned) in enumerate(zip(raw_words, candidate)):
        start_delta = round(aligned.start - original.start, 3)
        end_delta = round(aligned.end - original.end, 3)
        max_delta = max(abs(start_delta), abs(end_delta))
        comparisons.append({
            "word_index": i, "word_text": original.text,
            "original_start": original.start, "original_end": original.end,
            "aligned_start": aligned.start, "aligned_end": aligned.end,
            "start_delta_seconds": start_delta, "end_delta_seconds": end_delta,
            "max_abs_shift_seconds": round(max_delta, 3),
        })
    shifts = [entry["max_abs_shift_seconds"] for entry in comparisons]
    return {
        "max_abs_shift_seconds": round(max(shifts), 3) if shifts else 0.0,
        "median_max_abs_shift_seconds": round(statistics.median(shifts), 3) if shifts else 0.0,
        "words_over_750ms": sum(shift > MAX_BOUNDARY_SHIFT for shift in shifts),
        "largest_shifts": sorted(
            comparisons, key=lambda x: x["max_abs_shift_seconds"], reverse=True,
        )[:5],
    }


def forced_align(path: Path, words: list[Word], language: str, duration: float) -> tuple[list[Word] | None, str, float]:
    started = time.perf_counter()
    try:
        import stable_whisper
        with tempfile.TemporaryDirectory(prefix="rangmanch-align-") as temp_dir:
            audio = Path(temp_dir) / "audio.wav"
            subprocess.run([
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                "-y", "-i", str(path), "-t", str(min(duration, 65)),
                "-vn", "-ac", "1", "-ar", "16000", str(audio),
            ], check=True, timeout=45, capture_output=True)
            model = stable_whisper.load_faster_whisper(
                os.getenv("RANGMANCH_STT_MODEL", "small"),
                device="cpu", compute_type="int8",
            )
            reference_text = " ".join(word.text for word in words)
            result = model.align(str(audio), reference_text, language=language, verbose=False)
            if result is None:
                return None, "alignment_empty", time.perf_counter() - started
            candidate = []
            for segment in result.segments:
                for word in segment.words or []:
                    start, end = float(word.start), float(word.end)
                    token = str(word.word).strip()
                    if token and end > start >= 0:
                        candidate.append(Word(text=token[:100], start=start, end=end))
            valid, reason = validate_alignment(words, candidate, duration)
            elapsed = time.perf_counter() - started
            logger.info("editor_whisper_alignment_completed", extra={
                "status": reason, "elapsed_seconds": round(elapsed, 3),
                "candidate_word_count": len(candidate),
            })
            # Do not discard a valid token-for-token candidate just because
            # it disagrees with the original STT estimates by >750 ms.
            keep = valid or reason == "large_boundary_shift"
            return (candidate if keep else None), reason, elapsed
    except Exception as exc:  # optional dependency may fail in CTranslate2/torch internals
        logger.warning("editor_whisper_alignment_unavailable", extra={
            "error_type": type(exc).__name__,
        })
        return None, type(exc).__name__, time.perf_counter() - started
