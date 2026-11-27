#!/usr/bin/env bash
set -euo pipefail
# Local-only tooling; no production changes or cloud uploads.
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="${1:-$HOME/Downloads/RangManch-HyperFrames}"
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' || { echo "Node 22+ required"; exit 1; }
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
mkdir -p "$WORK"
cd "$WORK"
if [[ ! -f package.json ]]; then npm init -y; fi
if [[ ! -x node_modules/.bin/hyperframes ]]; then
  npm install --save-exact hyperframes gsap three
fi
HF="$WORK/node_modules/.bin/hyperframes"
"$HF" doctor
if [[ ! -e cdc-benchmark ]]; then
  "$HF" init cdc-benchmark --resolution portrait --skip-skills --non-interactive
fi
cd cdc-benchmark
"$HF" check --json > "$WORK/bootstrap-check.json"
echo "Official framework scaffold only. No cinematic benchmark or audio assets generated."
echo "Workspace: $WORK"
