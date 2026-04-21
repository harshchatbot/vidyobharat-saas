#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8000}"
USER_ID="${USER_ID:-qa-ltx-benchmark}"
ASPECT_RATIO="${ASPECT_RATIO:-16:9}"
RECIPE_ID="${RECIPE_ID:-ltx_cinematic_montage_v1}"

create_response="$(
  curl -sS -X POST "${API_BASE}/api/ai/video/create" \
    -H 'Content-Type: application/json' \
    -H "X-User-ID: ${USER_ID}" \
    -d "{
      \"recipeId\": \"${RECIPE_ID}\",
      \"inputs\": {},
      \"aspectRatio\": \"${ASPECT_RATIO}\"
    }"
)"

echo "create_response=${create_response}"
video_id="$(printf '%s' "${create_response}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
if [[ -z "${video_id}" ]]; then
  echo "Could not parse video id from create response" >&2
  exit 1
fi

echo "polling video_id=${video_id}"
for attempt in $(seq 1 120); do
  status_response="$(curl -sS -H "X-User-ID: ${USER_ID}" "${API_BASE}/api/ai/video/status/${video_id}")"
  echo "attempt=${attempt} status_response=${status_response}"
  if printf '%s' "${status_response}" | rg -q '"status":"(success|completed)"'; then
    exit 0
  fi
  if printf '%s' "${status_response}" | rg -q '"status":"(failed|provider_failed|timed_out)"'; then
    exit 2
  fi
  sleep 5
done

echo "Timed out waiting for RangManch status to reach a terminal state" >&2
exit 3
