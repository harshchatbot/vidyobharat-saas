"""JACK publish step: post-pack parsing, approval gate, IG/YT flows (no network)."""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.services.jack_publish import cli, post_pack
from app.services.jack_publish import instagram as ig_mod
from app.services.jack_publish import youtube as yt_mod
from app.services.jack_publish.models import IST, PlatformState, parse_slot
from app.services.jack_publish.store import LocalStore, load_item, save_item
from app.services.jack_publish.worker import Context, process_item

FIXTURE = Path(__file__).parent / "fixtures" / "jack_publish" / "post-pack.md"
SLOT = datetime(2030, 12, 1, 19, 0, tzinfo=IST)


def test_parse_google_maps_post_pack() -> None:
    pack = post_pack.parse(FIXTURE.read_text())
    assert set(pack.ig_captions) == {"A", "B"}
    assert pack.hashtags == ["#GoogleMaps", "#TechInHindi", "#GPS", "#TechFacts", "#TheTechnologyFiction"]
    assert pack.yt_title.startswith("Google Maps ko traffic")
    assert "Sources:" in pack.yt_description and pack.yt_description.rstrip().endswith("#techinhindi")
    assert pack.yt_tags() == ["googlemaps", "gps", "techinhindi"]
    caption = pack.ig_caption("A")
    assert caption.startswith("Concert 7 baje") and caption.endswith("#TheTechnologyFiction")
    assert "traffic jam" in pack.pinned_comment


def test_parse_rejects_missing_sections() -> None:
    with pytest.raises(post_pack.PostPackError):
        post_pack.parse("## Hashtags\n#a\n")


def test_next_free_slot_is_7pm_ist() -> None:
    now = datetime(2026, 11, 27, 20, 0, tzinfo=IST)
    assert parse_slot(None, now, set()) == datetime(2026, 11, 28, 19, 0, tzinfo=IST)
    assert parse_slot(None, now, {"2026-11-28", "2026-11-29"}).day == 30
    assert parse_slot("2026-12-02 12:30", now, set()) == datetime(2026, 12, 2, 12, 30, tzinfo=IST)


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def run_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    d = tmp_path_factory.mktemp("run") / "2030-12-01-test-video"
    d.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=108x192:d=4", "-f", "lavfi",
                    "-i", "sine=d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(d / "test.mp4")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=108x192", "-frames:v", "1",
                    str(d / "cover.jpg")], check=True)
    shutil.copy(FIXTURE, d / "post-pack.md")
    return d


class FakeMeta:
    """Fake graph.instagram.com / Google endpoints; records calls."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.container_status = "FINISHED"
        self.fail_url_upload = False
        self.yt_body: dict[str, Any] = {}

    def handler(self, req: httpx.Request) -> httpx.Response:
        url, path = str(req.url), req.url.path
        form = dict(httpx.QueryParams(req.content.decode())) if req.method == "POST" and req.headers.get(
            "content-type", "").startswith("application/x-www-form") else {}
        self.calls.append((req.method, path, form))
        if path.endswith("/media") and req.method == "POST":
            if "video_url" in form and self.fail_url_upload:
                return httpx.Response(400, json={"error": {"code": 9004, "message": "media fetch failed"}})
            if form.get("upload_type") == "resumable":
                return httpx.Response(200, json={"id": "C2", "uri": "https://rupload.facebook.com/ig-api-upload/v21.0/C2"})
            return httpx.Response(200, json={"id": "C1"})
        if "rupload.facebook.com" in url:
            return httpx.Response(200, json={"success": True})
        if path.endswith("/media_publish"):
            return httpx.Response(200, json={"id": "M1"})
        if req.method == "GET" and path.split("/")[-1] in ("C1", "C2"):
            return httpx.Response(200, json={"status_code": self.container_status, "status": ""})
        if path.endswith("/M1") and req.method == "GET":
            return httpx.Response(200, json={"permalink": "https://www.instagram.com/reel/abc/"})
        if path.endswith("/comments"):
            return httpx.Response(200, json={"id": "K1"})
        if "oauth2.googleapis.com/token" in url:
            return httpx.Response(200, json={"access_token": "ya29"})
        if "upload/youtube/v3/videos" in url and req.method == "POST":
            self.yt_body = json.loads(req.content)
            return httpx.Response(200, headers={"Location": "https://upload.example/session1"})
        if url.startswith("https://upload.example/session1"):
            return httpx.Response(200, json={"id": "YT1"})
        if "thumbnails/set" in url:
            return httpx.Response(403, text="channel not verified")
        return httpx.Response(404, json={"error": {"message": "unexpected " + url}})

    def paths(self) -> list[str]:
        return [p for _, p, _ in self.calls]


async def _queue(run_dir: Path, store: LocalStore, approve: bool = True) -> str:
    args = cli.build_parser().parse_args(["queue", str(run_dir), "--slot", "2030-12-01 19:00"])
    await cli.cmd_queue(args, store)
    item_id = (await store.list_ids())[0]
    if approve:
        await cli.cmd_approve(cli.build_parser().parse_args(["approve", item_id, "--by", "mkumar"]), store)
    return item_id


def _ctx(store: LocalStore, fake: FakeMeta, tmp: Path, enabled: bool = True,
         events: list[str] | None = None) -> Context:
    http = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    ig = ig_mod.InstagramClient(ig_mod.IGConfig("1784", "tok"), http)
    yt = yt_mod.YouTubeClient(yt_mod.YTConfig("cid", "sec", "refresh"), http)

    async def notify(event: str, item: Any, detail: str) -> None:
        (events if events is not None else []).append(event)
    return Context(store, ig, yt, enabled, tmp, notify)


def test_full_flow(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q", base_url="https://media.example/q")
        item_id = await _queue(run_dir, store, approve=False)
        fake, events = FakeMeta(), list[str]()
        ctx = _ctx(store, fake, tmp_path, events=events)
        item = await load_item(store, item_id)
        assert item and item.status == "awaiting_approval"
        assert not await process_item(ctx, item, SLOT - timedelta(hours=5))  # unapproved: nothing happens
        assert fake.calls == []

        await cli.cmd_approve(cli.build_parser().parse_args(["approve", item_id, "--by", "mkumar"]), store)
        item = await load_item(store, item_id)
        assert item
        # 5 h before: YouTube uploads with publishAt = slot; Instagram waits.
        assert await process_item(ctx, item, SLOT - timedelta(hours=5))
        status = fake.yt_body["status"]
        assert status["privacyStatus"] == "private" and status["publishAt"] == "2030-12-01T13:30:00Z"
        assert status["selfDeclaredMadeForKids"] is False and status["containsSyntheticMedia"] is False
        assert item.youtube.state == PlatformState.SCHEDULED and item.youtube.remote_id == "YT1"
        assert item.instagram.state == PlatformState.PENDING
        assert not any(p.endswith("/media") for p in fake.paths())

        # 10 min before: container created from the public URL with the custom cover.
        await process_item(ctx, item, SLOT - timedelta(minutes=10))
        create = next(f for m, p, f in fake.calls if p.endswith("/media"))
        assert create["media_type"] == "REELS" and create["video_url"].endswith("/video.mp4")
        assert create["cover_url"].endswith("/cover.jpg") and create["caption"] == item.ig_caption
        assert item.instagram.state == PlatformState.PROCESSING

        # Container finished early: still waits for the slot.
        await process_item(ctx, item, SLOT - timedelta(minutes=5))
        assert not any(p.endswith("/media_publish") for p in fake.paths())

        await process_item(ctx, item, SLOT + timedelta(seconds=30))
        assert item.instagram.state == PlatformState.PUBLISHED and item.instagram.url.endswith("/reel/abc/")
        assert any(p.endswith("/M1/comments") for p in fake.paths())
        assert item.status == "done"
        assert events == ["youtube_scheduled", "instagram_published"]
        await save_item(store, item)
    asyncio.run(go())


def test_dry_run_calls_nothing(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q", base_url="https://media.example/q")
        item = await load_item(store, await _queue(run_dir, store))
        assert item
        fake = FakeMeta()
        ctx = _ctx(store, fake, tmp_path, enabled=False)
        await process_item(ctx, item, SLOT - timedelta(minutes=10))
        assert fake.calls == []
        assert item.youtube.last_error["error"] == "dry_run" and item.instagram.last_error["error"] == "dry_run"
    asyncio.run(go())


def test_url_upload_failure_falls_back_to_resumable(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q", base_url="https://media.example/q")
        item = await load_item(store, await _queue(run_dir, store))
        assert item
        fake = FakeMeta()
        fake.fail_url_upload = True
        await process_item(_ctx(store, fake, tmp_path), item, SLOT - timedelta(minutes=10))
        assert item.instagram.container_id == "C2" and item.instagram.upload_mode == "resumable"
        assert any("rupload" in p or p.endswith("/C2") for p in fake.paths())
    asyncio.run(go())


def test_edit_after_approval_clears_it(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q")
        item = await load_item(store, await _queue(run_dir, store))
        assert item
        item.ig_caption += " edited"
        fake, events = FakeMeta(), list[str]()
        assert await process_item(_ctx(store, fake, tmp_path, events=events), item, SLOT - timedelta(minutes=10))
        assert item.status == "awaiting_approval" and item.approval is None
        assert fake.calls == [] and events == ["needs_approval"]
    asyncio.run(go())


def test_never_posts_late(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q")
        item = await load_item(store, await _queue(run_dir, store))
        assert item
        fake = FakeMeta()
        await process_item(_ctx(store, fake, tmp_path), item, SLOT + timedelta(hours=4))
        assert item.instagram.state == PlatformState.FAILED and item.youtube.state == PlatformState.FAILED
        assert fake.calls == [] and item.status == "failed"
    asyncio.run(go())


def test_no_double_publish_after_crash(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q")
        item = await load_item(store, await _queue(run_dir, store))
        assert item
        item.instagram.state, item.instagram.container_id = PlatformState.PROCESSING, "C1"
        item.instagram.container_created_at = (SLOT - timedelta(minutes=10)).isoformat()
        fake = FakeMeta()
        fake.container_status = "PUBLISHED"
        await process_item(_ctx(store, fake, tmp_path), item, SLOT + timedelta(minutes=1))
        assert item.instagram.state == PlatformState.PUBLISHED
        assert not any(p.endswith("/media_publish") for p in fake.paths())
    asyncio.run(go())


def test_blocked_and_taken_dates(run_dir: Path, tmp_path: Path) -> None:
    async def go() -> None:
        store = LocalStore(tmp_path / "q")
        await cli.cmd_block(cli.build_parser().parse_args(["block", "2030-12-01", "--note", "manual"]), store)
        with pytest.raises(SystemExit, match="blocked"):
            await _queue(run_dir, store, approve=False)
    asyncio.run(go())


def test_validate_video_rejects_landscape_and_long() -> None:
    probs = cli.validate_video({"duration": 200, "width": 1920, "height": 1080, "vcodec": "h264", "acodec": "aac"})
    assert any("vertical" in p for p in probs) and any("Shorts" in p for p in probs)
