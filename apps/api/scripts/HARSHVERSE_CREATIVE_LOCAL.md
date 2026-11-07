# Existing RangManch engines: local backend creative preview

This is a **backend-only integration** of existing components, not a new visual engine:

1. `editor_analysis_transcribe.transcribe_source` obtains source word timestamps using the existing local STT (requires faster-whisper installed or provide a transcript JSON).
2. `video_analysis_service.build_video_analysis_report` analyzes speech timing, pauses, face samples (YuNet ONNX if configured), and caption/zoom placement.
3. `video_creative_context.build_creative_context` builds the validated context.
4. `video_creative_director_v2` supplies a validated narrative plan: OpenAI if `OPENAI_API_KEY` is set, manually provided V2 JSON if selected, or the existing deterministic fallback.
5. `video_creative_director_v21.compile_composition_v21` creates review-only composition beats.
6. `harshverse.creative_caption_bridge` reuses `timeline_render_service._write_timed_caption_ass` for phrase captions and active-word highlighting, adding a restrained entrance.
7. FFmpeg burns captions into the continuous original video/audio and writes a review-only preview.

**No frontend changes, no Celery, no Firebase, no deployment.** The original presenter input file is never modified.

## Run with the existing video in Downloads

From the repository root:

```bash
cd ~/Downloads/vidyobharat-saas
git pull --rebase origin feature/video-first-auto-edit-v1

# Verify backend integration unit tests
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest -q \
  apps/api/tests/test_harshverse_creative_caption_bridge.py \
  apps/api/tests/test_harshverse_creative_local_runner.py

# Only if faster-whisper is missing from your existing venv:
apps/api/.venv/bin/python -m pip install faster-whisper

# Optional: specify a language-capable Whisper model.
export RANGMANCH_STT_MODEL=small

# Optional: when already configured, YuNet powers face guidance.
# export RANGMANCH_YUNET_MODEL_PATH=/absolute/path/to/face_detection_yunet.onnx

PYTHONPATH=apps/api apps/api/.venv/bin/python \
  apps/api/scripts/render_harshverse_creative_local.py \
  --presenter "$HOME/Downloads/Test_Talking_Head_Harsh.mp4" \
  --output-dir "$HOME/Downloads/HarshVerse-Creative" \
  --style energetic
```

**Outputs** in `~/Downloads/HarshVerse-Creative/`:

- `harshverse_creative_preview.mp4` — captioned video
- `visual_analysis_v2.json` — analysis evidence, including face and speech timing
- `creative_context.json` — contextual safety constraints
- `creative_director_v2.json` — narrative scene decisions
- `creative_director_v21.json` — choreography beats and unresolved media intents
- `local_preview_report.json` — precise status, provenance, skipped effects and warnings

To use the real OpenAI Creative Director, configure `OPENAI_API_KEY` in your shell (never commit the key). Otherwise the **existing deterministic fallback** is used. Existing plans can be supplied using `--scene-plan /path/to/validated_plan.json`. To reuse a vetted source transcript without STT, supply `--transcript /path/to/words.json` formatted as `{"words":[{"text":"Hello","start":0.0,"end":0.3}], "language":"en"}`.

If a previous output exists, add `--overwrite` or use a different output directory.

## Explicit limitations

- This integration renders faithful timed captions, active-word highlighting and short entrance animation; **it does not yet render V2.1 motion graphics, B-roll, LUTs, zooms or SFX**. Those decisions remain in the review JSON, never falsely labelled as produced.
- Text timing comes from the existing STT and may need human review; face samples are sparse and cannot guarantee every frame is clear.
- A premium content-aware motion-graphics pass should consume **the saved V2.1 composition**, resolve licensed/locally-generated assets, and feed them into the existing HarshVerse adapter. Do not introduce another creative-planning engine.
- A local preview is not authorization to publish or claim commercial rights to generated media.

## Procedural motion-graphic rendering (next local backend checkpoint)

The local pipeline can now render V2.1 `motion_graphic` beats with original procedural templates (`keyword_card`, `data_flow`, `human_vs_ai`, `source_stack`). It uses only source phrase text and V2.1's verified timings; no media search, licensing claims, new creative planner, or generated speech.

For local runs, the existing OpenAI Creative Director is now told that **no approved B-roll or SFX library** is available. It should prefer a meaningful procedural graphic when speech justifies one, and otherwise choose talking head. If it still requests unavailable B-roll or sounds, those remain deferred. No graphics are invented just to meet a quota.

Use the same command after pulling:

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest -q \\
  apps/api/tests/test_video_creative_director_v2.py \\
  apps/api/tests/test_harshverse_local_motion_plate.py \\
  apps/api/tests/test_harshverse_creative_local_runner.py

PYTHONPATH=apps/api apps/api/.venv/bin/python \\
  apps/api/scripts/render_harshverse_creative_local.py \\
  --presenter "$HOME/Downloads/Test_Talking_Head_Harsh.mp4" \\
  --output-dir "$HOME/Downloads/HarshVerse-Creative" \\
  --style energetic --require-openai --overwrite
```

Inspect `rendered_motion_beat_ids` vs `deferred_beat_ids` in the JSON report. This remains a **review-only prototype**: FFmpeg rendering must be exercised and visually checked on a real Mac. Captions may overlap motion on some shots; sparse YuNet or missing face samples cannot guarantee perfect safe zones. The current plates are basic geometric explainers, not polished production-quality motion design.
