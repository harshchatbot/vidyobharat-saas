# RangManch Production Kit V1 — implementation contract

## Permanent brand rules
- One cinematic anime-style adult presenter wearing sunglasses. Preserve facial proportions, hairstyle, shades and outfit across poses.
- Approved pose IDs: neutral, explain_left, explain_right, point, react.
- Palette and fonts are locked in `rangmanch_production_kit.py`; obtain licensed fonts and verify distribution permissions.
- Never regenerate mascot identity independently per scene. Approve a layered master with consistent pose sheets, clean transparency, and a manifest with SHA-256 and provenance.

## Reusable motion grammar
- Camera: dolly_in, three_quarter_orbit, tracking_follow, pull_back.
- Hyperframes: floating_data_card, event_pipeline.
- Typography: kinetic_emphasis, word_reveal, hero_statement.
- All camera motion must specify start/end transform, target, easing, depth map and frame boundaries. CSS transform is 2.5D, not full 3D.
- Enforce safe-area bounds, collision checks and line breaks before export.

## Audio contract
- One approved narrator voice profile with documented consent/rights.
- SFX: digital_ping, event_whoosh, soft_impact, selected from an asset registry; source may be Openverse or another licensed provider, but discovery alone is not license verification.
- Generate or record narration first. Use TTS timestamps when available, otherwise align the recorded waveform using Whisper; do not present estimated timings as verified.
- Mix narration/SFX/music with FFmpeg, measure integrated loudness, and reject silent final exports when audio is required.

## Creative Director input/output
- Input: approved storyboard, target duration, approved asset IDs, voice profile, production kit schema version.
- Output: contiguous frame-addressed shots, each with narration span, mascot pose, hyperframe, camera preset and explicit keyframes, typography cue and word timing, SFX IDs and trigger frames, and asset IDs.
- Model output is a proposal. Validate enum values, asset provenance, frame boundaries, text overflow, and alignment before rendering. No arbitrary scripts or new CSS from the model.
- Publish remains blocked until asset rights, editorial review, sound mix and video QA pass.

## Delivery milestones
1. Approve mascot layered master and 5 consistent poses; register verified assets.
2. Produce one approved voice sample, 3 licensed SFX, font packages, and registry.
3. Implement reusable 2.5D Hyperframes and camera motion presets; shot JSON drives Chromium.
4. Connect OpenAI shot planning to schema validation and approved kit IDs.
5. Connect TTS/Whisper alignment, FFmpeg audio mix, and audiovisual QA.
6. Render 7-second CDC benchmark at 540x960 preview; review composition and timing; then final 1080x1920.

## Current status
This commit establishes design tokens, permitted presets, validation and tests only.
It does not create mascot art, licensed SFX, voice files, AI direction, or cinematic renders.
Do not modify Auto Edit or production pipelines.
