# RangManch Creative Director V2 — professional scene spec (experimental)

## Goal

Generate an intentional **scene-by-scene storyboard** for a talking-head
reel, instead of a few disjoint caption/zoom suggestions. This is the
planning foundation of a professional Auto Edit workflow, **not** a
professional finished edit yet.

V1.1 stays in place. The existing production video editor, rendering,
Celery and export flows are unchanged.

## Architecture

1. Video Analysis V2 produces transcript, phrase timings, visual guidance,
   geometry, and verified (possibly empty) cut candidates.
2. The existing compact Creative Context builder supplies only allowlisted
   evidence to the model; source transcript is treated as untrusted data.
3. `video_creative_director_v2.py` generates scene beats with OpenAI strict
   Structured Outputs. No timecodes are requested from the model.
4. `validate_scene_plan` ensures all speech phrases are covered **exactly
   once in order**, validates all scene visual modes, face-safe zoom caps,
   caption emphasis, and ensures B-roll is only a search query.
5. `storyboard` derives approximate source timings from phrase IDs.
   It does NOT compile timeline operations or fetch/render media.

V2 modes: `talking_head`, `graphic_overlay`, `broll_overlay`, `split_screen`.
Reusable conceptual motion templates: `keyword_card`, `data_flow`,
`human_vs_ai`, `source_stack`, `none`.
Sound cues: `none`, `soft_pop`, `soft_whoosh`; intents only.

## Run locally

```bash
cd ~/Downloads/vidyobharat-saas
git pull --ff-only origin feature/video-first-auto-edit-v1
cd apps/api
source .venv/bin/activate

python -m pytest tests/test_video_creative_context.py \
  tests/test_video_creative_director.py \
  tests/test_video_creative_director_v2.py -q

# Existing input context can be reused; this is a separate V2 experiment.
python scripts/run_creative_director_v2.py \
  "$HOME/Downloads/rangmanch-video-analysis-v2 (5)-creative-context.json" \
  --fallback

# Only after local tests pass; this makes an actual, billed OpenAI API call.
python scripts/run_creative_director_v2.py \
  "$HOME/Downloads/rangmanch-video-analysis-v2 (5)-creative-context.json" \
  --model gpt-4o-mini
```

Result: `rangmanch-video-analysis-v2 (5)-creative-context-scene-plan-v2.json`
with `plan`, `storyboard`, and explicit safety constraints.
`--fallback` writes the same path, so run it before the paid version,
or pass `--out` to retain both.

## Non-negotiable limits

- No cuts or trims: this sample has zero verified safe cut candidates.
- All spoken words, voice and source video are preserved by existing editor.
- No action is auto-applied, and no render operation is implemented here.
- B-roll/media search descriptions are NOT available or licensed assets.
- Motion template values are **design intents**, not existing templates
  wired into the editor. Implement them separately before rendering.
- Sparse face sampling and approximate transcript timings require review.
- One repair request may be issued for invalid JSON/semantic output and
  consumes additional provider tokens.
- This cannot guarantee professional output quality until the motion
  renderer, licensed asset library, sound mixer and automated visual QA exist.

## Next engineering milestone

Implement a read-only storyboard preview in the editor, then parameterized
motion templates and an asset resolution/licensing gate. Only then add a
versioned V2-to-timeline compiler behind a feature flag, with export parity
tests, voice/music ducking, safe zones, and post-render QA.
