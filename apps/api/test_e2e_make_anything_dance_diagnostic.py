"""
Enhanced diagnostic test for make_anything_dance recipe with detailed error reporting.

This version captures full FAL API responses and provides better debugging info when
provider_failed occurs.

Usage:
  cd apps/api
  python test_e2e_make_anything_dance_diagnostic.py
"""
import sys
import os
import time
import json
import uuid
import requests
from pathlib import Path

RUN_ID = uuid.uuid4().hex[:8]

BASE_URL = "http://localhost:8000"
TEST_USER_ID = "3639081c-81e6-4435-bc39-32cadc4b8276"
HEADERS = {"X-User-ID": TEST_USER_ID}

# Character image already in Firebase storage
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


def check_video_file(file_path):
    """Validate video file before upload."""
    section("Video File Validation")

    if not os.path.exists(file_path):
        fail(f"Video file not found: {file_path}")

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    ok(f"File exists: {os.path.basename(file_path)} ({file_size_mb:.1f} MB)")

    # Check if ffprobe is available
    import subprocess
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration,size,format_name",
             "-show_streams", "-of", "json", file_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            fail(f"ffprobe failed: {result.stderr}")

        probe_data = json.loads(result.stdout)
        duration = float(probe_data.get("format", {}).get("duration", 0))
        format_name = probe_data.get("format", {}).get("format_name", "unknown")

        ok(f"Duration: {duration:.2f} seconds")
        ok(f"Format: {format_name}")

        streams = probe_data.get("streams", [])
        for i, stream in enumerate(streams):
            codec_type = stream.get("codec_type")
            codec_name = stream.get("codec_name")
            if codec_type == "video":
                width = stream.get("width")
                height = stream.get("height")
                fps = stream.get("r_frame_rate", "unknown")
                info(f"Video stream {i}: {codec_name} {width}x{height} @ {fps}")
            elif codec_type == "audio":
                channels = stream.get("channels")
                sample_rate = stream.get("sample_rate")
                info(f"Audio stream {i}: {codec_name} {channels}ch @ {sample_rate}Hz")

        # Kling motion control limitations
        info("Kling motion control requirements:")
        info("  - Video: H.264 or H.265 codec preferred")
        info("  - Resolution: 480p-1080p recommended")
        info("  - Duration: 5-40 seconds")
        info("  - Format: MP4 container preferred")

        if duration < 1 or duration > 40:
            fail(f"Video duration {duration}s is outside supported range (1-40 seconds)")

        return probe_data
    except Exception as e:
        fail(f"Could not analyze video: {e}")


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
    url = data.get("public_url") or data.get("url") or data.get("asset_url") or data.get("download_url")
    if not url:
        fail(f"Could not find URL in upload response: {json.dumps(data, indent=2)[:400]}")
    ok(f"Uploaded → {url[:80]}...")
    return url


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


def poll_status_with_details(video_id, timeout=120):  # Reduced timeout for diagnostics
    """Poll status and capture full response payload."""
    info(f"Polling status for {video_id} (max {timeout}s)...")
    start = time.time()
    interval = 5  # Poll more frequently for faster feedback
    last_payload = None

    while True:
        elapsed = int(time.time() - start)
        if elapsed > timeout:
            fail(f"Timed out after {timeout}s")

        resp = requests.get(
            f"{BASE_URL}/api/ai/video/status/{video_id}",
            headers=HEADERS,
            timeout=15,
        )
        if resp.status_code != 200:
            fail(f"Status check failed [{resp.status_code}]: {resp.text[:200]}")

        data = resp.json()
        last_payload = data
        status = str(data.get("status") or "").lower()
        progress = data.get("progress") or data.get("progress_pct") or ""
        print(f"  [{elapsed:4d}s] {status:<15} {progress}")

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

        if status in ("failed", "error", "provider_failed"):
            error_detail = data.get("error") or data.get("message") or "unknown"
            info(f"Full error payload:\n{json.dumps(data, indent=2)}")
            fail(f"Video failed with status '{status}': {error_detail}")

        time.sleep(interval)


def main():
    print(f"\nRun ID: {RUN_ID}")
    print(f"User  : {TEST_USER_ID}")

    # -- Step 0: validate files --
    section("Step 0 – Validate Input Files")
    ok(f"Character image (pre-uploaded): {CHARACTER_IMAGE_URL[:80]}...")

    if not os.path.exists(DANCE_VIDEO_PATH):
        fail(f"Dance video not found: {DANCE_VIDEO_PATH}")

    probe_data = check_video_file(DANCE_VIDEO_PATH)

    # -- Step 1: upload dance video --
    section("Step 1 – Upload dance video")
    dance_video_url = upload_file(DANCE_VIDEO_PATH, "video/mp4")

    # -- Step 2: create video --
    section("Step 2 – Create make_anything_dance video")
    character_image_url = CHARACTER_IMAGE_URL
    video_id = create_dance_video(character_image_url, dance_video_url)

    # -- Step 3: poll with diagnostics --
    section("Step 3 – Poll for completion (with diagnostics)")
    status, video_url, full_data = poll_status_with_details(video_id)

    # -- Step 4: results --
    section("Step 4 – Results")
    ok(f"Final status : {status}")
    if video_url:
        ok(f"Video URL    : {video_url}")
    else:
        info(f"Video URL not in response — full response:")
        print(json.dumps(full_data, indent=2))

    print(f"\n{'=' * 60}")
    print(f"  ✅ E2E test PASSED  (run={RUN_ID})")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
