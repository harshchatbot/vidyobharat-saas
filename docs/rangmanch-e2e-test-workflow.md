# RangManch End-to-End Test Workflow

This runbook gives us one repeatable path for testing:

1. Qwen-backed text features
2. avatar preview and actor testing
3. UGC actor flow
4. Studio AI chat
5. final video status and playback

It is designed for **mock-first** validation, then a shorter live-provider follow-up pass.

## 1. Mock-first local setup

Set `apps/api/.env` to a mock-friendly baseline:

```env
AI_TEXT_PROVIDER=mock
AI_VIDEO_PROVIDER=mock
QWEN_MOCK_MODE=true
LTX_MOCK_MODE=true
LTX_MOCK_SAMPLE_VIDEO_PATH=/absolute/path/to/sample.mp4
```

Start services:

```bash
cd apps/api && uvicorn app.main:app --reload --port 8000
cd apps/api && celery -A app.workers.worker.celery_app worker --loglevel=INFO
cd apps/web && npm run dev
```

Quick checks:

```bash
curl -sS http://127.0.0.1:8000/health
apps/api/venv/bin/pytest \
  apps/api/tests/test_qwen_service.py \
  apps/api/tests/test_video_provider_services.py \
  apps/api/tests/test_video_studio_ai_service.py \
  apps/api/tests/test_ugc_pipeline.py \
  apps/api/tests/test_avatar_service.py \
  apps/api/tests/test_timing_sync_service.py \
  apps/api/tests/test_emotion_service.py \
  apps/api/tests/test_audio_analysis_service.py \
  -v
```

## 2. Automated backend/API smoke flow

Use the consolidated script:

```bash
API_BASE=http://127.0.0.1:8000 \
USER_ID=qa-rangmanch-e2e \
ACTOR_ID=<existing_actor_id> \
PERSONA_ID=<existing_actor_or_avatar_id> \
apps/api/scripts/qa_rangmanch_e2e.sh
```

What it does:

- checks `/health`
- runs the focused backend test suite
- runs `POST /test-avatar` if `ACTOR_ID` is provided
- creates a `ugc_ad` video if `PERSONA_ID` is provided
- polls `/api/ai/video/status/{id}`
- runs Studio AI chat against the created video

What it verifies:

- `test-avatar` returns:
  - `video_url`
  - `timing_map`
  - `behavior_timeline`
  - `audio_reactive_timeline`
  - `voice_profile`
- UGC video status returns `pipelineMetadata` with:
  - `script_type`
  - `timing_map`
  - `behavior_timeline`
  - `audio_reactive_timeline`

## 3. Manual UI workflow

### Avatar / actor flow

1. Open the create flow in the web app.
2. Create a custom avatar or select an existing actor.
3. Generate preview.
4. Confirm:
   - preview job moves `queued -> processing -> completed`
   - preview video is visible in the saved avatar picker
   - female custom avatars only show female voices

### Studio AI text flow

Validate:

- script generate
- script enhance
- script translate
- Studio AI chat on a video page

Expected:

- replies are contextual and non-empty
- Studio AI does not fall back to repeated canned responses

### UGC actor workflow

1. Open composer.
2. Select recipe `ugc_ad`.
3. Select the saved avatar/actor as spokesperson.
4. Confirm voice options remain gender-valid.
5. Enter the prompt/topic.
6. Generate the video.
7. On the video page, verify:
   - status polling works through RangManch backend only
   - final `videoUrl` is playable
   - Studio AI chat responds from backend

## 4. Live-provider follow-up

After mock passes, switch to live text and live video:

```env
AI_TEXT_PROVIDER=hf_qwen
QWEN_MOCK_MODE=false
AI_VIDEO_PROVIDER=hf_ltx
LTX_MOCK_MODE=false
```

If you are using self-hosted LTX instead:

```env
AI_VIDEO_PROVIDER=self_hosted_ltx
LTX_MOCK_MODE=false
LTX_SELF_HOSTED_BASE_URL=http://<real-host>:<port>
```

Then re-run:

- one Studio AI chat prompt
- one avatar preview
- one `ugc_ad` render with a selected avatar

Expected:

- same product flow
- slower inference, but no frontend/provider contract changes
- final result still appears via `/api/ai/video/status/{id}`
