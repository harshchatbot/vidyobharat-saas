# HarshVerse Reference DNA V0.12 — temporal evidence

## Purpose

V0.11 analyzes isolated frames. V0.12 examines *ordered groups of three frames* selected near shot centers and detected cuts, allowing models to propose multiple simultaneous visual classes and evidence-backed motion. Existing V0.6–V0.11 analysis remains unchanged. This patch adds a new `temporal_vision` output section, not a replacement for the old `semantic_vision` section.

## Scope and truthfulness

- Motion labels (`kinetic_typography`, `text_reveal`, `zoom`, `slide`, `transition`) require evidence from at least **two distinct supplied timestamps**.
- All outputs remain unreviewed predictions; confidence values are *uncalibrated*.
- API providers may misclassify elements or infer motion from mere frame differences; compare results with human-labeled reference intervals before use.
- The model never selects final edit modules. `semantic_module_selection_allowed` is always `false`.
- Neither reference audio nor frame bytes are embedded in the saved JSON. Selected JPEG frames are sent to the chosen hosted provider **only** when `--provider` is explicitly selected.
- A model output cannot contain arbitrary animation code; the backend validates label vocabulary, time bounds, evidence timestamps and response limits.

## Running locally

From repo root, after applying the patch:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_harshverse_reference_dna_temporal.py -q
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v012.py \
  --reference /path/to/authorized_reference.mp4 --provider none \
  --output /tmp/reference_dna_v012.json
```

Optional OpenAI test (uses existing `OPENAI_API_KEY` in your process environment):

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v012.py \
  --reference /path/to/authorized_reference.mp4 --provider openai \
  --model gpt-4.1-mini --max-windows 3 --output /tmp/reference_dna_v012_openai.json
```

**Cost:** 3 images per window; `--max-windows 3` sends up to 9 frames across three requests. Obtain explicit authorization for hosted-video analysis and follow the provider's data-use conditions. Do not commit keys or output containing private inferences.

## Testing and evaluation gates

Review labeled example intervals with exact start/end times and one or more labels. Report per-label precision, recall, temporal IoU, false positives and disagreement across diverse clips. Do not enable automated animation selection on the basis of model-provided confidence alone. The previously implemented `evaluate_intervals` can be reused after mapping temporal observations to its expected schema.

## Integration

Additive files only; the current Auto Edit UI, preview worker, rendering pipeline and existing V0.11 CLI are **not changed**. Future Creative Director integration should use an explicit, independently tested translator from reviewed reference techniques to allowed HarshVerse modules, grounded in actual narration and asset licensing.
