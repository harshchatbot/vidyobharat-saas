# Illustrated V3.0 local prototype

This is a self-contained original HTML/SVG stage and **absolute-frame** browser renderer. It currently uses frame-driven JavaScript values (not GSAP), so the composition is deterministic without requiring a CDN or new npm dependencies. It does **not** add a Celery queue or license clearance. It generates eight original procedural SFX tones/noise at render time for QA.

Run from repo root after `git pull`:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/illustrated_v30/render.py \
  --storyboard apps/api/scripts/illustrated_v30/example_illustrated_v30.json --validate-only

PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/illustrated_v30/render.py \
  --storyboard apps/api/scripts/illustrated_v30/example_illustrated_v30.json \
  --output "$HOME/Downloads/illustrated_v30_smoke.mp4" \
  --smoke-frames 30

PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/illustrated_v30/render.py \
  --storyboard apps/api/scripts/illustrated_v30/example_illustrated_v30.json \
  --output "$HOME/Downloads/illustrated_v30_full.mp4"

open "$HOME/Downloads/illustrated_v30_full.mp4"
```

Requires `ffmpeg` and `playwright` in the Python virtual environment, plus locally installed Chromium for Playwright (`python -m playwright install chromium` when needed). On Mac pass `--chromium '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` to use installed Chrome and avoid browser download.

The rig is drawn as original procedural SVG parts, with six IDs, six facial poses and custom body colors; prop visual geometry is constructed on the persistent stage using HTML shapes. The prototype prioritizes rendering the full supplied example and honest QA reports over asset-library completeness. A later pass should export these components as individual editable SVGs, implement event-specific rigging and add Celery cost guards before service integration. **Never publish automatically.**

## Editorial polish pass (V3.1 prototype)

- Staggered per-word headline and caption animation, 8-beat progress indicators, responsive visual reactions to `shake` and `pop`, subtle actor breathing, and clearer persistent-stage layout.
- FFprobe now checks the actual decoded video frame count against the planned frame budget.
- This is *still* deterministic JavaScript frame seeking, **not GSAP**, and is a proof of concept, **not** a production auto-edit service.
- Copyright/commercial rights, visual QA automation, concurrency and rate limiting, Celery infrastructure, polished animation rigs, and production template diversity remain outstanding.
- `--smoke-frames` generates only a partial QA render. Do not treat it as an export.

## V3.2 local polish pass

The V3.2 stage adds deterministic pose-specific arm gestures and head nods,
blinks, critic-specific labels, reaction movement, bounded text scaling,
CTA visual emphasis, and frame-indexed confetti. No network dependency or
new AI planning call is required.

The output remains a **private QA preview**; review gate remains blocked.
It is not a skeletal rig, 3D animation engine, automatic scene planner,
or Celery job implementation.

Run the tests and an end-to-end render using the existing commands:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_illustrated_v30.py \
  apps/api/tests/test_illustrated_v32.py -q
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/illustrated_v30/render.py \
  --storyboard apps/api/scripts/illustrated_v30/example_illustrated_v30.json \
  --output "$HOME/Downloads/illustrated_v32.mp4" \
  --chromium "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

The V3.2 version is backward compatible with the V3.0 storyboard schema.
Do not publish until licensing and content QA controls are integrated.
