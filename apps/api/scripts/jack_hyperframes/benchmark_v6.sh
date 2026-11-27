#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[[ "$(git branch --show-current)" == "feature/content-autopilot-v1" ]] || { echo "Wrong branch"; exit 1; }
export PYTHONPATH=apps/api
PY=apps/api/.venv/bin/python
DIR=apps/api/scripts/jack_hyperframes
WORK="${JACK_WORK:-$HOME/Downloads/RangManch-HyperFrames}"
OUT="$WORK/faceless-v6-$(date +%Y%m%d-%H%M%S)"
"$PY" "$DIR/v6_preflight.py" --workspace "$WORK"
"$PY" "$DIR/test_v6_offline.py"
"$PY" "$DIR/run_faceless.py" --topic "${1:-Three practical open-source AI tools for developers and creators}" --workspace "$WORK" --output "$OUT" --assets-root "$PWD/assets" --voice ash --spatial-preview
echo "Video: ${OUT}-render/review.mp4"
echo "QA: ${OUT}-render/qa/qa_report.json"
echo "Assets: ${OUT}-render/asset_usage.json"
echo "Guide: $OUT/resource_guide.pdf"
