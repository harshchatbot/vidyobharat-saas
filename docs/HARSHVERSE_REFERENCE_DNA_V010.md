# HarshVerse Reference DNA V0.10 — Semantic Vision Adapters

## Goal
Add **opt-in** model-based visual recognition to V0.9, not a second editor or exporter. This is a reference-analysis module, not an Auto Edit production feature.

## Source and installation
Patch includes only three source files: `reference_dna_semantic.py`, `analyze_reference_dna_v010.py`, and `test_harshverse_reference_dna_semantic.py`. It requires **existing V0.6–V0.9 files** to be installed. Neither routers, worker tasks, nor UI are modified. Uses existing `ffmpeg`, NumPy and OpenCV optional detector.

## Providers
- `none` (default): extracts sample JPEGs but abstains, makes **no network requests**.
- `fixture`: deterministic, offline predictions for tests. Not evidence of actual AI recognition.
- `ollama`: **explicit opt-in** sends selected JPEGs only to `http://127.0.0.1:11434/api/chat`. Requires installed model with **vision** capability; model name alone doesn't guarantee it. Suggested `ollama pull gemma3:4b` if compatible with machine/resources; check Ollama model card/license and availability first.
- `openai`: **explicit opt-in** sends selected JPEGs to OpenAI API. Requires `OPENAI_API_KEY` (API usage billed separately). Model must support image input and JSON response format; select a supported model. Reference content can leave your machine, so use only material you have permission to process.

## Data contract
`schema_version: reference-dna/v0.5` adds `semantic_vision.frame_observations`, each with frame timestamp, validated candidate labels, subjective model confidence, evidence text, and error code. The original v0.9 sections are preserved.

Labels: presenter, full_screen_graphics, split_screen, lower_third, chart, calendar, money_stack, illustration, b_roll. A single still cannot prove a transition or kinetic animation: those labels are dropped even if suggested. Unknown categories are dropped. No generated JavaScript is executed.

## Safety and quality gates
- Sample shot centers and near-cut frames; cap to <=16 low-resolution images per clip.
- Treat provider confidence as **uncalibrated** and evidence as a proposed explanation, not fact.
- `semantic_module_selection_allowed` stays **false**, including for real model providers.
- Failed inference produces a timestamped abstention rather than inventing a class.
- Frames are piped via FFmpeg into memory; not saved or embedded in the output JSON.
- Source permissions and file path authorization are the responsibility of the caller. **Do not expose CLI input paths directly to untrusted API clients.**
- In production, provision detection models in a pinned environment and enforce request timeout, total compute budget, per-user rate limits, and signed/authorized guest assets.

## Test and run
```
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_harshverse_reference_dna_semantic.py -q
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v010.py \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --output /tmp/reference_dna_v010.json
```

Local Ollama (only after installing a vision-capable model):
```
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v010.py \
  --provider ollama --model gemma3:4b --max-frames 6 \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --output /tmp/reference_dna_v010_ollama.json
```

## Acceptance next
Manually annotate at least 3 legally usable polished references with time intervals for each class; compare model predictions to reviewed labels using temporal IoU and track per-class precision/recall, then implement multi-frame transition detection and temporal annotation grouping. Only after quality thresholds, cost/security review, and meaningful semantic relevance tests should a Creative Director consume these predictions. Never copy reference media into the final edit.
