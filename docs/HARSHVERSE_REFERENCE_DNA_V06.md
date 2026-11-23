# HarshVerse Reference DNA — V0.6 experimental foundation

## Goal
Add **optional reference-guided Auto Edit** without copying footage, audio, on-screen text or characters from a reference video. The reference provides *editing rhythm*, later typography and visual-language guidance, while the user's transcript remains the source of semantic truth.

## Implemented in this patch
- Read-only reference video analysis (`ffprobe` metadata and `ffmpeg` scene-change filter).
- Measured cut timestamps, shot durations, median shot length, coarse pacing classification.
- Versioned JSON output and explicit unsupported fields.
- Bounds on local file size (2 GiB), duration (10 min), scene threshold, and process timeout.
- No reference content embedded in JSON and no remote API required.
- Unit tests for parsing, timing, fail-closed inputs and output safety.

## Intentionally NOT implemented
This prototype **cannot** detect lower thirds, kinetic typography, SFX, music beats, transition categories, contextual B-roll or storytelling semantics. It **does not** alter the RangManch editor, Auto Edit, routes or Celery workers. Hard-cut detection is imperfect, especially on flashes, camera motion and fades; review the blueprint before using it.

## Design — later milestones
1. Add optional `reference_media_id` to an authenticated guest editor request with media ownership checks, size limits, and processing isolation.
2. In background workers, analyze reference into immutable `ReferenceStyleBlueprint`. Store only measurements and provenance, with media retention controls.
3. Augment the AI Creative Director input with the blueprint. **Semantic alignment wins over reference timing**; no forced cut when there is no visual rationale.
4. Map blueprint + narration to an approved `CreativeScenePlan` and HarshVerse module registry; do not execute arbitrary generated code.
5. Review visual plan in UI before applying; offer `reference_strength` low/medium/high. Show which styles can and cannot be reproduced.
6. Ensure all assets are original, user-provided with permission, or commercially licensed. Do not reuse reference music or frames by default.

## Mac local test
```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_harshverse_reference_dna.py -q
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna.py \
  --reference "$HOME/Downloads/<your-reference-video>.mp4" \
  --output /tmp/harshverse_reference_dna.json
cat /tmp/harshverse_reference_dna.json
```

## Repository references (research, not incorporated code)
- https://github.com/MEX-creator/easy-edit — analyzes pacing, transitions, captions and music patterns into style templates, uses DaVinci Resolve.
- https://github.com/suqivision/framelens-ai — structured shot and motion measurements.
- https://github.com/NSK-394/ai-video-agent — blueprint-oriented workflow and clip matching.

This implementation was written independently; no third-party source code was copied.
