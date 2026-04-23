#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
API_DIR="${ROOT_DIR}/apps/api"
API_BASE="${API_BASE:-http://127.0.0.1:8000}"
USER_ID="${USER_ID:-qa-rangmanch-e2e}"
ASPECT_RATIO="${ASPECT_RATIO:-9:16}"
UGC_PROMPT="${UGC_PROMPT:-create a short ugc ad for a hair serum that reduces frizz and feels natural on camera}"
AVATAR_SCRIPT_TEXT="${AVATAR_SCRIPT_TEXT:-Hi, I tried this recently and it actually made my routine much easier. You should check it out.}"
STUDIO_CHAT_MESSAGE="${STUDIO_CHAT_MESSAGE:-what stage is this render at and what would you improve?}"
PERSONA_ID="${PERSONA_ID:-}"
ACTOR_ID="${ACTOR_ID:-}"
RUN_TESTS="${RUN_TESTS:-1}"
RUN_TEST_AVATAR="${RUN_TEST_AVATAR:-1}"
RUN_UGC_VIDEO="${RUN_UGC_VIDEO:-1}"

run_python_json_check() {
  local mode="$1"
  local payload="$2"
  JSON_PAYLOAD="$payload" "${API_DIR}/venv/bin/python" - "$mode" <<'PY'
import json
import os
import sys

mode = sys.argv[1]
raw = os.environ.get("JSON_PAYLOAD", "").strip()
data = json.loads(raw or "{}")

if mode == "create_video":
    assert data.get("id"), "missing video id"
    assert data.get("status") == "queued", f"unexpected create status: {data.get('status')}"
    print(data["id"])
elif mode == "test_avatar":
    assert data.get("status") == "success", f"unexpected test-avatar status: {data.get('status')}"
    assert data.get("video_url"), "missing test-avatar video_url"
    assert isinstance(data.get("timing_map"), list), "missing timing_map"
    assert isinstance(data.get("behavior_timeline"), list), "missing behavior_timeline"
    assert isinstance(data.get("audio_reactive_timeline"), list), "missing audio_reactive_timeline"
    assert isinstance(data.get("voice_profile"), dict), "missing voice_profile"
    print(json.dumps({
        "video_url": data.get("video_url"),
        "timing_segments": len(data.get("timing_map") or []),
        "behavior_segments": len(data.get("behavior_timeline") or []),
        "audio_reactive_segments": len(data.get("audio_reactive_timeline") or []),
    }))
elif mode == "preview_status":
    assert data.get("status") in {"queued", "processing", "completed", "failed"}, f"unexpected preview status: {data.get('status')}"
    if data.get("status") == "completed":
        assert data.get("video_url"), "missing preview video_url"
        assert isinstance(data.get("timing_map"), list), "missing preview timing_map"
    print(json.dumps({
        "status": data.get("status"),
        "has_timing_map": isinstance(data.get("timing_map"), list),
        "has_behavior_timeline": isinstance(data.get("behavior_timeline"), list),
        "has_audio_reactive_timeline": isinstance(data.get("audio_reactive_timeline"), list),
    }))
elif mode == "video_status":
    assert data.get("status") in {"queued", "processing", "success", "failed", "provider_failed", "timed_out"}, f"unexpected video status: {data.get('status')}"
    metadata = data.get("pipelineMetadata") or {}
    print(json.dumps({
        "status": data.get("status"),
        "videoUrl": data.get("videoUrl"),
        "script_type": metadata.get("script_type"),
        "has_timing_map": isinstance(metadata.get("timing_map"), list),
        "has_behavior_timeline": isinstance(metadata.get("behavior_timeline"), list),
        "has_audio_reactive_timeline": isinstance(metadata.get("audio_reactive_timeline"), list),
    }))
elif mode == "studio_chat":
    assert data.get("reply"), "missing studio chat reply"
    assert data.get("provider"), "missing studio chat provider"
    print(json.dumps({"provider": data.get("provider"), "model": data.get("model")}))
else:
    raise AssertionError(f"unsupported mode: {mode}")
PY
}

echo "[1/6] Health check"
curl -sS "${API_BASE}/health" >/dev/null

if [[ "${RUN_TESTS}" == "1" ]]; then
  echo "[2/6] Focused backend tests"
  "${API_DIR}/venv/bin/pytest" \
    "${API_DIR}/tests/test_qwen_service.py" \
    "${API_DIR}/tests/test_video_provider_services.py" \
    "${API_DIR}/tests/test_video_studio_ai_service.py" \
    "${API_DIR}/tests/test_ugc_pipeline.py" \
    "${API_DIR}/tests/test_avatar_service.py" \
    "${API_DIR}/tests/test_timing_sync_service.py" \
    "${API_DIR}/tests/test_emotion_service.py" \
    "${API_DIR}/tests/test_audio_analysis_service.py" \
    -v
fi

if [[ "${RUN_TEST_AVATAR}" == "1" && -n "${ACTOR_ID}" ]]; then
  echo "[3/6] test-avatar for ACTOR_ID=${ACTOR_ID}"
  test_avatar_response="$(
    curl -sS -X POST "${API_BASE}/test-avatar" \
      -H 'Content-Type: application/json' \
      -H "X-User-ID: ${USER_ID}" \
      -d "{
        \"actor_id\": \"${ACTOR_ID}\",
        \"script_text\": \"${AVATAR_SCRIPT_TEXT}\"
      }"
  )"
  echo "test_avatar_response=${test_avatar_response}"
  run_python_json_check "test_avatar" "${test_avatar_response}"
fi

video_id=""
if [[ "${RUN_UGC_VIDEO}" == "1" && -n "${PERSONA_ID}" ]]; then
  echo "[4/6] Create UGC video for PERSONA_ID=${PERSONA_ID}"
  create_response="$(
    curl -sS -X POST "${API_BASE}/api/ai/video/create" \
      -H 'Content-Type: application/json' \
      -H "X-User-ID: ${USER_ID}" \
      -d "{
        \"recipeId\": \"ugc_ad\",
        \"inputs\": {\"text\": \"${UGC_PROMPT}\"},
        \"aspectRatio\": \"${ASPECT_RATIO}\",
        \"personaId\": \"${PERSONA_ID}\",
        \"useAvatarForTalkingScenes\": true
      }"
  )"
  echo "create_response=${create_response}"
  video_id="$(run_python_json_check "create_video" "${create_response}")"

  echo "[5/6] Poll video status for ${video_id}"
  for attempt in $(seq 1 90); do
    status_response="$(curl -sS -H "X-User-ID: ${USER_ID}" "${API_BASE}/api/ai/video/status/${video_id}")"
    status_summary="$(run_python_json_check "video_status" "${status_response}")"
    echo "attempt=${attempt} status_summary=${status_summary}"
    if printf '%s' "${status_response}" | rg -q '"status":"success"'; then
      break
    fi
    if printf '%s' "${status_response}" | rg -q '"status":"(failed|provider_failed|timed_out)"'; then
      echo "UGC video reached failure state" >&2
      exit 2
    fi
    sleep 5
  done
fi

if [[ -n "${video_id}" ]]; then
  echo "[6/6] Studio AI chat for video ${video_id}"
  studio_chat_response="$(
    curl -sS -X POST "${API_BASE}/api/ai/video/studio-chat" \
      -H 'Content-Type: application/json' \
      -H "X-User-ID: ${USER_ID}" \
      -d "{
        \"videoId\": \"${video_id}\",
        \"message\": \"${STUDIO_CHAT_MESSAGE}\",
        \"chatHistory\": []
      }"
  )"
  echo "studio_chat_response=${studio_chat_response}"
  run_python_json_check "studio_chat" "${studio_chat_response}"
fi

echo "qa_rangmanch_e2e_complete"
