"""
End-to-end test for make_anything_dance recipe.

Steps:
  1. Upload character image via /uploads/direct
  2. Upload dance video via /uploads/direct
  3. Create video via /api/ai/video/create with make_anything_dance recipe
  4. Poll status until success or timeout
  5. Print final video URL

Usage:
  cd apps/api
  python test_e2e_make_anything_dance.py
"""
import sys
import os
import time
import json
import uuid
import requests

RUN_ID = uuid.uuid4().hex[:8]

BASE_URL = "http://localhost:8000"
TEST_USER_ID = "3639081c-81e6-4435-bc39-32cadc4b8276"
HEADERS = {"X-User-ID": TEST_USER_ID}

# Character image already in Firebase storage — use directly (no re-upload needed)
CHARACTER_IMAGE_URL = (
    "https://firebasestorage.googleapis.com/v0/b/rangmanch-ai-backend.firebasestorage.app"
    "/o/avatar_source%2F74c48020-e75a-485f-add9-632c9b47d731.jpeg?alt=media&token=9088162f-2281-48a6-97f8-1adf4cf1f79c"
)
DANCE_VIDEO_PATH = "/Users/harshveersinghnirwan/Downloads/Some AI animals have stolen my choreography on this song. 😅 Please support the original creator.mp4"

SEP = "=" * 60


def ok(msg):
    print(f"  ✅ {msg}")


def fail(msg):
    print(f"  ❌ {msg}")
    sys.exit(1)


def info(msg):
    print(f"  ℹ  {msg}")


def section(title):
    print(f"\n{SEP}\n  {title}\n{SEP}")


# (no local character image needed — URL is hardcoded above)


# ---------------------------------------------------------------------------
# Step 1 – Upload files
# ---------------------------------------------------------------------------
def upload_file(file_path, content_type):
    filename = os.path.basename(file_path)
    info(f"Uploading {filename} ({os.path.getsize(file_path) // 1024} KB)...")
    with open(file_path, "rb") as f:
        resp = requests.post(
            f"{BASE_URL}/uploads/direct",
            headers=HEADERS,
            files={"file": (filename, f, content_type)},
            timeout=120,
        )
    if resp.status_code not in (200, 201):
        fail(f"Upload failed [{resp.status_code}]: {resp.text[:300]}")
    data = resp.json()
    # /uploads/direct returns UploadSignResponse with public_url
    url = data.get("public_url") or data.get("url") or data.get("asset_url") or data.get("download_url")
    if not url:
        fail(f"Could not find URL in upload response: {json.dumps(data, indent=2)[:400]}")
    ok(f"Uploaded → {url[:80]}...")
    return url


# ---------------------------------------------------------------------------
# Step 2 – Create dance video
# ---------------------------------------------------------------------------
def create_dance_video(character_image_url, dance_video_url):
    payload = {
        "recipeId": "make_anything_dance",
        "inputs": {
            "character_image": character_image_url,
            "dance_video": dance_video_url,
            "keep_original_sound": "on",
            "dance_style": "Energetic",
            "character_energy": "Playful",
            "visual_style": "Realistic",
            "motion_fidelity": "Balanced",
            "character_orientation": "video",
        },
        "aspectRatio": "9:16",
        "captionsEnabled": False,
        "narrationEnabled": False,
    }
    info(f"Creating make_anything_dance video (run={RUN_ID})...")
    resp = requests.post(
        f"{BASE_URL}/api/ai/video/create",
        headers={**HEADERS, "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code not in (200, 201, 202):
        fail(f"Create failed [{resp.status_code}]: {resp.text[:500]}")
    data = resp.json()
    video_id = data.get("videoId") or data.get("video_id") or data.get("id")
    if not video_id:
        fail(f"No video_id in response: {json.dumps(data, indent=2)[:400]}")
    ok(f"Video created → ID: {video_id}")
    return video_id


# ---------------------------------------------------------------------------
# Step 3 – Poll until done
# ---------------------------------------------------------------------------
def poll_status(video_id, timeout=600):
    info(f"Polling status for {video_id} (max {timeout}s)...")
    start = time.time()
    interval = 10
    while True:
        elapsed = int(time.time() - start)
        if elapsed > timeout:
            fail(f"Timed out after {timeout}s — last status unknown")

        resp = requests.get(
            f"{BASE_URL}/api/ai/video/status/{video_id}",
            headers=HEADERS,
            timeout=15,
        )
        if resp.status_code != 200:
            fail(f"Status check failed [{resp.status_code}]: {resp.text[:200]}")

        data = resp.json()
        status = str(data.get("status") or "").lower()
        progress = data.get("progress") or data.get("progress_pct") or ""
        print(f"  [{elapsed:4d}s] {status:<12} {progress}")

        if status in ("success", "done", "completed"):
            video_url = (
                data.get("videoUrl")
                or data.get("video_url")
                or data.get("outputUrl")
                or data.get("output_url")
                or (data.get("output") or {}).get("url")
            )
            ok(f"Status: {status}")
            return status, video_url, data

        if status in ("failed", "error"):
            error = data.get("error") or data.get("message") or "unknown"
            fail(f"Video failed: {error}")

        time.sleep(interval)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"\nRun ID: {RUN_ID}")
    print(f"User  : {TEST_USER_ID}")

    # -- Step 0: verify files --
    section("Step 0 – Verify input files")
    ok(f"Character image (pre-uploaded): {CHARACTER_IMAGE_URL[:80]}...")

    if not os.path.exists(DANCE_VIDEO_PATH):
        fail(f"Dance video not found: {DANCE_VIDEO_PATH}")
    ok(f"Dance video: {os.path.basename(DANCE_VIDEO_PATH)[:60]} ({os.path.getsize(DANCE_VIDEO_PATH) // (1024*1024)} MB)")

    # -- Step 1: upload dance video --
    section("Step 1 – Upload dance video (character image already in Firebase)")
    character_image_url = CHARACTER_IMAGE_URL
    dance_video_url = upload_file(DANCE_VIDEO_PATH, "video/mp4")

    # -- Step 2: create video --
    section("Step 2 – Create make_anything_dance video")
    video_id = create_dance_video(character_image_url, dance_video_url)

    # -- Step 3: poll --
    section("Step 3 – Poll for completion")
    status, video_url, full_data = poll_status(video_id)

    # -- Step 4: results --
    section("Step 4 – Results")
    ok(f"Final status : {status}")
    if video_url:
        ok(f"Video URL    : {video_url}")
    else:
        info(f"Video URL not in response — fetching status directly...")
        resp = requests.get(
            f"{BASE_URL}/api/ai/video/status/{video_id}",
            headers=HEADERS,
            timeout=15,
        )
        info(f"Raw status response: {resp.text[:600]}")

    print(f"\n{'=' * 60}")
    print(f"  ✅ E2E test PASSED  (run={RUN_ID})")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
