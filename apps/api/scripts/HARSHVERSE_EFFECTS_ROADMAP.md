# HarshVerse Phase 1 — Video Editing Fundamentals Before 3D

**Product goal:** upload original talking-head video → content analysis and
validated edit plan → understandable, professional automatic editing →
human review of the produced video. **Experimental Blender 3D stays on
hold; do not build a separate video editor.**

## What actually renders today

| Effect | Status in the local HarshVerse pipeline | Evidence / limitations |
|---|---|---|
| Source-faithful timed captions | Already wired | Visual Analysis V2 word timestamps; review caveats remain |
| Presenter color grade | Already wired | optional warm_editorial, camera only |
| 3D text occlusion | Already wired | MediaPipe person matte; face/edge QA required |
| Voice/SFX | Already wired | preserve current optional studio setting |
| 2.5D illustrated graphic plate | Already wired | opt-in warm style; avoid generic filler |
| Camera punch-in and return | Newly implemented | validated V2.1 zoom beats, FFmpeg zoompan, face-centered, 1x–1.15x, original audio preserved |
| Whole-video visual fade in/out | Newly implemented | --visual-fade-seconds, 0–1.5s; only final picture fades; voice does not |
| Scene-to-scene dissolves/whip/wipe/match transitions | Not yet implemented | need a cut/scene-boundary transition contract and handles |
| Intentional jump cuts / filler removal | Not yet implemented | require accurate speech/silence alignment and explicit removable time ranges |
| J-cut/L-cut | Not yet implemented | require at least two picture/audio segments and transition-overlap handling |
| Paper-cut foreground | Not yet implemented | use person matte with original shadow, stroke, offset, depth, and safe text areas |
| B-roll playback | Not yet implemented in this local path | scene intent is not a licensed media file; resolve approved owned/licensed assets before use |
| Text stickers, arrows, emoji, shapes, title overlays | Partially implemented | procedural intro/caption/buddy; general effect library still needed |
| Speed ramp/freeze/reverse | Not yet implemented | require frame/timeline and audio policies |
| 3D Blender | Experimental, on hold | only revisit after fundamental editing passes quality review |

**Never claim deferred beats were rendered.** The local report now has
`rendered_camera_beat_ids` and `rendered_visual_fade_seconds`.
The remaining deferred IDs are truthful unresolved effects.

## Recommended build order

1. **Current first slice — test real camera FX and final visual fades.**
   Reuse exactly the previous source, transcript and V2 edit plan to
   compare identical footage. Do not rerun the director for A/B tests.
2. **Edit Decision List (EDL) / non-destructive timeline.** One schema with
   source media IDs, source-in/out, output-in/out, timeline tracks, approved
   effects, ease curves, and explicit overlaps. Render tests verify no
   accidental dropped syllables or frame mismatch.
3. **Intentional jump cuts and J/L transitions.** Cut only approved silence
   / filler spans from reviewed transcript. Source time mapping is
   required to remap captions and all timed assets. J/L cuts overlap
   valid neighboring clips; impossible with one continuous source track.
4. **Transitions.** Implement 150–350ms dissolve, fade-through-color,
   directional push, whip blur and paper rip with boundary/handle validation.
5. **2.5D person cutout / paper-cut.** Source person matte, layered
   outlines/shadows, motion and face-safe typography.
6. **B-roll resolver.** Start with user-owned footage and an explicit
   license/metadata manifest. Selection can be AI-assisted but ownership,
   content relevance and file checks must be deterministic.
7. **Visual quality gating.** Preview 9:16 output; check face visibility,
   captions, color matching, sound levels and zero drift.

## Render a no-3D comparison with actual zoom execution

From the repo root:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest -q \
  apps/api/tests/test_harshverse_editorial_effects.py \
  apps/api/tests/test_harshverse_creative_local_runner.py \
  apps/api/tests/test_harshverse_local_motion_plate.py

PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/render_harshverse_creative_local.py \
  --presenter "$HOME/Downloads/Test_Talking_Head_Harsh.mp4" \
  --scene-plan "$HOME/Downloads/HarshVerse-Editorial-V1/creative_director_v2.json" \
  --output-dir "$HOME/Downloads/HarshVerse-Effects-V1" \
  --style energetic \
  --visual-style harshverse_warm \
  --motion-engine illustrated \
  --color-grade warm_editorial \
  --editorial-intro \
  --person-matte-model apps/api/data/models/selfie_segmenter.tflite \
  --voice-enhance studio \
  --visual-fade-seconds 0.30 \
  --overwrite
```

The zoom is applied only when the supplied scene plan contains validated
nontrivial camera pushes. If none exist, none should be fabricated.
J/L-cuts and B-roll remain not rendered, even if the director requested them.
