# HyperFrames-inspired Rangmanch motion titles

Reference: https://github.com/heygen-com/hyperframes (Apache-2.0).
These are original Rangmanch implementations inspired by architectural ideas, not copied blocks or assets.

## Included
- Three new editable motion-title templates in Video Editor > Text > Text Templates: Reveal, Pop and Float.
- Seekable numeric animation interpolation shared between DOM preview and canvas MP4 export.
- Browser MP4 now attempts to export text rotation, outline, background and the existing slide/pop/float/fade animation states.
- An allowlisted and validated motion title command builder (`motionTitleCommands.ts`) for future MCP integration.

## MCP exposure (future, not a running server)
Proposed tool `rangmanch.add_motion_title` arguments:
`{ op: "add_motion_title", preset: "motion-pop", text: "Launch day", start: 0, duration: 4 }`.
This command should be converted into an existing `add_text` EditPlan operation, checked against `calculateProjectRevision` / `applyEditPlan`, and presented for user approval before applying. Never permit arbitrary HTML/script execution from MCP.

## Boundaries
- Do not claim the Apache-2.0 license covers externally fetched media, fonts or third-party assets.
- This change adds no headless Chrome, FFmpeg worker, new packages, or backend costs.
- Preview/export parity still requires visual testing; text layout, font loading and canvas differences may remain.
- Source clip audio and MP4 encoder/browser compatibility remain blockers to retiring the AWS export worker.
