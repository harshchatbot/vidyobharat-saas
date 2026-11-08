# HarshVerse Phase 1 — Warm Explainer + Buddy

This is an **opt-in local prototype** built on the existing Visual Analysis V2 → Creative Director V2/V2.1 → HarshVerse pipeline. It is **not yet a premium 3D animation engine**.

## Originality

The founder's 10-second Gemini video is a visual reference, **not a source of reusable footage, music, sounds, or character pixels**. The square buddy and illustrated scenes are newly constructed with local Pillow geometry; audio cues are original procedural waveforms. Do not redistribute the reference itself. Check rights before public brand use.

## Style tokens

| Token | Hex | Use |
|---|---|---|
| Cream | #F8F3E9 | Background |
| Paper | #FFFDF8 | Cards |
| Charcoal | #30302E | Titles |
| Peach | #E7AB7E | Warmth |
| Orange | #CF8154 | Buddy and accents |
| Dusty blue | #849DB0 | Secondary data |
| Sage | #A6B6A4 | Illustration detail |
| Sunflower | #F0C976 | Occasional emphasis |

Typography: clean humanist sans (Avenir Next/Poppins-like headings, Inter/Noto Sans Devanagari captions with installed system font fallbacks). No font binaries are committed.

## Buddy identity

Original friendly square device, ivory face, orange beveled body, two expressive eyes with white highlights, short flexible legs and open arms. Current moods: curious and surprised. The same procedural character renders consistently for all scenes. Walking/pointing and full animation rigs are future tasks.

## Sound and choreography

Warm editorial with restrained motion, not noisy meme effects. Panels get a short 230ms sliding entrance. Source captions occupy a dedicated lower strip of the top illustration panel and should never be duplicated inside artwork. Presenter split is face-guided using YuNet sampling. Synthesized quiet whoosh, rounded pop and click cues are spaced at least 1.15 seconds apart, maximum four; no third-party SFX samples bundled. Preserve original narration and source timing. Deferred zoom and B-roll requests remain deferred.

## Render and test

Run from repository root:

~~~bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest -q \
  apps/api/tests/test_harshverse_warm_style.py \
  apps/api/tests/test_harshverse_local_motion_plate.py \
  apps/api/tests/test_harshverse_creative_local_runner.py

PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/render_harshverse_creative_local.py \
  --presenter "$HOME/Downloads/Test_Talking_Head_Harsh.mp4" \
  --output-dir "$HOME/Downloads/HarshVerse-Warm-V1" \
  --style energetic \
  --visual-style harshverse_warm \
  --color-grade auto \
  --require-openai \
  --overwrite

open "$HOME/Downloads/HarshVerse-Warm-V1/harshverse_creative_preview.mp4"
~~~

The previous classic renderer is still the default and should continue passing its tests. All video outputs remain review-only.

## Quality gates

1. Face visible and expressive in presenter and split scenes.
2. Captions never obscure face, buddy, graphics, or mobile safe areas.
3. Diagrams illustrate the spoken meaning, not generic filler.
4. Motion is fluid at playback speed, not just attractive in still frames.
5. Sound cues do not interfere with narration; audio continuity verified.
6. Speech timing conflicts resolved before any automatic cuts.
7. Generated art is currently **2.5D illustration**, not AI 3D video.
8. Review the actual final MP4 before declaring production quality.

Next: object-level 2.5D animation, semantic scene construction, professional transitions, and automatic frame/audio QA. Then generalize the core engine into a public CLI repo (Phase 2), and only afterward integrate the same engine into RangManch AI web (Phase 3).

## Presenter color grade (added after actual preview QA)

Use `--color-grade auto|warm_editorial|off`. In `auto`, the
`harshverse_warm` pack selects `warm_editorial` and `classic` selects
`off`. The subtle preset adds warmth in midtones, gently lifts brightness,
increases contrast (~4.5%) and saturation (~7%). The camera source is encoded
to a temporary graded copy **before** adding illustrations, mascot, and
captions, so the palette assets keep their exact authored colors. Source
audio is stream-copied. The original camera recording is not overwritten.

A/B comparison using the **same source and validated scene plan**:
pass `--color-grade off` into a separate output directory and compare with
`--color-grade warm_editorial`. If using `--require-openai` twice, model
plans can differ; prefer `--scene-plan` from a saved validated report for
controlled color-only comparisons. Strong orange skin casts are a failure.
