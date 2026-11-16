# Illustrated V3.4 — graphic-first Creative Director

This version addresses V3.3's **five-critics story anchoring** and repetitive layouts.

## Implementation

- Original reference storyboard is **no longer supplied** to the AI director.
- Five new stage props: phone_screen, retention_chart, timeline_bar, compare_card, checklist_card.
- Stage layouts: character_focus, graphic_focus, full_bleed, split_compare, center_card, cta_focus.
- AI storyboard must contain four distinct layouts and at least three beats with graphical elements.
- Unrelated critic characters are forbidden; events must target something in the scene (or the stage).
- V3.2 validation and final publish lock remain intact.
- Sampled DOM text-overflow and element-boundary checks plus static storyline diversity checks are recorded in V3.4 report.
- Rendering remains **local, synchronous, preview-only**. No Celery, automatic license clearance or production export authorization.

## Local Mac test

From repo root on existing feature/video-first-auto-edit-v1 branch:

```bash
git pull --ff-only origin feature/video-first-auto-edit-v1
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_illustrated_v30.py \
  apps/api/tests/test_illustrated_v32.py \
  apps/api/tests/test_illustrated_v33.py \
  apps/api/tests/test_illustrated_v34.py -q
```

Make sure OPENAI_API_KEY is set in apps/api/.env or your shell environment (do not paste it into chat).

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/illustrated_v30/auto_direct_v34.py \
  --topic "Show why the first three seconds of a short video matter: demonstrate a phone, retention chart, timeline and before-versus-after hook." \
  --output-dir "$HOME/Downloads/RangManch-V34-Run1" \
  --chromium "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

open "$HOME/Downloads/RangManch-V34-Run1/illustrated_v34_preview.mp4"
```

Use a fresh empty output directory for each run. The output contains the AI storyboard JSON, MP4 and a report with both `storyboard_preflight` and `visual_qa`. API validation failures are genuine failures, not hidden example substitution.

## QA limitations and remaining work

- No pixel-level image-quality detection; DOM check samples only one frame per scene.
- Animated SVG prop artwork is still procedural/limited; not all subject-specific visual metaphors can be rendered.
- The director still uses eight fixed beats with 600 total frames.
- 3–5 diverse topic acceptance runs and qualitative comparison required before claiming creative generality.
- Need template variety, flexible timing, Celery quotas, durable cloud media, license evidence and human approval UI.
