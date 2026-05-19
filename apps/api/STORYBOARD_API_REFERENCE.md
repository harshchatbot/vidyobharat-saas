# Storyboard Pipeline - API Reference

Quick reference for all API endpoints.

**Base URL:** `http://localhost:8000/api/storyboard`

**Headers (all requests):**
```
Content-Type: application/json
X-User-ID: {user_id}
```

---

## Project Management

### Initialize Project
```
POST /initialize
Body: {
  "ad_category": "ugc_testimonial",
  "business_brief": "...",
  "platform": "instagram_reels",
  "language": "en",
  "tone": "emotional"
}
Response: {
  "id": "proj_abc123",
  "workflow_state": "INITIALIZED",
  "credits_estimated": 148,
  ...
}
```

### Get Project
```
GET /{project_id}
Response: {
  "id": "proj_abc123",
  "workflow_state": "SCRIPT_APPROVED",
  "display_script": "...",
  ...
}
```

### Get Credit Estimate
```
GET /{project_id}/credit-estimate?stage=image_generation
Response: {
  "stage": "image_generation",
  "estimated_credits": 25,
  "current_balance": 500,
  ...
}
```

---

## Foundation Phase (Free)

### Generate Script
```
POST /{project_id}/generate-script
Response: {
  "status": "queued",
  "task_id": "script_proj_abc123_0",
  "estimated_duration": 30
}
```

### Get Script
```
GET /{project_id}/script
Response: {
  "display_script": "...",
  "tts_script": "...",
  "word_count": 45,
  "duration_estimate": 18.0,
  "quality_score": {
    "overall": 8,
    "hook_strength": 8,
    ...
  }
}
```

### Approve Script
```
POST /{project_id}/approve-script
Body: {
  "confirmation": true
}
Response: {
  "status": "script_approved",
  "workflow_state": "SCRIPT_APPROVED"
}
```

### Regenerate Script
```
POST /{project_id}/regenerate-script
Response: {
  "status": "queued",
  "task_id": "script_proj_abc123_1"
}
```

### Generate Storyboard
```
POST /{project_id}/generate-storyboard
Body: {
  "confirmation": true
}
Response: {
  "status": "queued",
  "task_id": "storyboard_proj_abc123_0",
  "estimated_duration": 45
}
```

### Get Storyboard
```
GET /{project_id}/storyboard
Response: {
  "scenes": [
    {
      "id": "scene_1",
      "scene_number": 1,
      "state": "AWAITING_APPROVAL",
      "spoken_line": "...",
      "visual_description": "...",
      "duration_seconds": 5
    },
    ...
  ],
  "total_duration": 25,
  "quality_score": { ... }
}
```

### Approve Storyboard
```
POST /{project_id}/approve-storyboard
Body: {
  "confirmation": true
}
Response: {
  "status": "storyboard_approved",
  "workflow_state": "STORYBOARD_APPROVED"
}
```

---

## Scene Operations

### Get Scene
```
GET /{project_id}/scenes/{scene_id}
Response: {
  "id": "scene_1",
  "scene_number": 1,
  "state": "APPROVED",
  "spoken_line": "...",
  "visual_description": "...",
  "base_image_url": "https://...",
  "video_url": "https://...",
  "lipsync_video_url": "https://...",
  ...
}
```

### Approve/Reject Scene
```
POST /{project_id}/scenes/{scene_id}/approve
Body: {
  "user_approved": true,
  "user_feedback": "optional feedback"
}
Response: {
  "state": "APPROVED"
}
```

### Regenerate Scene
```
POST /{project_id}/scenes/{scene_id}/regenerate
Response: {
  "status": "queued",
  "task_id": "video_proj_abc123_scene_1_1"
}
```

---

## Production Phase (Credit-Based)

### Generate Images
```
POST /{project_id}/generate-images
Body: {
  "confirmation": true,
  "tier": "fast"  // or "pro"
}
Response: {
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

### Approve Images
```
POST /{project_id}/approve-images
Body: {
  "confirmation": true
}
Response: {
  "status": "images_approved",
  "workflow_state": "IMAGES_APPROVED"
}
```

### Get Available Voices
```
GET /{project_id}/voices?language=en
Response: {
  "language": "en",
  "voices": [
    "Alex", "Emma", "James", "Sophia", "Michael", "Olivia"
  ]
}
```

### Generate Voice Preview
```
POST /{project_id}/voice-preview
Body: {
  "voice": "Emma",
  "language_code": "en"
}
Response: {
  "audio_url": "https://storage.googleapis.com/preview.mp3",
  "duration_seconds": 4,
  "credits_deducted": 3
}
```

### Select Voice
```
POST /{project_id}/select-voice
Body: {
  "voice": "Emma",
  "language_code": "en"
}
Response: {
  "selected_voice": "Emma",
  "language": "en"
}
```

### Generate Videos
```
POST /{project_id}/generate-videos
Body: {
  "confirmation": true
}
Response: {
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

### Generate Final Video
```
POST /{project_id}/generate-final-video
Body: {
  "confirmation": true
}
Response: {
  "status": "queued",
  "task_id": "stitch_proj_abc123_0",
  "estimated_duration": 60
}
```

### Approve Final Video
```
POST /{project_id}/approve-final-video
Body: {
  "confirmation": true
}
Response: {
  "status": "completed",
  "workflow_state": "COMPLETED",
  "final_video_url": "https://storage.googleapis.com/video.mp4",
  "duration_seconds": 25,
  "quality_score": {
    "overall": 8,
    "visual_consistency": 8,
    "audio_sync": 9,
    ...
  },
  "credits_consumed": 151
}
```

---

## Advanced Operations

### Retry Failed Scenes
```
POST /{project_id}/retry-failed-scenes
Body: {
  "scene_ids": ["scene_3", "scene_5"]  // optional, defaults to all failed
}
Response: {
  "retried_count": 2,
  "success_count": 2,
  "failed_count": 0,
  "scenes": [
    {
      "scene_id": "scene_3",
      "status": "success",
      "video_url": "https://..."
    },
    ...
  ]
}
```

### Create Variation
```
POST /{project_id}/create-variation
Body: {
  "variation_type": "new_avatar",  // or "new_hook", "new_language"
  "changes": {
    "avatar_id": "new_avatar_456"
  }
}
Response: {
  "variation_id": "var_def456",
  "status": "queued",
  "estimated_credits": 100,  // only for changed parts
  "estimated_duration": 600
}
```

---

## Ad Categories

All 7 categories supported:

```
- ugc_testimonial
- founder_talking_head
- problem_solution
- product_demo_lifestyle
- inner_monologue
- cinematic_narration
- cinematic_broll
```

### Category → Video Model Routing

| Category | Model | Credits/Scene |
|----------|-------|---------------|
| ugc_testimonial | Kling O3 Standard | 15 |
| founder_talking_head | Kling O3 Standard | 15 |
| problem_solution | Kling O3 Standard | 15 |
| product_demo_lifestyle | SeeDance v1 Lite | 12 |
| inner_monologue | Kling O3 Standard | 15 |
| cinematic_narration | LTX 2.3 Image-to-Video | 20 |
| cinematic_broll | LTX 2.3 Image-to-Video | 20 |

### Lipsync Requirements

**Lipsync Required (8 credits/scene):**
- ugc_testimonial
- founder_talking_head
- problem_solution
- inner_monologue

**Lipsync NOT Required:**
- product_demo_lifestyle
- cinematic_narration
- cinematic_broll

---

## Platforms

Supported platforms:
```
- instagram_reels
- facebook_feed
- youtube_shorts
- linkedin
- tiktok
```

---

## Languages

Supported languages:
```
- en (English)
- hi (Hindi)
- hinglish (Hinglish)
- bn (Bengali)
- mr (Marathi)
- ta (Tamil)
- te (Telugu)
```

---

## Workflow States

**Project-Level Workflow:**
```
INITIALIZED
  ↓
SCRIPT_AWAITING_APPROVAL
  ↓
SCRIPT_APPROVED
  ↓
STORYBOARD_AWAITING_APPROVAL
  ↓
STORYBOARD_APPROVED
  ↓
IMAGES_AWAITING_APPROVAL
  ↓
IMAGES_APPROVED
  ↓
PRODUCTION_IN_PROGRESS
  ↓
FINAL_AWAITING_APPROVAL
  ↓
COMPLETED or FAILED
```

**Scene-Level States:**
```
PENDING
  ↓
GENERATING
  ↓
AWAITING_APPROVAL
  ↓
APPROVED
  ↓
VIDEO_GENERATING
  ↓
VIDEO_GENERATED
  ↓
LIPSYNC_APPLYING (if required)
  ↓
LIPSYNC_APPLIED
  ↓
COMPLETED or FAILED
```

---

## Error Codes

```
400 Bad Request
  - invalid_category
  - missing_required_fields
  - validation_error

401 Unauthorized
  - user_not_authenticated
  - invalid_user_id

403 Forbidden
  - insufficient_credits
  - state_transition_not_allowed

404 Not Found
  - project_not_found
  - scene_not_found

409 Conflict
  - concurrent_modification
  - state_mismatch

500 Internal Server Error
  - external_api_failure
  - database_error
  - celery_task_failed
```

---

## Common Response Envelopes

### Success Response
```json
{
  "status": "success",
  "data": { ... },
  "timestamp": "2026-05-11T10:30:00Z"
}
```

### Error Response
```json
{
  "status": "error",
  "error": "insufficient_credits",
  "message": "Insufficient credits. Required 25 but have 100.",
  "detail": { ... },
  "timestamp": "2026-05-11T10:30:00Z"
}
```

### Async Task Response
```json
{
  "status": "queued",
  "task_id": "script_proj_abc123_0",
  "estimated_duration": 30,
  "polling_url": "GET /proj_abc123",
  "polling_interval": 5
}
```

---

## Rate Limits

- 100 requests per minute per user
- 1000 requests per hour per user
- Celery task queue: 100 concurrent tasks max
- File uploads: 100MB max

---

## Testing

### Test with cURL

```bash
# Initialize
curl -X POST http://localhost:8000/api/storyboard/initialize \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{
    "ad_category": "ugc_testimonial",
    "business_brief": "Premium skincare",
    "platform": "instagram_reels",
    "language": "en",
    "tone": "emotional"
  }'

# Save project_id from response
PROJECT_ID=proj_abc123

# Generate script
curl -X POST http://localhost:8000/api/storyboard/$PROJECT_ID/generate-script \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123"

# Approve script
curl -X POST http://localhost:8000/api/storyboard/$PROJECT_ID/approve-script \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user-123" \
  -d '{"confirmation": true}'

# ... continue through workflow
```

### Test with Postman

1. Import this collection
2. Set `{{base_url}}` to `http://localhost:8000/api/storyboard`
3. Set `{{user_id}}` to `test-user-123`
4. Set `{{project_id}}` to the ID returned from initialize
5. Run requests in order (or in groups for parallel operations)

---

**Last Updated:** May 11, 2026
**Version:** 1.0
