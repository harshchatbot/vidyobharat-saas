"""Publish worker: runs on the prod server, every minute.

    python -m app.services.jack_publish.worker            # loop
    python -m app.services.jack_publish.worker --once     # one pass (cron / debugging)

Per approved item:
  YouTube    uploaded as soon as it is approved, private + publishAt = slot.
  Instagram  container created 15 min before the slot, published at the slot.

Safety rails: nothing runs unless JACK_PUBLISH_ENABLED=1 (otherwise it logs what
it would do); an item must carry an approval whose content hash still matches;
an item more than 3 h past its slot is marked failed instead of posting late;
max 3 attempts per platform, then FAILED + notification.
"""
from __future__ import annotations

import argparse
import asyncio
import fcntl
import logging
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from . import instagram as ig_mod
from . import youtube as yt_mod
from .models import PlatformState as PS
from .models import PlatformStatus, QueueItem, error, sha256_file
from .store import Store, load_item, open_store, save_item

logger = logging.getLogger("jack_publish")

IG_PREPARE_LEAD = timedelta(minutes=15)
IG_CONTAINER_TIMEOUT = timedelta(minutes=30)
YT_MIN_LEAD = timedelta(minutes=20)
LATE_LIMIT = timedelta(hours=3)
MAX_ATTEMPTS = 3
POLL_SECONDS = 60
TERMINAL = {PS.PUBLISHED, PS.SCHEDULED, PS.SKIPPED, PS.FAILED}

Notify = Callable[[str, QueueItem, str], Awaitable[None]]


async def _no_notify(event: str, item: QueueItem, detail: str) -> None:
    return None


@dataclass
class Context:
    store: Store
    ig: ig_mod.InstagramClient | None
    yt: yt_mod.YouTubeClient | None
    enabled: bool
    workdir: Path
    notify: Notify = _no_notify
    _videos: dict[str, Path] = field(default_factory=dict)

    async def local_video(self, item: QueueItem) -> Path:
        if item.id not in self._videos:
            dest = await self.store.download(f"{item.id}/video.mp4", self.workdir / f"{item.id}.mp4")
            if sha256_file(dest) != item.video_sha256:
                raise RuntimeError("video in the queue does not match the approved file")
            self._videos[item.id] = dest
        return self._videos[item.id]

    async def local_cover(self, item: QueueItem) -> Path:
        return await self.store.download(f"{item.id}/cover.jpg", self.workdir / f"{item.id}.jpg")


def _stamp(st: PlatformStatus, now: datetime) -> None:
    st.updated_at = now.isoformat()


def _dry_run(item: QueueItem, st: PlatformStatus, what: str, now: datetime) -> None:
    if st.last_error.get("error") != "dry_run":
        item.note(f"DRY RUN: would {what} (set JACK_PUBLISH_ENABLED=1 to post)", now)
        st.last_error = error("dry_run", f"would {what}", True, "set JACK_PUBLISH_ENABLED=1")
        _stamp(st, now)


async def _fail_or_retry(ctx: Context, item: QueueItem, st: PlatformStatus, platform: str, exc: Exception,
                         now: datetime) -> None:
    st.attempts += 1
    recoverable = bool(getattr(exc, "recoverable", True)) and st.attempts < MAX_ATTEMPTS
    st.last_error = error(f"{platform}_publish_failed", str(exc)[:500], recoverable,
                          "worker retries next minute" if recoverable else "fix the cause, then run `cli retry`")
    _stamp(st, now)
    item.note(f"{platform} attempt {st.attempts} failed: {str(exc)[:160]}", now)
    if not recoverable:
        st.state = PS.FAILED
        await ctx.notify("failed", item, f"{platform}: {exc}")


async def step_youtube(ctx: Context, item: QueueItem, now: datetime) -> None:
    st = item.youtube
    if st.state != PS.PENDING:
        return
    if now > item.slot_dt + LATE_LIMIT:
        st.state, st.last_error = PS.FAILED, error("missed_slot", "slot passed before upload", False, "re-queue")
        await ctx.notify("failed", item, "youtube: missed slot")
        return
    if ctx.yt is None:
        if st.last_error.get("error") != "not_configured":
            st.last_error = error("not_configured", "YouTube sign-in not set up on the server", True,
                                  "run `cli youtube-auth` on the server")
            item.note("YouTube not configured; waiting", now)
        return
    publish_at = max(item.slot_dt, now + YT_MIN_LEAD)
    if not ctx.enabled:
        _dry_run(item, st, f"upload YouTube Short private, publishAt {publish_at.isoformat()}", now)
        return
    try:
        video = await ctx.local_video(item)
        vid = await ctx.yt.upload(video, item.yt_title, item.yt_description, item.yt_tags, publish_at)
        st.remote_id, st.url, st.state, st.last_error = vid, f"https://youtube.com/shorts/{vid}", PS.SCHEDULED, {}
        _stamp(st, now)
        item.note(f"YouTube uploaded {vid}, goes public {publish_at.isoformat()}", now)
        try:
            await ctx.yt.set_thumbnail(vid, await ctx.local_cover(item))
        except Exception as exc:  # noqa: BLE001 - thumbnail is optional (needs a verified channel)
            item.note(f"YouTube thumbnail skipped: {str(exc)[:120]}", now)
        await ctx.notify("youtube_scheduled", item, st.url)
    except Exception as exc:  # noqa: BLE001
        await _fail_or_retry(ctx, item, st, "youtube", exc, now)


async def _create_container(ctx: Context, item: QueueItem, st: PlatformStatus) -> str:
    assert ctx.ig is not None
    ttl = timedelta(hours=3)
    cover_url = await ctx.store.public_url(f"{item.id}/cover.jpg", ttl)
    thumb = None if cover_url else 1000
    # Fallback chain: public URL (IG pulls the file) -> resumable upload of the bytes.
    if st.upload_mode != "resumable":
        video_url = await ctx.store.public_url(f"{item.id}/video.mp4", ttl)
        if video_url:
            try:
                cid = await ctx.ig.create_container_from_url(video_url, item.ig_caption, cover_url, thumb)
                st.upload_mode = "url"
                return cid
            except ig_mod.InstagramError as exc:
                if not exc.recoverable:
                    raise
                item.note(f"IG url upload failed, falling back to resumable: {str(exc)[:120]}")
    cid = await ctx.ig.create_container_resumable(await ctx.local_video(item), item.ig_caption, cover_url, thumb)
    st.upload_mode = "resumable"
    return cid


async def step_instagram(ctx: Context, item: QueueItem, now: datetime) -> None:
    st = item.instagram
    if st.state in TERMINAL:
        return
    if now > item.slot_dt + LATE_LIMIT:
        st.state, st.last_error = PS.FAILED, error("missed_slot", "more than 3 h past the slot", False, "re-queue")
        await ctx.notify("failed", item, "instagram: missed slot, not posting late")
        return
    if st.state == PS.PENDING:
        if now < item.slot_dt - IG_PREPARE_LEAD:
            return
        if ctx.ig is None:
            if st.last_error.get("error") != "not_configured":
                st.last_error = error("not_configured", "Instagram token not set up on the server", True,
                                      "run `cli instagram-token` on the server")
                item.note("Instagram not configured; waiting", now)
            return
        if not ctx.enabled:
            _dry_run(item, st, f"publish Instagram Reel at {item.slot}", now)
            return
        try:
            st.container_id = await _create_container(ctx, item, st)
            st.container_created_at, st.state, st.last_error = now.isoformat(), PS.PROCESSING, {}
            _stamp(st, now)
            item.note(f"IG container {st.container_id} created ({st.upload_mode})", now)
        except Exception as exc:  # noqa: BLE001
            await _fail_or_retry(ctx, item, st, "instagram", exc, now)
        return
    if st.state == PS.PROCESSING and ctx.ig is not None:
        try:
            code, detail = await ctx.ig.container_status(st.container_id)
            if code == "PUBLISHED":  # published on a previous pass that crashed before saving
                st.state = PS.PUBLISHED
                _stamp(st, now)
                return
            if code == "FINISHED":
                if now < item.slot_dt:
                    return
                st.remote_id = await ctx.ig.publish(st.container_id)
                st.state, st.last_error = PS.PUBLISHED, {}
                _stamp(st, now)
                item.note(f"Instagram published {st.remote_id}", now)
                try:
                    st.url = await ctx.ig.permalink(st.remote_id)
                    if item.first_comment:
                        await ctx.ig.comment(st.remote_id, item.first_comment)
                except Exception as exc:  # noqa: BLE001 - post is live; extras are best-effort
                    item.note(f"IG permalink/comment skipped: {str(exc)[:120]}", now)
                await ctx.notify("instagram_published", item, st.url or st.remote_id)
                return
            age = now - datetime.fromisoformat(st.container_created_at)
            if code in ("ERROR", "EXPIRED") or age > IG_CONTAINER_TIMEOUT:
                st.state, st.container_id = PS.PENDING, ""
                st.upload_mode = "resumable"  # next try uses the other path
                raise ig_mod.InstagramError(f"container {code or 'stuck'}: {detail}")
        except Exception as exc:  # noqa: BLE001
            await _fail_or_retry(ctx, item, st, "instagram", exc, now)


async def process_item(ctx: Context, item: QueueItem, now: datetime) -> bool:
    """Advance one item. Returns True if it changed and must be saved."""
    before = item.to_json()
    if item.status in ("done", "failed", "cancelled", "awaiting_approval"):
        return False
    if not item.approval_valid():
        item.status, item.approval = "awaiting_approval", None
        item.note("content changed after approval; approval cleared", now)
        await ctx.notify("needs_approval", item, "content changed after approval")
        return True
    await step_youtube(ctx, item, now)
    await step_instagram(ctx, item, now)
    states = {item.instagram.state, item.youtube.state}
    if states <= TERMINAL:
        item.status = "failed" if PS.FAILED in states else "done"
        item.note(f"finished: instagram {item.instagram.state}, youtube {item.youtube.state}", now)
    return item.to_json() != before


# ------------------------------------------------------------------ runtime
def state_dir() -> Path:
    return Path(os.environ.get("JACK_PUBLISH_STATE_DIR", "/app/data/jack_publish"))


def webhook_notifier(http: httpx.AsyncClient) -> Notify:
    url = os.environ.get("JACK_PUBLISH_NOTIFY_URL")

    async def notify(event: str, item: QueueItem, detail: str) -> None:
        logger.warning("jack_publish %s %s %s", event, item.id, detail)
        if url:
            try:
                await http.post(url, json={"event": event, "item": item.id, "slot": item.slot, "detail": detail})
            except httpx.HTTPError:
                logger.exception("notify webhook failed")
    return notify


async def run_once(now: datetime | None = None) -> None:
    sdir = state_dir()
    sdir.mkdir(parents=True, exist_ok=True)
    with (sdir / "worker.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            logger.info("another worker pass is running")
            return
        async with httpx.AsyncClient(timeout=60) as http:
            ig_cfg, yt_cfg = ig_mod.load_config(sdir), yt_mod.load_config(sdir)
            notify = webhook_notifier(http)
            if ig_cfg:
                try:
                    if await ig_mod.refresh_token_if_due(ig_cfg, sdir, http):
                        logger.info("instagram token refreshed")
                except ig_mod.InstagramError as exc:
                    logger.error("instagram token refresh failed: %s", exc)
            store = open_store()
            with tempfile.TemporaryDirectory() as tmp:
                ctx = Context(store, ig_mod.InstagramClient(ig_cfg, http) if ig_cfg else None,
                              yt_mod.YouTubeClient(yt_cfg, http) if yt_cfg else None,
                              os.environ.get("JACK_PUBLISH_ENABLED") == "1", Path(tmp), notify)
                for item_id in await store.list_ids():
                    item = await load_item(store, item_id)
                    if item is None:
                        continue
                    try:
                        if await process_item(ctx, item, now or datetime.now(timezone.utc)):
                            await save_item(store, item)
                    except Exception:  # noqa: BLE001 - one bad item must not stop the others
                        logger.exception("jack_publish item %s crashed", item_id)
        (sdir / "heartbeat").write_text(datetime.now(timezone.utc).isoformat())


async def loop() -> None:
    while True:
        try:
            await run_once()
        except Exception:  # noqa: BLE001
            logger.exception("jack_publish pass failed")
        await asyncio.sleep(POLL_SECONDS)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("--once", action="store_true")
    a = p.parse_args(argv)
    asyncio.run(run_once() if a.once else loop())


if __name__ == "__main__":
    main()
