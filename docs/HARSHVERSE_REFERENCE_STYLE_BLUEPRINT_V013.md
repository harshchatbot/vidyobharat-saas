# HarshVerse Reference Style Blueprint V0.13

## Overview

This is a **read-only, advisory-only** compiler for Reference DNA JSON (including V0.12.1 output).
It does not contact an AI API, touch the editor, render video or authorize automatic edits.

The existing V0.12.1 reference analyzer may still exist only in your **local Mac checkout**. This PR
deliberately does not pretend to migrate that prior work to GitHub.

## Usage

```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/build_reference_style_blueprint_v013.py \
  --input /tmp/reference_dna_v0121_openai.json \
  --output /tmp/reference_style_blueprint_v013.json

PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_reference_style_blueprint.py -q
```

## Contract

- `observed`: source-derived **unreviewed model proposals**, timestamps and short evidence.
- `inferred`: tentative patterns such as presenter mixed with explanatory graphics.
- `recommended`: soft preferences conditional on narration and verified input facts.
- `quality_gate.automatic_application_allowed`: always **false**.
- `diagnostics`: skipped invalid/missing evidence.

Only an allowlisted set of labels is accepted. Invalid source durations/cuts are rejected.
Motion labels need evidence from at least two distinct sampled frames. Confidence from a model
is not calibrated accuracy. Input data is not mutated.

No frames, source audio or copied reference assets are embedded in this blueprint.
Evidence descriptions are included and may contain words drawn from the reference clip.

## Follow-up

Review against manually annotated clips before connecting its suggestions to the Creative Director.
Next phase: consume this **as optional style guidance** while selecting effects based on
timestamped target narration and the approved HarshVerse module registry.
