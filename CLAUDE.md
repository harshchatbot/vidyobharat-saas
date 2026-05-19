# RangManchAI — Project Rules
## Stack
- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS
- Backend: FastAPI (Python 3.11), SQLAlchemy, PostgreSQL, Redis, Celery
- Storage: Firebase Storage + Firestore
- Video: FAL API (Kling O3 / Seedance v1 Lite / LTX 2.3)
- TTS: Gemini Flash TTS (primary), Sarvam (fallback), Edge TTS (fallback 2)
- Lipsync: fal-ai/sync-lipsync/v2
- Image: Gemini / Recraft / Together Flux (tiered)

## Project Structure
- Frontend: /apps/web (Next.js)
- Backend: /apps/api (FastAPI)
- New services: /apps/api/app/services/
- New Celery tasks: /apps/api/app/workers/
- New recipes: /apps/api/app/recipes/
- New routes: /apps/api/app/api/routers/ (never add to routes.py directly)
- New DB models: /apps/api/app/models/entities.py

## CRITICAL Rules — Never Violate
- NEVER modify avatar_product recipe or existing pipeline
- NEVER modify routes.py — always create new router files
- NEVER hardcode credit deduction — show estimate first, deduct after user confirms
- NEVER apply lipsync unless category lipsync_required=True
- NEVER exceed 30 second video / 66 words script — hard limits
- Audio duration drives video duration — never hardcode video length
- Always implement fallback chains for every AI model call
- New DB models always need an Alembic migration file
- Never commit API keys or secrets

## Code Style
- Python: async/await for all external calls, type hints everywhere
- TypeScript: strict mode, no any types
- Error responses must include: error key, human message, recoverable bool, retry_action
- All Celery tasks: max_retries=3, update scene state at start AND end
- On generation failure: mark scene FAILED, refund credits, never fail whole project

## Workflow
- Read existing service before creating a similar one
- Run mypy after Python changes
- Run tsc --noEmit after TypeScript changes
- Always check /apps/api/app/pipeline/ cinematic subfolder for patterns before building new pipeline logic

## Skills Available
- ui-ux-pro-max: design intelligence, auto-activates for UI work
- rangmanchai-ui: brand design system, invoke with /rangmanchai-ui
- rangmanchai-backend: backend patterns, invoke with /rangmanchai-backend
- storyboard-pipeline: pipeline business logic, invoke with /storyboard-pipeline
