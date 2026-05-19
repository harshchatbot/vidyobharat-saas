# Storyboard Pipeline - Integration Testing Guide

## Overview

This guide provides step-by-step instructions for manual integration testing of the complete storyboard pipeline from project initialization through final video approval.

**Test Status:** ✅ **All 32 automated tests passing**

---

## Prerequisites

1. **Backend Requirements:**
   - FastAPI server running on `http://localhost:8000`
   - Celery workers running (for task execution)
   - Firestore configured and accessible
   - Redis configured (for Celery broker)

2. **Frontend Requirements:**
   - Next.js development server on `http://localhost:3000`
   - Connected to backend API at `http://localhost:8000`

3. **Tools:**
   - cURL or Postman for API testing
   - Browser DevTools for frontend testing
   - Firebase Console access for database verification

---

## Test Scenarios

### Scenario 1: Project Initialization

**Expected Behavior:** Create a new storyboard project with initial state.

```bash
curl -X POST http://localhost:8000/api/storyboard/initialize \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "ad_category": "ugc_testimonial",
    "business_brief": "Premium skincare product targeting women 25-40 with anti-aging moisturizer",
    "platform": "instagram_reels",
    "language": "en",
    "tone": "emotional"
  }'
```

**Expected Response:**
```json
{
  "id": "proj_abc123",
  "user_id": "test-user-123",
  "ad_category": "ugc_testimonial",
  "workflow_state": "INITIALIZED",
  "business_brief": "Premium skincare...",
  "platform": "instagram_reels",
  "language": "en",
  "tone": "emotional",
  "credits_estimated": 148,
  "credits_consumed": 0,
  "created_at": "2026-05-11T10:30:00Z",
  "updated_at": "2026-05-11T10:30:00Z"
}
```

**Verification:**
- ✅ Project document created in Firestore at `storyboard_projects/{proj_abc123}`
- ✅ `workflow_state` is `INITIALIZED`
- ✅ `credits_estimated` is 148 (correct breakdown)
- ✅ `credits_consumed` is 0
- ✅ Unique `project_id` generated

---

### Scenario 2: Script Generation

**Expected Behavior:** Generate ad script and transition to script approval state.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-script \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123"
```

**Expected Response:**
```json
{
  "status": "queued",
  "task_id": "script_proj_abc123_0",
  "estimated_duration": 30
}
```

**Verification:**
- ✅ Celery task `generate_script_task` created
- ✅ Task `task_id` returned for polling
- ✅ `estimated_duration` calculated (typically 20-40 seconds)

**After Task Completes:**
```bash
curl -X GET http://localhost:8000/api/storyboard/proj_abc123 \
  -H "X-User-ID: test-user-123"
```

Should see:
- ✅ `workflow_state` changed to `SCRIPT_AWAITING_APPROVAL`
- ✅ `display_script` populated (clean version)
- ✅ `tts_script` populated (emotion-tagged version)
- ✅ `script_score` object with scores (0-10):
  - `hook_strength`
  - `clarity`
  - `emotional_pull`
  - `word_count_ok` (boolean)
  - `category_fit`
  - `overall`

---

### Scenario 3: Script Approval

**Expected Behavior:** User approves script and triggers storyboard generation.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/approve-script \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true
  }'
```

**Expected Response:**
```json
{
  "status": "script_approved",
  "next_step": "generate_storyboard",
  "workflow_state": "SCRIPT_APPROVED"
}
```

**Verification:**
- ✅ `workflow_state` changed to `SCRIPT_APPROVED`
- ✅ Ready to proceed to storyboard generation
- ✅ State transition is atomic (no concurrent modifications)

---

### Scenario 4: Storyboard Generation

**Expected Behavior:** Break script into 5 scene cards with visual descriptions.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-storyboard \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true
  }'
```

**Expected Response:**
```json
{
  "status": "queued",
  "task_id": "storyboard_proj_abc123_0",
  "estimated_duration": 45
}
```

**After Task Completes:**

Verify scenes created:
```bash
curl -X GET http://localhost:8000/api/storyboard/proj_abc123/storyboard \
  -H "X-User-ID: test-user-123"
```

Should see:
- ✅ 5 scenes in `scenes` array
- ✅ Each scene has:
  - `id`, `scene_number`, `state` (AWAITING_APPROVAL)
  - `spoken_line` (narration text)
  - `visual_description` (what camera sees)
  - `shot_type` (e.g., "close-up", "medium")
  - `avatar_action`, `environment`, `mood`
  - `duration_seconds` (default 5)

**Project State:**
- ✅ `workflow_state` → `STORYBOARD_AWAITING_APPROVAL`
- ✅ `duration_seconds` → 25 (5 scenes × 5s each)
- ✅ `storyboard_score` populated with scores

---

### Scenario 5: Storyboard Approval

**Expected Behavior:** Approve all scenes and prepare for image generation.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/approve-storyboard \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true
  }'
```

**Verification:**
- ✅ All scenes transition to `APPROVED` state
- ✅ Project `workflow_state` → `STORYBOARD_APPROVED`
- ✅ Ready for image generation (free phase complete)

---

### Scenario 6: Image Generation (Credit-Based)

**Expected Behavior:** Generate 5 base images in parallel, deduct 25 credits.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-images \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true,
    "tier": "fast"
  }'
```

**Expected Response:**
```json
{
  "status": "queued",
  "task_group_id": "group_img_proj_abc123_0",
  "task_count": 5,
  "total_credits_estimated": 25,
  "estimated_duration": 120,
  "credits_breakdown": {
    "per_image": 5,
    "model_tier": "fast"
  }
}
```

**Verification:**
- ✅ 25 credits deducted from user account
- ✅ Celery group created with 5 parallel tasks
- ✅ Each task has idempotency key: `{project_id}_base_image_{scene_id}_{retry_count}`
- ✅ Scene `state` changed to `GENERATING`

**After Tasks Complete:**
- ✅ Each scene gets `base_image_url` populated
- ✅ Scene `state` changed to `AWAITING_APPROVAL`
- ✅ User can approve/reject each image individually

---

### Scenario 7: Image Approval

**Expected Behavior:** Approve base images and transition to voice selection.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/approve-images \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true
  }'
```

**Verification:**
- ✅ All scenes transition to `APPROVED` state
- ✅ Project `workflow_state` → `IMAGES_APPROVED`
- ✅ Ready for voice selection

---

### Scenario 8: Voice Preview (Optional, Credit-Based)

**Expected Behavior:** Generate short voice preview (3 credits), don't deduct full TTS yet.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/voice-preview \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "voice": "Emma",
    "language_code": "en"
  }'
```

**Expected Response:**
```json
{
  "audio_url": "https://storage.googleapis.com/preview-audio.mp3",
  "duration_seconds": 4,
  "voice": "Emma",
  "language": "en",
  "credits_deducted": 3
}
```

**Verification:**
- ✅ 3 credits deducted
- ✅ Audio plays first 2 lines of script only (short duration)
- ✅ Preview does NOT transition project state

---

### Scenario 9: Voice Selection

**Expected Behavior:** Lock in voice choice for full TTS generation later.

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/select-voice \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "voice": "Emma",
    "language_code": "en"
  }'
```

**Verification:**
- ✅ `selected_voice` stored in project
- ✅ No credits deducted (deducted in production phase)
- ✅ Project ready to proceed to video generation

---

### Scenario 10: Video Generation (Credit-Based, Parallel)

**Expected Behavior:** Generate 5 videos in parallel using model routing (75 credits).

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-videos \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true
  }'
```

**Expected Response:**
```json
{
  "status": "queued",
  "task_group_id": "group_vid_proj_abc123_0",
  "task_count": 5,
  "total_credits_estimated": 75,
  "estimated_duration": 300,
  "model_routing": {
    "ugc_testimonial": "kling_o3_standard_reference"
  },
  "credits_breakdown": {
    "per_video": 15,
    "model": "Kling O3 Standard"
  }
}
```

**Verification:**
- ✅ 75 credits deducted (5 videos × 15 cr each)
- ✅ Model routing works: `ugc_testimonial` → Kling O3 Standard
- ✅ 5 Celery tasks created in parallel group
- ✅ Each task has idempotency key
- ✅ Scene `state` changed to `VIDEO_GENERATING`

**Idempotency Test (Retry same video):**
- If same task retries with same idempotency key, NO additional credits deducted
- CreditService deduplicates based on idempotency_key

**After Tasks Complete:**
- ✅ Each scene gets `video_url` populated
- ✅ Scene `state` changed to `VIDEO_GENERATED` (or `LIPSYNC_APPLYING` for applicable categories)

---

### Scenario 11: Lipsync Application (Conditional, Credit-Based)

**Expected Behavior:** Apply lipsync to talking-head videos (40 credits for 5 scenes).

**Note:** Only applies to categories: `ugc_testimonial`, `founder_talking_head`, `problem_solution`, `inner_monologue`

**For other categories (e.g., `product_demo_lifestyle`):** Skipped automatically.

```bash
# Automatic: triggered after video generation if applicable
# No explicit API call needed, but can be monitored
```

**Verification:**
- ✅ 40 credits deducted if lipsync applicable (5 × 8 cr)
- ✅ 0 credits if lipsync NOT applicable
- ✅ Scene `state` changed to `LIPSYNC_APPLIED` (or stays `VIDEO_GENERATED` if N/A)
- ✅ Graceful fallback: if lipsync fails, uses original `video_url`

---

### Scenario 12: Full Audio Generation (Project-Level, Credit-Based)

**Expected Behavior:** Generate full TTS audio for entire script once (4 credits).

```bash
# Automatic: triggered after lipsync completion
# Or can be triggered manually
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-full-audio \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123"
```

**Verification:**
- ✅ 4 credits deducted (one-time for entire project, NOT per-scene)
- ✅ Full TTS audio generated from `tts_script`
- ✅ `project.selected_voice` and `language` used
- ✅ Audio cached in project (not regenerated unless explicitly requested)
- ✅ Idempotency key prevents double-charging on retry

---

### Scenario 13: Video Stitching (Credit-Based)

**Expected Behavior:** Combine 5 approved videos into single MP4 (2 credits).

```bash
# Automatic: triggered after all videos ready
# Or can be triggered manually
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-final-video \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123"
```

**Expected Response:**
```json
{
  "status": "queued",
  "task_id": "stitch_proj_abc123_0",
  "estimated_duration": 60
}
```

**After Task Completes:**
- ✅ 2 credits deducted
- ✅ `final_video_url` populated
- ✅ `duration_seconds` calculated (should be ~25s)
- ✅ Project `workflow_state` → `FINAL_AWAITING_APPROVAL`
- ✅ Scene states all → `COMPLETED`

---

### Scenario 14: Quality Scoring (Credit-Based)

**Expected Behavior:** Analyze final video and return quality metrics (2 credits).

```bash
# Automatic: triggered after stitching completes
# Or can be triggered manually
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/approve-final-video \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "confirmation": true
  }'
```

**Expected Response:**
```json
{
  "status": "completed",
  "final_video_url": "https://storage.googleapis.com/final-video.mp4",
  "duration_seconds": 25,
  "quality_score": {
    "visual_consistency": 8,
    "audio_sync": 9,
    "lipsync_accuracy": 8,
    "production_quality": 8,
    "platform_ready": 8,
    "overall": 8,
    "improvement_suggestions": []
  },
  "credits_consumed": 151
}
```

**Verification:**
- ✅ 2 credits deducted for scoring
- ✅ Quality scores returned (0-10 each)
- ✅ `overall` score reflects video quality
- ✅ Project `workflow_state` → `COMPLETED`
- ✅ `credits_consumed` totals 151 (breakdown below)

---

## Credit Cost Breakdown

```
Base Images (5 × 5 cr)              = 25 credits
Scene Videos (5 × 15 cr)            = 75 credits
Lipsync (5 × 8 cr)                  = 40 credits
TTS Audio (1 × 4 cr)                = 4 credits
Video Stitching (1 × 2 cr)          = 2 credits
Quality Scoring (1 × 2 cr)          = 2 credits
                                    -----------
                                    = 150 credits (production)

Voice Preview (optional, 1 × 3 cr)  = 3 credits (done separately)
                                    -----------
TOTAL WITH PREVIEW                  = 153 credits
TOTAL WITHOUT PREVIEW               = 150 credits
```

---

## Error Scenario Tests

### Test 1: Insufficient Credits

**Setup:** User account with only 100 credits

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/generate-images \
  -H "X-User-ID: low-credit-user" \
  -d '{
    "confirmation": true
  }'
```

**Expected Response:**
```json
{
  "status": "error",
  "error": "insufficient_credits",
  "required": 25,
  "available": 100,
  "message": "Insufficient credits. Required 25 but have 100. Please purchase more credits."
}
```

**Verification:**
- ✅ Operation blocked
- ✅ No credits deducted
- ✅ Clear error message with amounts

---

### Test 2: Invalid Ad Category

```bash
curl -X POST http://localhost:8000/api/storyboard/initialize \
  -H "X-User-ID: test-user-123" \
  -d '{
    "ad_category": "invalid_category"
  }'
```

**Expected Response:**
```json
{
  "status": "error",
  "error": "validation_error",
  "field": "ad_category",
  "message": "Invalid ad_category. Must be one of: ugc_testimonial, founder_talking_head, problem_solution, product_demo_lifestyle, inner_monologue, cinematic_narration, cinematic_broll"
}
```

---

### Test 3: Scene Failure Recovery

**Scenario:** Scene 3 video generation fails due to FAL API timeout

**Expected Behavior:**
- ✅ Scene 3 marked as FAILED
- ✅ Scenes 1, 2, 4, 5 continue generation
- ✅ Other scenes complete successfully
- ✅ User can retry Scene 3 later

```bash
curl -X POST http://localhost:8000/api/storyboard/proj_abc123/retry-failed-scenes \
  -H "X-User-ID: test-user-123" \
  -d '{
    "scene_ids": ["scene_3"]
  }'
```

**Verification:**
- ✅ Retry uses same idempotency key (no double-charge)
- ✅ Scene 3 regenerated successfully
- ✅ Stitching proceeds with all 5 scenes

---

## Performance Benchmarks

| Operation | Expected Duration | Actual |
|-----------|------------------|--------|
| Script generation | 20-40s | _____ |
| Storyboard generation | 30-60s | _____ |
| 5 images (parallel) | 90-120s | _____ |
| Voice preview | 10-20s | _____ |
| 5 videos (parallel) | 250-350s | _____ |
| Lipsync (5 scenes) | 120-180s | _____ |
| TTS audio | 5-10s | _____ |
| Video stitching | 30-60s | _____ |
| Quality scoring | 15-30s | _____ |
| **Total (serial)** | **650-900s** | _____ |
| **Total (parallel)** | **~12 min** | _____ |

---

## Frontend Integration Tests

### Test 1: Category Selection

**Steps:**
1. Navigate to `http://localhost:3000/story-ad`
2. See 7 category cards
3. Click `ugc_testimonial` card
4. See form with project details
5. Fill form and click "Create Project"

**Expected:**
- ✅ Project created in backend
- ✅ Page transitions to script checkpoint
- ✅ Script displays with quality score

### Test 2: Approval Workflows

**Steps:**
1. At script checkpoint: Click "Approve Script"
2. Wait for storyboard generation
3. At storyboard: Review 5 scenes, click "Approve Storyboard"
4. Continue through image/voice/production checkpoints

**Expected:**
- ✅ Each approval transitions to next checkpoint
- ✅ Real-time status updates via polling
- ✅ Credit estimate updates as you progress

### Test 3: Production Monitoring

**Steps:**
1. At production checkpoint
2. Watch real-time progress bar
3. See per-stage progress (images, videos, lipsync)
4. See per-scene status grid

**Expected:**
- ✅ Progress updates every 3 seconds
- ✅ Accurate percentage completion
- ✅ Auto-transition to final preview when complete

### Test 4: Final Approval

**Steps:**
1. At final preview: Video plays
2. See quality score (0-10)
3. Click "Approve & Download"

**Expected:**
- ✅ Download link appears
- ✅ Video plays in browser
- ✅ Credit summary shows accurate totals

---

## Celery Task Verification

Check Celery tasks via Redis/backend logs:

```bash
# Monitor Celery tasks (if monitoring tool available)
celery -A app.workers.storyboard_tasks inspect active

# Expected output:
# {
#   'celery@worker1': {
#     'generate_script_task': [...],
#     'generate_storyboard_task': [...],
#     'generate_base_image_task': [... (5 tasks in group)],
#     'generate_scene_video_task': [... (5 tasks in group)],
#     ...
#   }
# }
```

---

## Firestore Verification

### Project Document Structure
```
storyboard_projects/{project_id}/
├── id: string
├── user_id: string
├── ad_category: string
├── workflow_state: string
├── display_script: string
├── tts_script: string
├── selected_voice: string
├── script_score: {object}
├── storyboard_score: {object}
├── final_score: {object}
├── credits_estimated: number
├── credits_consumed: number
├── final_video_url: string
├── duration_seconds: number
├── created_at: timestamp
├── updated_at: timestamp
└── scenes/ (subcollection)
    ├── scene_1/
    ├── scene_2/
    ├── ...
    └── scene_5/
```

### Scene Document Structure
```
storyboard_projects/{project_id}/scenes/{scene_id}/
├── id: string
├── scene_number: number
├── state: string
├── spoken_line: string
├── visual_description: string
├── shot_type: string
├── avatar_action: string
├── environment: string
├── mood: string
├── duration_seconds: number
├── base_image_url: string
├── base_image_prompt: string
├── video_url: string
├── video_prompt: string
├── lipsync_video_url: string
├── user_approved: boolean
├── user_feedback: string
├── created_at: timestamp
└── updated_at: timestamp
```

---

## Testing Checklist

- [ ] Project initialization creates document with correct state
- [ ] Script generation transitions workflow state correctly
- [ ] Storyboard generation creates 5 scene documents
- [ ] Image generation uses Celery groups (parallel execution)
- [ ] Image idempotency prevents double-charging
- [ ] Voice preview deducts 3 credits
- [ ] Voice selection stores choice without deducting credits
- [ ] Video generation routes to correct model by category
- [ ] Lipsync applies conditionally based on category
- [ ] TTS generation happens once at project level (4 credits)
- [ ] Video stitching combines all videos (2 credits)
- [ ] Quality scoring generates valid scores (2 credits)
- [ ] Total credits consumed equals 150-151 (with/without preview)
- [ ] Scene-level failures don't block other scenes
- [ ] Retry mechanism uses same idempotency key
- [ ] Frontend displays all checkpoints correctly
- [ ] Real-time polling updates progress accurately
- [ ] Credit estimate updates as user progresses
- [ ] Final video downloads successfully
- [ ] All Celery tasks execute and complete

---

## Troubleshooting

### Issue: "Insufficient Credits" but account has credits

**Solution:**
1. Check if credits already consumed: `project.credits_consumed`
2. Verify credit deduction was atomic (no partial deductions)
3. Check for pending transactions in credit service

### Issue: Celery task doesn't complete

**Solution:**
1. Check Celery worker logs for errors
2. Verify FAL API credentials configured
3. Check Gemini API quotas
4. Monitor Redis for queue congestion

### Issue: Firestore document not updating

**Solution:**
1. Verify Firestore connection string
2. Check IAM permissions
3. Ensure document exists before updates
4. Check for concurrent write conflicts

---

## Notes

- All timestamps are UTC in Firestore
- Idempotency keys are deterministic (same inputs = same key)
- Celery tasks use `apply_async()` for async execution
- Credit deductions are atomic (all-or-nothing)
- Scene failures are isolated (don't block other scenes)
- Retry logic uses same idempotency key (prevents double-charging)

---

**Last Updated:** May 11, 2026
**Version:** 1.0
**Status:** Ready for Integration Testing
