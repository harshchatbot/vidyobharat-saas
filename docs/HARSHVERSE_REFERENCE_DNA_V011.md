# Reference DNA v0.11 — Hosted vision providers

## Purpose

Make Google Gemini and OpenAI first-class **opt-in** providers for the existing v0.10 frame-level Reference DNA pipeline. No Ollama installation required. This is a read-only analysis tool, not a rendering/Auto Edit patch.

## Data path

Reference video → existing v0.9 cuts → existing v0.10 bounded JPEG frame extraction → hosted provider with JSON Schema → **existing** `validate_prediction()` → timestamped advisory labels → human evaluation gate.

The existing v0.10 analyzer still ignores `transition` and `kinetic_typography` labels derived from single still frames. Model confidence is **uncalibrated**. Output `semantic_module_selection_allowed` stays `false`.

## Model endpoints and design

* Gemini: `v1beta/models/{model}:generateContent`, image as `inline_data`, `generationConfig.responseMimeType` and `responseJsonSchema`. Uses a bounded explicit model name. [Google docs](https://ai.google.dev/api/generate-content).
* OpenAI: `v1/responses`, `input_image` + `input_text`, `text.format.type=json_schema`, `strict=true`, and `store=false`. [OpenAI docs](https://platform.openai.com/docs/api-reference/responses/create).
* Shared `labels` object schema; no JSON repair, no markdown stripping, no arbitrary outbound URL, no runtime-generated JavaScript. Existing output validator constrains allowed labels, evidence strings, and numeric confidence.
* API keys are read from environment variables, never included in output. Frame JPEG bytes are sent to the selected provider; **do not use without permission to upload the reference footage**. No audio or entire reference video is sent in v0.11. Review provider retention and data policies before processing sensitive media.

## Installation

Extract patch into RangManch repository root. No new Python packages are required. Test:

```sh
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_harshverse_reference_dna_hosted.py -q
```

### Offline/no model

```sh
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v011.py \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --provider none --output /tmp/reference_dna_v011_none.json
```

### Gemini — opt-in (billable where applicable)

Set `GEMINI_API_KEY` in your own terminal environment (don't paste it into chat or source control):

```sh
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v011.py \
  --reference "/path/to/authorized_reference.mp4" \
  --provider gemini --model gemini-2.5-flash --max-frames 6 \
  --output /tmp/reference_dna_v011_gemini.json
```

### OpenAI — opt-in (billable)

Set `OPENAI_API_KEY` in your environment:

```sh
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v011.py \
  --reference "/path/to/authorized_reference.mp4" \
  --provider openai --model gpt-4.1-mini --max-frames 6 \
  --output /tmp/reference_dna_v011_openai.json
```

Model names are examples; choose models supported by your account. An unavailable model or provider refusal fails closed for that frame; CLI exits nonzero if any inference failed. Individual failure types are recorded in `frame_observations.error`.

## Evaluation plan

Annotate a professional reference clip with ground-truth label intervals; evaluate per-class precision/recall and timing alignment on a shared sampled-frame set. Compare cost/latency and provider errors using the *same frame budget*. Do not approve animation selection until semantic and temporal quality gates are established.

## Limitations

No direct video upload to provider; this analyzes sampled stills only. It cannot establish movement animation, typography entrance or precise SFX timing from a single frame. Not wired to public API, UI or production Celery workers; no automatic video edits triggered. A successful test does not prove hosted inference or creative quality.
