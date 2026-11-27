# Content Autopilot / Auto Edit — local-first integration status

## Product boundaries
- Public Auto Edit is the primary user workflow: upload footage, optionally provide a reference, auto-edit, preview, export.
- Private Content Autopilot is owner-only: research, script, render, QC, then **human approval of the exact manifest before scheduling**.
- Do not expose Content Autopilot in public navigation or route registration before server-side owner authorization is implemented.
- Existing avatar and storyboard pipelines remain unchanged.

## Current code (NOT end-to-end)
- `apps/api/app/services/content_autopilot/workflow.py`: pure workflow state machine with approval manifest binding and prepaid-budget check; no database, API, publisher, or background jobs.
- `apps/web/src/app/editor/ReferenceVideoPicker.tsx`: optional reference file selection/preview with validation; **not yet mounted in the existing editor** and not wired to Reference DNA. It does not claim to edit footage.

## Integration dependency
The existing Auto Edit workspace, Reference DNA services, Creative Director V2.1 and HarshVerse renderer live on `feature/video-first-auto-edit-v1`, which is substantially ahead of `main`. Audit and selectively integrate tested changes before connecting the picker. Do not overwrite or wholesale merge unrelated changes.

## Local test commands after pulling branch
```bash
git fetch origin
git switch feature/content-autopilot-v1
git pull --ff-only origin feature/content-autopilot-v1
PYTHONPATH=apps/api python -m pytest apps/api/tests/test_content_autopilot_workflow.py -q
cd apps/web && npx vitest run src/app/editor/referenceVideo.test.ts
```

No live Instagram requests, uploads, credit deductions or production deployment occur in these modules.
