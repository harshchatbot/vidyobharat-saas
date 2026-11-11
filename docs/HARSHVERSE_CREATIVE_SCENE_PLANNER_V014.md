# HarshVerse V0.14 — Advisory Creative Scene Planner

## Purpose

Connect the existing RangManch `CreativeContext` (derived from Video Analysis V2) to a
**review-only** list of proposed HarshVerse animation modules. Optionally consume the
V0.13 Reference Style Blueprint as **soft guidance**.

This is **not** the live Auto Edit endpoint, a rendered animation, an executable timeline,
or a production-ready inference model.

## Entrypoint

```python
from app.services.harshverse.creative_scene_planner import propose_scene_plan

proposal = propose_scene_plan(
    context,  # Existing validated CreativeContext
    reference_blueprint=optional_v013_blueprint_dict,
    max_scenes=5,
)
```

Run tests:

```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_creative_scene_planner.py \
  apps/api/tests/test_harshverse_reference_style_blueprint.py \
  apps/api/tests/test_video_creative_director.py -q
```

## Contracts

- Candidate animation IDs are allowlisted: `headline`, `type_slam`, `day_counter`,
  `laptop_reveal`, `lower_third`, `before_after`, `stat_chart`.
- Narration phrases are selected by their **existing phrase IDs and time bounds**, not by
  invented start/end times or copied reference cut positions.
- V0.13 `progressive_text_emphasis` preference may change the opening choice from
  `headline` to `type_slam` **only when a meaningful opening phrase exists**.
- Numeric data, money amounts, graph datasets and licensed assets are **never fabricated**.
  A phrase with a percentage can only suggest a chart candidate.
- `money_stack` is deliberately absent because it is not a production-approved module.
- Review-required and invalid-timestamp phrases are skipped.
- Output explicitly records `automatic_application_allowed: false`,
  `assets_resolved: false` and `render_ready: false`.
- A reference blueprint cannot override narration relevance. Reference media are not copied.
- No model API calls, asset downloads, filesystem mutations, timeline writes or worker dispatch.

## Limitations and next steps

V0.14 starts with deterministic phrase triggers. These are intentionally **conservative**
and are not a replacement for semantically informed model selection (including Hindi narration,
implicit meaning, and cross-sentence context). Model-planned scene proposals will need the
same validation and review gates. Event-timed SFX, professional transitions, asset licensing,
and compositing are separate milestones.

**Git integration caveat:** V0.6–V0.12.1 Reference DNA implementations were previously tested
in a local Mac checkout and are currently stored in a Git stash. V0.13/V0.14 code on this
branch can read *their JSON outputs* without importing those missing modules. Do not delete
or blindly apply the stash; inspect and reconcile it before migrating dependencies.

## Branch policy

Develop on `feature/video-first-auto-edit-v1`. Keep `main` unchanged until the user
approves the final merge.
