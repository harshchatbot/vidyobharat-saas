#!/usr/bin/env bash
# Backend-only smoke test: use a real presenter video and a generated, original
# procedural motion plate. This is not AI semantic editing or a premium preset.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PYTHON="${HARSHVERSE_PYTHON:-$ROOT/apps/api/.venv/bin/python}"
SOURCE="${1:-$HOME/Downloads/Test_Talking_Head_Harsh.mp4}"
OUT_DIR="${2:-$HOME/Downloads/HarshVerse-Test}"

if [[ ! -f "$SOURCE" ]]; then
  printf 'Presenter video not found: %s\n' "$SOURCE" >&2
  exit 2
fi
if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo 'FFmpeg and ffprobe are required (macOS: brew install ffmpeg).' >&2
  exit 2
fi
if [[ ! -x "$PYTHON" ]]; then
  echo "Python executable not found: $PYTHON" >&2
  exit 2
fi
RAW_DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SOURCE")"
DURATION="$("$PYTHON" - "$RAW_DURATION" <<'PY'
import math
import sys
try:
    value = float(sys.argv[1])
except (ValueError, IndexError):
    sys.exit('Unable to determine presenter duration.')
if not math.isfinite(value) or not 6 <= value <= 60:
    sys.exit(f'The V1 demo needs a presenter between 6 and 60 seconds; received {value:g}s. Original input was not trimmed.')
print(f'{value:.3f}')
PY
)"
if [[ -z "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$SOURCE")" ]]; then
  echo 'Presenter video must contain an audio stream.' >&2
  exit 2
fi
mkdir -p "$OUT_DIR"
OUTPUT="$OUT_DIR/harshverse_preview.mp4"
PLATE="$OUT_DIR/demo_animation_plate.mp4"
if [[ -e "$OUTPUT" ]]; then
  printf 'Output already exists (not overwriting): %s\n' "$OUTPUT" >&2
  exit 2
fi

# Animated typography and geometry are original, created with FFmpeg.
FILTER="drawgrid=w=80:h=80:t=1:c=0x67E8F9@0.20,drawbox=x=60:y=340:w=600:h=560:color=0x155E75@0.45:t=fill,drawtext=text='RANGMANCH AI':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2+28*sin(t*1.7),drawtext=text='VISUAL EXPLAINER':fontcolor=0x67E8F9:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+130+14*cos(t*1.7),fade=t=in:st=0:d=0.5"
printf 'Generating original demo animation plate (%ss)...\n' "$DURATION"
if ! ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i 'color=c=0x0F172A:s=720x1280:r=30' -t "$DURATION" \
  -vf "$FILTER" -an -c:v libx264 -preset veryfast -crf 24 \
  -pix_fmt yuv420p -movflags +faststart "$PLATE"; then
  echo 'Animated typography unavailable in FFmpeg; falling back to a generated technical test plate.' >&2
  ffmpeg -hide_banner -loglevel error -y -f lavfi \
    -i 'testsrc2=s=720x1280:r=30' -t "$DURATION" \
    -an -c:v libx264 -preset veryfast -crf 26 \
    -pix_fmt yuv420p -movflags +faststart "$PLATE"
fi
printf 'Rendering preview from presenter: %s\n' "$SOURCE"
PYTHONPATH="$ROOT/apps/api${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON" \
  "$ROOT/apps/api/scripts/render_harshverse_local.py" \
  --presenter "$SOURCE" --animation "$PLATE" --output "$OUTPUT" --demo
printf '\nRendered MP4: %s\nOriginal motion plate: %s\n' "$OUTPUT" "$PLATE"
