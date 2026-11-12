# V0.16 — Offline ChatGPT-to-HarshVerse Review and Preview

## Why

Use this ChatGPT Plus conversation for **manual semantic editing decisions** without
calling the OpenAI API every iteration. Your local Mac performs all validation
and FFmpeg rendering; ChatGPT Plus itself does not act as a local API.

The existing V0.15 schema is reused. ChatGPT must return **plain JSON** like:

```json
{
  "schema_version": "1.0",
  "choices": [
    {
      "phrase_id": "phrase_002",
      "module": "laptop_reveal",
      "evidence_quote": "dashboard",
      "reason": "The narrator explicitly introduces a dashboard demonstration."
    }
  ]
}
```

Quotes must be exact contiguous substrings of the given phrase. The phrase IDs
and real timestamps must come from your original Video Analysis V2
`CreativeContext`. Do not fabricate speech alignment.

## Review the choices without an API or an MP4

```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/preview_chat_scene_v016.py \
  --context /tmp/creative_context.json \
  --choices /tmp/chatgpt_choices_v016.json \
  --reference /tmp/reference_style_blueprint_v013.json \
  --output /tmp/chat_scene_review_v016.json
```

The output is review-only. It cannot claim that animations exist.

## Render one explicitly prepared animation plate

If you already have an **owned/verified** matching MP4 plate of sufficient
duration, and a presenter MP4 with audio matching the context duration:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/preview_chat_scene_v016.py \
  --context /tmp/creative_context.json \
  --choices /tmp/chatgpt_choices_v016.json \
  --reference /tmp/reference_style_blueprint_v013.json \
  --presenter ~/Downloads/Test_Talking_Head_Harsh.mp4 \
  --animation /ABSOLUTE/PATH/TO/VERIFIED_LAPTOP_REVEAL.mp4 \
  --approved-module laptop_reveal \
  --video-output /tmp/chat_preview_v016.mp4 \
  --output /tmp/chat_preview_review_v016.json
```

For now the renderer accepts **exactly one selected phrase and one plate**.
This is a presenter/full-frame split visual with the original audio maintained;
the existing V1 adapter does NOT yet render arbitrary kinetic typography layers.
The approved module name is an explicit user confirmation that the supplied
plate matches the selected concept; it is **not automatically verified by code**.
The code verifies file existence, media durations, and the plan structure,
but cannot independently certify a plate's artistic relevance or licensing.

Data-driven chart/day-counter/before-after proposals remain blocked until
their underlying numeric facts and graphic assets can be checked.

## Tests

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_chat_plan_preview.py \
  apps/api/tests/test_harshverse_semantic_scene_planner.py \
  apps/api/tests/test_harshverse_creative_scene_planner.py -q
```

## Planned work

1. Pull the real `CreativeContext` from the existing local preview's evidence
   rather than entering ad-hoc timestamps.
2. Reconcile previous animation-plate code from the still-preserved local stash.
3. Move from one-plate diagnostic renders to multi-module compositing with
   rigorous fact/asset checks and creator review.
4. Evaluate visual polish with real exported MP4s.

Branch: `feature/video-first-auto-edit-v1`. `main` remains unchanged.
