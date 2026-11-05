"""Local-only optional forced word-alignment benchmark; does not change production STT.

Usage from apps/api (video must be the ORIGINAL file, not a trimmed copy):
    python scripts/compare_stable_ts.py /path/video.mp4 /path/analysis-v2.json --model small

Requires: pip install 'stable-ts[fw]' (optional, in a separate test venv).
Stable-ts upstream development is paused; audit dependencies and model licenses.
No output is uploaded. Comparison metrics are diagnostics, NOT ground-truth
alignment accuracy. Always review boundary clips against the actual recording.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Use the API's own typed scoring to compare the SAME source-file evidence.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.schemas.video_analysis import Interval, Word
from app.services.video_analysis_timing import timing_conflicts, semantic_segments


def extract_audio(video: Path, audio: Path) -> None:
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(video), "-t", "65", "-vn", "-ac", "1", "-ar", "16000", str(audio),
    ], check=True, timeout=90, capture_output=True)


def get_stable_words(audio: Path, model_name: str, reference_text: str, language: str):
    import stable_whisper  # only imported when explicitly running the benchmark

    model = stable_whisper.load_faster_whisper(
        model_name, device="cpu", compute_type="int8",
    )
    # Re-align the *same transcript* rather than comparing different ASR text.
    # This isolates differences in word timing from recognition differences.
    result = model.align(str(audio), reference_text, language=language, verbose=False)
    if result is None:
        raise RuntimeError('Stable-ts alignment returned no results')
    words = []
    for seg in result.segments:
        for word in seg.words or []:
            text = str(word.word).strip()
            start, end = float(word.start), float(word.end)
            if text and 0 <= start < end <= 65:
                words.append(Word(text=text[:100], start=start, end=end))
    return words


def summarise(words: list[Word], silences: list[Interval]):
    conflicts = timing_conflicts(words, silences)
    return {
        "word_count": len(words),
        "overlap_conflict_count": len(conflicts),
        "overlapping_words": [
            {"text": issue.word_text, "start": issue.word_start,
             "end": issue.word_end, "silence_overlap": issue.overlap_seconds}
            for issue in conflicts
        ],
        "utterance_count": len(semantic_segments(words, conflicts)),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("analysis_json", type=Path)
    parser.add_argument("--model", default="small")
    parser.add_argument("--out", type=Path, default=Path("stable-ts-comparison.json"))
    opts = parser.parse_args()

    report = json.loads(opts.analysis_json.read_text())
    if report.get("schema_version") != "2.0":
        parser.error("Expected RangManch VideoAnalysisReport version 2.0")
    if report["audio"]["status"] != "complete" or report["speech"]["status"] != "complete":
        parser.error("Both speech and silence evidence must be complete")
    base = [Word.model_validate(w) for w in report["speech"]["words"]]
    silences = [Interval.model_validate(item) for item in report["audio"]["silence_intervals"]]
    if not opts.video.is_file():
        parser.error("Original video file not found")
    with tempfile.TemporaryDirectory(prefix="rangmanch-stable-benchmark-") as temp:
        wav = Path(temp) / "speech.wav"
        extract_audio(opts.video, wav)
        started = time.perf_counter()
        reference = ' '.join(word.text for word in base)
        candidate = get_stable_words(wav, opts.model, reference, report['speech'].get('language') or 'en')
        elapsed = round(time.perf_counter() - started, 2)
    if not candidate:
        parser.error("Stable-ts returned no aligned words")
    import re
    def lexical(text: str) -> str:
        return re.sub(r"[^\\w]+", "", text).casefold()
    original_tokens = [lexical(w.text) for w in base if lexical(w.text)]
    aligned_tokens = [lexical(w.text) for w in candidate if lexical(w.text)]
    if original_tokens != aligned_tokens:
        parser.error("Aligned token sequence does not match original transcript; do not compare timestamps")
    result = {
        "source": "local_original_video",
        "model": opts.model,
        "stable_ts_elapsed_seconds": elapsed,
        "faster_whisper_existing": summarise(base, silences),
        "stable_ts_candidate": summarise(candidate, silences),
        "same_transcript_verified": True,
        "note": "Conflict counts measure disagreement with -35 dB silence, NOT alignment accuracy. Review original audio manually before choosing a timestamp provider.",
        "candidate_words": [w.model_dump() for w in candidate],
    }
    opts.out.write_text(json.dumps(result, indent=2))
    print(f"Saved local benchmark comparison: {opts.out}")
    print("Existing conflicts:", result["faster_whisper_existing"]["overlap_conflict_count"])
    print("Stable-ts conflicts:", result["stable_ts_candidate"]["overlap_conflict_count"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
