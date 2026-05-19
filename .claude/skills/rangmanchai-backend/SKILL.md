---
name: rangmanchai-backend
description: Backend architecture patterns for RangManchAI FastAPI services. Use when creating services, API routes, Celery tasks, DB models, migrations, or pipeline logic. Triggers on: service, endpoint, route, task, worker, model, migration, repository, schema, pipeline, FastAPI, Celery, SQLAlchemy.
---

## Service Pattern
Every new service must follow this structure:
1. Class with typed dependency injection in __init__
2. async/await for ALL external API calls
3. Specific typed exceptions — never raise generic Exception
4. Logger calls at start and end of every major operation
5. Fallback chain for all AI model calls

## AI Model Fallback Chain Pattern
```python
async def call_with_fallback(self, *models):
    last_error = None
    for model in models:
        try:
            return await model.call()
        except ModelAPIError as e:
            last_error = e
            logger.warning(f"Model {model.name} failed: {e}, trying next")
            continue
    raise AllModelsFailedError(str(last_error))
```

## Credit System — Always Follow This Flow
1. CreditService.estimate() → return estimate to API response
2. Frontend shows estimate with credit cost visible
3. User clicks confirm (explicit approval required)
4. API receives confirmation → CreditService.deduct()
5. On ANY generation failure → CreditService.refund() immediately

NEVER deduct credits inside a service without prior user confirmation via API response.

## Celery Task Pattern
```python
@celery_app.task(bind=True, max_retries=3)
async def generate_scene_task(self, project_id: str, scene_id: str):
    # 1. Update scene state to GENERATING in DB at start
    # 2. Try generation with fallback chain
    # 3. On success: update state to COMPLETE, store result URL
    # 4. On failure: update state to FAILED, trigger credit refund
    #    Do NOT raise — other scenes must continue
    # 5. Never fail whole project for one scene failure
```

## New Route Pattern
- NEVER add to routes.py (already 3000+ lines)
- Create: /apps/api/app/api/routers/storyboard_routes.py
- Register in main.py: app.include_router(router, prefix="/api/storyboard")
- All new storyboard endpoints use prefix /api/storyboard/

## Error Response Format
Always return this shape:
```python
{
    "error": "snake_case_error_key",
    "message": "Human readable for frontend display",
    "recoverable": True,  # or False if unrecoverable
    "retry_action": "/api/storyboard/{id}/retry-scene" or None,
    "scene_id": "uuid" or None
}
```

## DB Model Pattern
- All new models in /apps/api/app/models/entities.py
- Required columns: id (String PK), created_at, updated_at
- Use JSON column for flexible metadata (scores, config, feedback)
- Always create Alembic migration after model changes
- Run: alembic revision --autogenerate -m "description"

## Parallel Task Pattern (Celery group + chord)
```python
from celery import group, chord

# Run scene image generation in parallel
image_tasks = group(
    generate_base_image_task.s(project_id, scene_id)
    for scene_id in approved_scene_ids
)

# Then stitch when all complete
workflow = chord(image_tasks)(stitch_final_task.s(project_id))
workflow.apply_async()
```

## TTS Routing (Gemini Flash Primary)
```python
# Primary: Gemini Flash TTS (fastest, cheapest)
GEMINI_TTS_LANGUAGES = ["hi", "bn", "mr", "ta", "te", "en"]

# Fallback 1: Sarvam (other Indian languages)
SARVAM_LANGUAGES = ["kn", "gu", "pa", "ml"]

# Fallback 2: Edge TTS (everything else)

# Select in order: Gemini → Sarvam → Edge TTS
```

## Video Model Routing
```python
VIDEO_MODEL_MAP = {
    # Avatar products (image-to-video, requires avatar)
    "product_demo_lifestyle": "seedance_v1_lite",     # Cheapest
    
    # Avatar talking head (requires face, lipsync)
    "ugc_testimonial": "kling_o3_standard",
    "founder_talking_head": "kling_o3_standard",
    
    # Avatar scenes (no lipsync)
    "problem_solution": "kling_o3_standard",
    "inner_monologue": "kling_o3_standard",
    
    # Text-to-video (no avatar needed)
    "cinematic_narration": "ltx_2.3",
    "cinematic_broll": "ltx_2.3",
}
```

## Response Format Standard
All API responses include:
```python
{
    "status": "success" | "error",
    "data": {...},  # Main payload
    "credit_estimate": {
        "credits_needed": int,
        "user_balance": int,
        "can_proceed": bool
    },
    "message": "User-friendly message"
}
```

## Key Implementation Rules
1. **Always check credits BEFORE calling FAL/Gemini**
2. **Never hardcode durations** — derive from TTS audio length
3. **Implement fallbacks for EVERY AI call** (TTS, image gen, video)
4. **Update scene state at start AND end of Celery task**
5. **Refund credits immediately on failure** (don't wait for user action)
6. **Log everything** — user_id, credits, model, duration, costs
7. **Make services async-first** — never blocking calls
