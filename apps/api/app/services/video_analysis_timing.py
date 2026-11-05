"""Conservative, deterministic speech timing evidence for the V2 creative planner.

Whisper timestamps are *estimates*. FFmpeg silencedetect uses an energy threshold,
which can mistake quiet speech for silence. Never silently shift timestamps or
auto-authorize a cut merely because either detector found a gap.
"""
from __future__ import annotations

import re

from app.schemas.video_analysis import (
    Interval, SafeCutCandidate, SpeechSegment, TimingConflict, TimingQuality, Word,
)

MIN_CONFLICT_OVERLAP = 0.12
CONFLICT_GUARD = 0.35
CUT_PADDING = 0.15
MIN_CUT_SILENCE = 0.6
SEGMENT_GAP = 0.55
MIN_GROUP_WORDS = 3
DANGLING_ENDINGS = {'and', 'or', 'but', 'of', 'from', 'to', 'a', 'an', 'the', 'with', 'for', 'in', 'on', 'at', 'is', 'are', 'was', 'were'}


def timing_conflicts(words: list[Word], silences: list[Interval]) -> list[TimingConflict]:
    """Report word/silence disagreements; do not rewrite either observation."""
    conflicts: list[TimingConflict] = []
    for index, word in enumerate(words):
        for silence in silences:
            overlap = min(word.end, silence.end) - max(word.start, silence.start)
            if overlap >= MIN_CONFLICT_OVERLAP:
                conflicts.append(TimingConflict(
                    word_index=index, word_text=word.text,
                    word_start=word.start, word_end=word.end,
                    silence_start=silence.start, silence_end=silence.end,
                    overlap_seconds=round(overlap, 3),
                ))
    return conflicts[:150]


def _native_boundaries(utterances: list[dict] | None, word_count: int) -> set[int]:
    """Accept only ordered, in-range word-index boundaries from Whisper.

    These are *grouping hints*, not validated cut points or alignments.
    """
    result: set[int] = set()
    last_end = -1
    for item in utterances or []:
        if not isinstance(item, dict):
            continue
        start, end = item.get("word_start_index"), item.get("word_end_index")
        if (isinstance(start, int) and not isinstance(start, bool)
                and isinstance(end, int) and not isinstance(end, bool)
                and last_end < start <= end < word_count):
            if end < word_count - 1:
                result.add(end)
            last_end = end
    return result


def semantic_segments(
    words: list[Word], conflicts: list[TimingConflict],
    utterances: list[dict] | None = None,
) -> list[SpeechSegment]:
    """Group speech conservatively using punctuation, pauses and native STT hints.

    No arbitrary 20-word split. A native Whisper boundary is a *hint*, not
    grammatical truth. Short trailing fragments and dangling conjunctions
    are merged so the planner never sees isolated phrases like 'books and'.
    This does not claim full semantic understanding.
    """
    if not words:
        return []
    flagged = {issue.word_index for issue in conflicts}
    native_ends = _native_boundaries(utterances, len(words))
    groups: list[list[int]] = []
    current: list[int] = []
    for index, word in enumerate(words):
        current.append(index)
        if index == len(words) - 1:
            break
        next_word = words[index + 1]
        pause = max(0.0, next_word.start - word.end)
        punctuation = bool(re.search(r"[.!?。？！]$", word.text))
        native_boundary = index in native_ends
        enough_words = len(current) >= MIN_GROUP_WORDS
        dangling = word.text.casefold().strip(".,!?;:") in DANGLING_ENDINGS
        # Long recorded pauses are preserved even after a connector, but a
        # native-only / length-only split may never strand a connector.
        should_split = punctuation or pause >= SEGMENT_GAP or (native_boundary and enough_words and not dangling)
        if not should_split:
            continue
        if not enough_words and not punctuation and pause < 0.90:
            continue
        if dangling and pause < 0.90:
            continue
        groups.append(current)
        current = []

    if current:
        groups.append(current)

    # Don't emit a one- or two-word final fragment unless a substantial
    # spoken pause clearly separates it from the preceding utterance.
    if len(groups) > 1 and len(groups[-1]) < MIN_GROUP_WORDS:
        prev_last = words[groups[-2][-1]]
        next_first = words[groups[-1][0]]
        if next_first.start - prev_last.end < 0.90:
            groups[-2].extend(groups.pop())

    return [
        SpeechSegment(
            id=f"seg_{position:03d}",
            start=words[group[0]].start,
            end=max(words[i].end for i in group),
            text=" ".join(words[i].text for i in group),
            word_start_index=group[0],
            word_end_index=group[-1],
            timing_status="review" if any(i in flagged for i in group) else "estimated",
        )
        for position, group in enumerate(groups, start=1)
    ]


def safe_cut_candidates(
    silences: list[Interval],
    words: list[Word],
    conflicts: list[TimingConflict],
    duration: float,
    *,
    strict_silences: list[Interval] | None = None,
) -> list[SafeCutCandidate]:
    """Conservative candidates, never automatically executed.

    Intersect speech-timestamp gaps with low-energy silences. In production
    analysis require independent -45 dB silence corroboration. Every proposed
    cut maintains 0.15s padding from speech and uncertain regions; a conflict
    near either boundary disqualifies it. Still review against original audio.
    """
    if not silences or len(words) < 2:
        return []
    candidates: list[SafeCutCandidate] = []
    ordered_words = sorted(words, key=lambda w: (w.start, w.end))
    for before, after in zip(ordered_words, ordered_words[1:]):
        if after.start <= before.end or after.start > duration:
            continue
        gap_start, gap_end = before.end, after.start
        for silence in sorted(silences, key=lambda item: item.start):
            overlap_start = max(gap_start, silence.start)
            overlap_end = min(gap_end, silence.end)
            if overlap_end - overlap_start < MIN_CUT_SILENCE:
                continue
            overlaps = [(overlap_start, overlap_end)]
            if strict_silences is not None:
                overlaps = [
                    (max(overlap_start, strong.start), min(overlap_end, strong.end))
                    for strong in strict_silences
                    if min(overlap_end, strong.end) - max(overlap_start, strong.start) >= MIN_CUT_SILENCE
                ]
            for core_start, core_end in overlaps:
                start = core_start + CUT_PADDING
                end = core_end - CUT_PADDING
                if end - start < 0.25:
                    continue
                # Guard against other words overlapping due to imperfect ASR
                # and prevent cuts near any word/silence disagreement.
                if any(w.start < end + CUT_PADDING and w.end > start - CUT_PADDING for w in ordered_words):
                    continue
                if any(issue.word_start < end + CONFLICT_GUARD and issue.word_end > start - CONFLICT_GUARD for issue in conflicts):
                    continue
                # Endpoints must lie inside the actual -35dB observation.
                if start < silence.start or end > silence.end:
                    continue
                candidates.append(SafeCutCandidate(
                    id=f"cut_{len(candidates)+1:03d}",
                    remove_start=round(start, 3),
                    remove_end=round(end, 3),
                    anchor_time=round((start + end) / 2, 3),
                    source_silence=Interval(start=silence.start, end=silence.end),
                    confidence="conservative",
                    reason="Timestamp gap corroborated by audio silence; keep padding and review original audio before applying.",
                ))
                break
            if len(candidates) >= 20:
                return candidates
    return candidates


def assess_timing(words: list[Word], silences: list[Interval], silence_available: bool, duration: float) -> TimingQuality:
    if not words or not silence_available:
        return TimingQuality(
            status="unavailable", conflict_count=0, conflicts=[],
            notes=["Reliable timing assessment requires both word timestamps and measured silence."],
        )
    issues = timing_conflicts(words, silences)
    notes = ["Word times are approximate; do not use unverified boundaries as frame-exact cut points."]
    if issues:
        notes.append("Speech timestamps overlap measured silence. Review these words against original audio; neither detector is assumed correct.")
    return TimingQuality(
        status="review_required" if issues else "no_detected_conflicts",
        conflict_count=len(issues), conflicts=issues, notes=notes,
    )
