# HarshVerse V0.17 — Opt-in Multi-Effect Finishing Pass

## Scope

This version adds a **real local FFmpeg finishing pass** over an existing HarshVerse
preview MP4. It can add several distinct, scheduled effects in one output, and
reports exactly what rendered and what was deferred. No model or paid API call.

Renderable: `punch_zoom`, `impact_shake`, `headline`, `tick`, `cross`,
and original `sfx` (`whoosh`, `pop`, `click`, `faahh`, `typewriter`).

**Not rendered in V0.17:** `jump_cut`, `j_cut`, `l_cut`, `broll`,
`money_stack`, `calendar`, `emoji`, `transition`.
These appear in the audit under `deferred` rather than being silently skipped.
In particular, speech-safe jump cuts require verified removal windows;
J/L cuts require overlapping-track timeline handling; B-roll requires resolved
owned/licensed media, not just a model-suggested keyword. More illustrations
and overlays need an approved asset library and proper compositing.

This is an **opt-in diagnostic finishing pass**, not connected to Auto Edit UI
or an automatic production export. Original source file remains unchanged;
audio timestamps are preserved, with optional original procedural SFX mixed.
Effects must be manually selected and checked for narrative relevance and
face safety. Numeric/chart claims are not fabricated.

## Test

```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_pro_finishing_v017.py -q
```

## Render an actual preview and open on Mac

The sample assumes an already-rendered video longer than 15 seconds at:

`~/Downloads/HarshVerse-V016-Preview/harshverse_creative_preview.mp4`.

Run:

```bash
cd ~/Downloads/vidyobharat-saas && \
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/finish_harshverse_v017.py \
  --source "$HOME/Downloads/HarshVerse-V016-Preview/harshverse_creative_preview.mp4" \
  --effects apps/api/examples/harshverse_effects_v017_demo.json \
  --output "$HOME/Downloads/HarshVerse-V017-Finished.mp4" \
  --audit "$HOME/Downloads/HarshVerse-V017-Audit.json" && \
open "$HOME/Downloads/HarshVerse-V017-Finished.mp4"
```

Inspect `~/Downloads/HarshVerse-V017-Audit.json`:
- `rendered`: actual effects selected by the validated local plan after FFmpeg completed
- `deferred`: unsupported asset/cut-dependent effects, not rendered
- `approved_for_export`: always false

The demo is a **diagnostic timeline**, not a narration-aligned artistic edit.
Source must have a video and audio stream. The default macOS Arial font path
must be present; otherwise supply `--fontfile /path/to/font.ttf`.

## Next engine work

1. Add verified, speech-safe cut-list/retiming with J/L-cut audio semantics.
2. Build a resolved asset registry and multi-layer compositor for illustrations,
   money, calendar, emojis and licensed B-roll.
3. Drive effect timing from the semantic Scene Planner and reviewed source evidence,
   not this diagnostic JSON.
4. Integrate an editorial density/face-safe quality gate and preview review UI.

Work only on `feature/video-first-auto-edit-v1` until final approval.
