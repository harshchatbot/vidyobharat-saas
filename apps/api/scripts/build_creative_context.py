"""Export compact Gemini-ready creative context from a local V2 analysis JSON.

Run from apps/api:
    python scripts/build_creative_context.py /path/to/rangmanch-video-analysis-v2.json

Output is written next to the input; no remote API or LLM call is made.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Running as 'python scripts/...' from apps/api doesn't automatically add apps/api.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.video_analysis import VideoAnalysisReport
from app.services.video_creative_context import build_creative_context


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path, help="Existing Video Analysis V2 JSON report")
    parser.add_argument("--out", type=Path, default=None)
    options = parser.parse_args()
    source = options.report.expanduser().resolve()
    destination = (options.out.expanduser().resolve() if options.out else
                   source.with_name(source.stem + "-creative-context.json"))
    if source == destination:
        parser.error("Output must not overwrite the original analysis report.")
    report = VideoAnalysisReport.model_validate_json(source.read_text(encoding="utf-8"))
    context = build_creative_context(report)
    payload = context.model_dump(mode="json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    original_bytes = source.stat().st_size
    compact_bytes = destination.stat().st_size
    print(f"Creative context: {destination}")
    print(f"Phrases: {len(context.phrases)}; approved cuts: {len(context.approved_cuts)}; review: {context.review_required}")
    print(f"Bytes: {original_bytes:,} -> {compact_bytes:,} ({100 * compact_bytes / original_bytes:.1f}% of original)")


if __name__ == "__main__":
    main()
