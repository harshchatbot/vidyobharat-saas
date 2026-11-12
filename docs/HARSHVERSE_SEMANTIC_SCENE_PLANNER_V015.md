# HarshVerse V0.15 — OpenAI Semantic Scene Intelligence

## Scope

V0.15 adds an **optional, read-only** model-based planner beside the V0.14 keyword
heuristic planner. It consumes existing validated `CreativeContext` phrases and an
optional V0.13 Reference Style Blueprint. It **does not** alter the Auto Edit
endpoint, existing Video Creative Director, guest timeline, rendering worker or UI.

The objective is to understand implicit narration meaning, including Hindi/Hinglish,
while enforcing strict server validation.

## Safety architecture

1. Server sends an allowlisted manifest of narration phrase IDs, text and timing
   review status to OpenAI; no video files or model-invented timestamps.
2. OpenAI returns structured JSON: phrase ID, allowlisted module ID, exact quote
   from that phrase and a brief reason.
3. Server rejects unknown IDs, invalid module IDs, unmatched quotes, duplicate
   phrase IDs, unreviewed timing, crowded plans and out-of-order scenes.
4. Server attaches **authoritative phrase timestamps** from `CreativeContext`.
5. Every output remains advisory: `automatic_application_allowed=false`,
   `render_ready=false`, `assets_resolved=false`, `numeric_claims_verified=false`.
6. Reference style offers soft preferences; it does not create obligatory scenes
   or supply copyrighted assets.

**Important limitation:** Exact quote verification establishes textual grounding,
not semantic truth. A model can still choose an irrelevant module. Human review,
fact-checking and future automatic semantic scoring remain necessary.

## Test without paid API calls

```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_semantic_scene_planner.py \
  apps/api/tests/test_harshverse_creative_scene_planner.py \
  apps/api/tests/test_harshverse_reference_style_blueprint.py \
  apps/api/tests/test_video_creative_director.py -q
```

## Real OpenAI test

Create a genuine `CreativeContext` JSON from an existing Video Analysis V2
`build_creative_context(report).model_dump_json()`. Do not fake timestamps for
actual production use.

Then run:

```bash
cd ~/Downloads/vidyobharat-saas
set -a && source apps/api/.env && set +a
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/plan_harshverse_semantic_v015.py \
  --context /tmp/creative_context.json \
  --reference /tmp/reference_style_blueprint_v013.json \
  --model gpt-4.1-mini --max-scenes 5 \
  --output /tmp/semantic_scene_proposals_v015.json
```

Omit `--reference` to compare narration-only semantic planning. Each invocation
makes **one paid OpenAI API request**. Avoid printing or committing secrets or
private transcripts.

## Next milestones

- Bring locally stashed Reference DNA V0.6–V0.12.1 code into this branch via
  deliberate reconciliation; no automatic stash reapplication.
- Add supervised evaluation against user-reviewed scenes and annotations.
- Independently verify all numerical/chart content and source asset licensing.
- Map reviewed proposals to native HarshVerse scene/render contracts, then preview
  before permitting export.

Development branch: `feature/video-first-auto-edit-v1`. Do not merge `main` yet.
