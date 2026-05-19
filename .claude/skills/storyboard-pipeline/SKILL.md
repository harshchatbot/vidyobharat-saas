---
name: storyboard-pipeline
description: Business logic and rules for RangManchAI storyboard pipeline. Use when working on StoryboardPipelineService, ad categories, checkpoints, scene state machine, emotion tagging, quality scoring, voice preview, or credit rules. Triggers on: storyboard, pipeline, scene, category, checkpoint, lipsync, emotion, TTS, voice, scoring, ad format, recipe, orchestrator.
---

## The 7 Ad Categories
| Category | Lipsync | Avatar | Primary Video Model |
|---|---|---|---|
| ugc_testimonial | YES | YES | kling_o3_standard |
| founder_talking_head | YES | YES | kling_o3_standard |
| problem_solution | NO | YES | kling_o3_standard |
| product_demo_lifestyle | NO | YES | seedance_v1_lite |
| inner_monologue | NO | YES | kling_o3_standard |
| cinematic_narration | NO | OPTIONAL | ltx_2.3 |
| cinematic_broll | NO | NO | ltx_2.3 |

## Lipsync Rule — CRITICAL
ONLY apply lipsync for: ugc_testimonial, founder_talking_head
ALL other categories: narration/VO only, zero lipsync
Lipsync = 15 credits per scene. Never apply unnecessarily.
For inner_monologue specifically: avatar on screen, lips stay CLOSED, voice is internal thought.

## Duration Rules — Hard Limits
- Ideal: 20 seconds, ~44 words
- Maximum: 30 seconds, 66 words — NEVER exceed this
- Per scene: 5 seconds fixed
- Ideal scenes: 4 (20s total)
- Absolute max scenes: 6 (30s total)
- ALWAYS generate TTS audio first
- Video duration = actual TTS audio duration — never hardcode

## Checkpoint State Machine
```
INITIALIZED
→ SCRIPT_GENERATING → SCRIPT_AWAITING_APPROVAL      [Checkpoint 1 — FREE]
→ STORYBOARD_GENERATING → STORYBOARD_AWAITING_APPROVAL [Checkpoint 2 — FREE]
→ HOOK_SCENE_GENERATING → HOOK_SCENE_AWAITING_APPROVAL [Optional test]
→ IMAGES_GENERATING → IMAGES_AWAITING_APPROVAL      [Checkpoint 3 — 5cr/scene]
→ VOICE_PREVIEW_READY                               [Optional — 3cr]
→ AUDIO_GENERATING → AUDIO_APPROVED
→ VIDEO_GENERATING → LIPSYNC_APPLYING (if needed)
→ STITCHING
→ FINAL_AWAITING_APPROVAL                           [Checkpoint 4]
→ COMPLETED
```

## Scene State Machine
```
PENDING → GENERATING → AWAITING_APPROVAL
→ APPROVED or REJECTED
→ IMAGE_GENERATING → IMAGE_APPROVED
→ VIDEO_GENERATING → VIDEO_COMPLETE
At any point → FAILED (triggers credit refund + notify user)
```

## Credit Costs
```python
CREDIT_COSTS = {
    "script_generation": 0,          # FREE
    "storyboard_generation": 0,      # FREE
    "script_regeneration": 2,        # per attempt
    "storyboard_regeneration": 2,    # per attempt
    "voice_preview": 3,              # 2 lines only
    "base_image_per_scene": 5,       # per approved scene
    "base_image_regeneration": 5,    # per scene
    "video_per_scene_standard": 20,  # Kling/Seedance
    "video_per_scene_premium": 40,   # Kling Pro / LTX
    "lipsync_per_scene": 15,         # ONLY 2 categories
    "tts_full_audio": 8,
    "stitching": 5,
    "variation_same_structure": 25,
    # Failed generation → REFUND automatically
}
```

## Emotion Tagging by Category
Script generation outputs TWO versions:
1. display_script — clean text shown to user
2. tts_script — emotion-tagged version for Gemini TTS

```
ugc_testimonial:
  [conversationally, warm, like talking to a close friend]
  {hook} [short pause] {problem} {solution} {cta}

founder_talking_head:
  [with calm authority, expert tone, measured pace]
  {hook} [short pause] {credibility} {offer} {cta}

inner_monologue:
  [whispering softly, intimate internal thought, barely audible]
  {hook_thought} [short pause] {conflict} {resolution}

cinematic_narration:
  [documentary narrator, premium, measured, letting words breathe]
  {hook} [short pause] {story} {proof} {cta}

problem_solution:
  [genuine concern, relatable] {pain} [short pause]
  [relieved, like sharing a discovery] {solution} {cta}

product_demo_lifestyle + cinematic_broll:
  Use cinematic_narration template
```

## Scene-Level Regeneration Rule
- Rejected scenes regenerate individually — never restart whole pipeline
- Approved scenes are locked until user explicitly requests change
- Credits charged only for regenerated scenes
- Show credit cost before regeneration confirm

## Failure Recovery Rules
- Scene fails → mark FAILED, refund that scene's credits
- Continue all other scenes unaffected
- Notify user: "Scene X failed. 2 credits refunded. Retry or proceed without it."
- TTS fails → try Sarvam → try Edge TTS → only then mark failed
- Lipsync fails → use non-lipsync video, notify, refund lipsync credits
- Retry must be idempotent — retrying completed scene does nothing

## Language Routing
```python
GEMINI_TTS_LANGUAGES = {
    "hi": "hi-IN",      # Hindi
    "hinglish": "hi-IN", # Mixed Hindi-English (best for Instagram)
    "bn": "bn-IN",      # Bengali
    "mr": "mr-IN",      # Marathi
    "ta": "ta-IN",      # Tamil
    "te": "te-IN",      # Telugu
    "en": "en-IN",      # English Indian accent
}
SARVAM_FALLBACK = ["kn", "gu", "pa", "ml"]
```

## Voice Preview Rule
- Generate ONLY first 2 lines of tts_script
- Cost: 3 credits shown before generation
- Return: short MP3 URL + duration in seconds
- User selects voice → approves → full TTS generates at production stage

## Ad Variation Types
```python
VARIATION_TYPES = {
    "new_avatar": "Same script + scenes, different avatar face",
    "new_hook": "Same scenes 2-4, regenerate scene 1 only",
    "new_language": "Same structure, new TTS language",
}
# Cost: 25 credits per variation
# Reuses all approved assets, only regenerates what changed
```
