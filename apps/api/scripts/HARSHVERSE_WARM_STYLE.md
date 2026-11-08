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

## Gemini-reference-inspired editorial motion prototype

The founder-provided 10-second landscape video is used for **visual direction
only**. We do not copy its actual frames, voice, music, SFX or mascot pixels.

New opt-in flags:

- `--editorial-intro`: large source-faithful headline, warm layer behind the
  person if a real matte is available, small front-facing title label.
- `--person-matte-model <path>`: optional official MediaPipe selfie person
  segmentation TFLite weights, runs locally frame by frame. A YuNet face box
  is *not* a substitute. If this flag is omitted, diagnostics will truthfully
  report `foreground_only_no_person_matte`.
- `--color-grade warm_editorial`: applies to original presenter footage
  **before** typography and artwork; does not tint the buddy or illustrations.
- Warm graphics reveal nodes, arrows and props in three timed stages rather
  than switching one static slide. Warm SFX now include original typewriter
  and airy faahh accents in addition to click/pop/whoosh; speaker audio
  receives a conservative single-pass approximately −17 LUFS finish.

### Set up real behind-presenter text

Official Google MediaPipe person/background selfie model, **Apache 2.0**
according to the published model card:

- Google developer guide:
  https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter
- Model card:
  https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf
- Model binary (official):
  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

Install **locally only** (the binary is gitignored), inspect the license
and file checksum before redistributing as part of a public product:

~~~bash
mkdir -p apps/api/data/models
curl -fL --retry 3 \
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite" \
  -o apps/api/data/models/selfie_segmenter.tflite
shasum -a 256 apps/api/data/models/selfie_segmenter.tflite
~~~

Render the same original presenter video:

~~~bash
PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/render_harshverse_creative_local.py \
  --presenter "$HOME/Downloads/Test_Talking_Head_Harsh.mp4" \
  --output-dir "$HOME/Downloads/HarshVerse-Editorial-V1" \
  --style energetic \
  --visual-style harshverse_warm \
  --color-grade warm_editorial \
  --editorial-intro \
  --person-matte-model apps/api/data/models/selfie_segmenter.tflite \
  --require-openai --overwrite
~~~

To test without a model, omit the last `--person-matte-model ...`
pair; this gives only front typography and must not be marketed as
text genuinely behind the speaker.

### QA before release

- Check `editorial_title_mode`: must equal
  `subject_matte_occlusion` for genuine rear/foreground layering.
- Hair, hands and glasses may have imperfect mask edges, particularly
  under motion; inspect keyframes before claiming professional quality.
- The model URL uses the upstream `latest` alias. Production packaging
  must pin exact bytes and an approved commercial redistribution manifest.
- Intro text is chosen only from **actual recorded** word tokens; no
  fabricated narration or claims. Creative Director plans still require
  validator review.
- Compare motion at real speed, listen to SFX against speech, confirm
  approximately −17 LUFS output and zero clipping.
- These original illustrations are **2.5D** and are not equivalent to
  generative cinematic 3D footage. Motion polish is an iterative task.
