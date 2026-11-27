# HarshVerse Reference DNA V0.12.1 — Shot-aware temporal sampling

## Why
V0.12 selected three 0.8-second windows centered near 0.83s, 7.13s, and 15.1s when given a three-request budget. On a five-shot sample that misses whole graphic-heavy shots. This patch prioritizes each detected shot before cut boundaries / visual activity.

## Changes
- `plan_windows`: one three-frame temporal window per shot if budget permits. Additional requests first target time-grounded visual-activity events, then cut boundaries. Nearby/overlapping windows are deduplicated.
- `build_windows`: preserves the V0.12 return shape (`list[list[float]]`), but uses the new planner.
- `analyze_temporal`: adds `sampling_strategy`, `sampling_coverage` and per-window `sampling_reason` and `shot_index` to `temporal_vision`.
- `analyze_reference_dna_v0121.py`: replacement CLI; default budget 6 windows. The old V0.12 CLI remains untouched and will pick up new behavior through the shared module.

## Limits
- If `--max-windows` is below number of shots, coverage is incomplete and the response explicitly lists `uncovered_shot_indices`. Do not interpret observed windows as all shots.
- A 3-frame 0.8s sample is not sufficient to characterize ultra-fast typography, every transition, or sound effects.
- All predictions remain **unreviewed** and **uncalibrated**; `semantic_module_selection_allowed` remains false.
- The local `--provider none` mode performs no paid inference and produces zero model observations by design.
- More windows means more API calls; no reference frames or audio are copied into the JSON report.
- Shot indices are zero based.
- API credentials are read only through `OPENAI_API_KEY` / `GEMINI_API_KEY` environment variables and are not written into reports.

## Install
Extract patch at `~/Downloads/vidyobharat-saas`, then:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_reference_dna*.py -q
```

## First verify coverage without paid model calls

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/analyze_reference_dna_v0121.py \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --provider none --max-windows 6 \
  --output /tmp/reference_dna_v0121_local.json
```

## Live OpenAI test
Load the existing trusted `apps/api/.env` into your environment before running (do not paste keys in chat). For this example with five shots use 6 windows, giving five shot centers plus one event/cut window:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/analyze_reference_dna_v0121.py \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --provider openai --model gpt-4.1-mini --max-windows 6 \
  --output /tmp/reference_dna_v0121_openai.json
```

Provider analysis incurs API charges. Compare vision labels and evidence against actual frames and manually reviewed annotations before enabling automatic scene selection.

## Verification recorded in patch development
- 61 Reference DNA tests passed in available test workspace.
- Actual `/mnt/data/auto_edit_v3_preview.mp4` analyzed in local `none` mode: 5 shots, 6 windows, 5/5 covered, 0 errors.
- The user's Mac must independently verify installation and actual model inference.
