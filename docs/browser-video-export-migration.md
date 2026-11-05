# Rangmanch browser video export migration (draft)

## Goal
Use end-user browser compute to export video clips, imagery, text and audio where supported, while keeping the production Python guest export worker available for rollback until we prove parity. No new AWS worker.

## Current branch changes
- Added HTMLVideoElement input and canvas drawing for timeline video clips (initial pass).
- Added aspect-ratio-aware 720p/1080p export dimensions, 24/30/60 FPS settings, Standard/High MP4 bitrates.
- Export loop is paced against real time instead of requesting frames as fast as the browser allows.
- Preserved 60-second timeline guardrail, which is the current editor project maximum. The longer-video target is not yet achieved.
- Scoped a Rangmanch-branded cream/pink/lavender/yellow style to the editor; the video preview canvas stays neutral.

## Important release blockers / limitations
1. Browser MediaRecorder MP4 availability and actual codec/container compatibility vary by browser. H.264/AAC is **not guaranteed**; validate output with ffprobe. Capture stream browser behavior may not match requested 24/60 fps.
2. Video clip support is preliminary: media-element seek/start and transitions need real-device testing; this branch does not yet include source-clip audio mixing, and playback frame timing may drift. Do not claim complete parity with Python renderer.
3. Timeline audio currently starts at the beginning of export; per-item offsets and strict A/V synchronization still require work.
4. Not every effect/text animation is exportable in the browser. `supportedTimelineItems` deliberately fails for unsupported combinations.
5. The editor still fetches guest session, media and asset content from FastAPI. Browser **rendering** is not the same as a fully browser-only video editor.
6. `MAX_TIMELINE_SECONDS` is 60 and local export duration remains 60 seconds; do not advertise 2+ minute export yet.
7. Memory use rises significantly for 1080p clips. Test low-end devices and Safari (which may not support the necessary MP4 path).

## Release validation
- `cd apps/web && npm ci && npm run build && npm run test:stabilization`.
- Verify image + caption + background music export (30s and 60s).
- Verify multiple actual video clips, video transitions, audio timing, pauses, and preview/export parity.
- Check every aspect ratio with 720p and 1080p; validate recorded duration, frame rate, and audio codec with `ffprobe`.
- Test Chrome desktop, Android Chrome, and iPhone Safari with fallback messages.
- Watch export queue depth and current worker logs: stop **only the export worker**, not Rangmanch API, after all export types are handled locally and no jobs remain.
- Roll back by restarting `rangmanch-export-worker-1` if necessary.
