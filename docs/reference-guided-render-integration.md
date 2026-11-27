# Reference-guided Auto Edit: render integration contract

Status: development-only audit, no export authorization. Branch: feature/content-autopilot-v1.

## Existing implementations inspected (older feature/video-first-auto-edit-v1 branch)
- `apps/api/scripts/render_harshverse_creative_local.py`: local pipeline using transcription, Video Analysis V2, Creative Context, Creative Director V2/V2.1, caption bridge, and FFmpeg.
- `apps/api/app/services/harshverse/render_adapter.py`: FFmpeg renderer for validated V1 ScenePlan, including presenter_split using a second visual input.
- `apps/api/app/services/harshverse/composition_adapter.py`: review-only bridge from V2.1 compositions to V1 ScenePlan. Requires independently verified AnimationPlate/PreparedVisual, and never authorizes export.
- `apps/api/app/services/video_creative_director_v2.py` and `video_creative_director_v21.py`: scene specification and composition validation.

These files have **not** been copied into the active branch: their dependencies and asset verification must be audited before integration.

## Current active-branch capability
- Unified reference visual + temporal analysis.
- Advisory style blueprint.
- Review-only narration-grounded V0.14 scene proposals.
- Baseline vs guided comparison, with no automatic media effects.

## Required bridge
1. Produce validated CreativeContext from the original footage, never from reference footage.
2. Use reference blueprint as *soft preferences* when creating narrative scenes.
3. Convert selected, reviewed narrative beats to V2 scene specification; preserve full phrase coverage and timing.
4. Resolve visual assets through authenticated registry or trusted locally generated animation plates, with checksums and usage rights.
5. Compile V2.1 composition and validated V1 scene plan; never treat proposals as render authorization.
6. Render baseline and guided MP4 with identical source/audio/caption settings. Reject unresolved effects or explicitly report them as deferred.
7. Verify actual frame differences and preserve original narration, duration, caption legibility, and output integrity.

## Current limitation
The observed split-screen reference preference is currently only advisory: it does **not** automatically create a split-screen scene or provide an approved supporting visual. Rendering it without verified assets would be misleading. No MP4 has been produced by this integration.

## Acceptance criteria
- Tests for reference influence on actual scene decisions, not merely presence of a style preference string.
- Tests for missing assets, invalid timestamps, unapproved cuts, and no reference media reuse.
- Two playable MP4 files with provenance and reproducible commands.
- Human quality review before editor/public workflow is enabled.
