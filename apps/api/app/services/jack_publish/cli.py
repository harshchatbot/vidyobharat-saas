"""JACK publish CLI.

In a video thread (after QA and the post pack):
  queue RUN_DIR [--slot "2026-12-01 19:00"] [--caption A|B]   upload + show the review summary
  approve ID --by NAME                                         only after the human says OK
  status [ID] | cancel ID | retry ID [--platform instagram|youtube]
  block 2026-11-28 2026-11-29 --note "scheduled by hand"       never queue onto these dates

On the prod server (one-time setup, secrets typed there, never in chat):
  instagram-token        paste the long-lived IG token (hidden input), verified and saved
  youtube-auth           sign in to the channel's Google account with a device code
  check                  show what is configured and the IG publishing quota

Env: JACK_PUBLISH_STORE (gs://<bucket>/jack-publish or folder), see docs/jack-publish-setup.md.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from . import instagram as ig_mod
from . import post_pack
from . import youtube as yt_mod
from .models import IST, Approval, PlatformState, QueueItem, parse_slot, sha256_file
from .store import Store, blocked_dates, load_item, open_store, save_item
from .worker import state_dir

IG_MIN_S, IG_MAX_S = 3, 900
YT_SHORT_MAX_S = 180


class CliError(SystemExit):
    def __init__(self, msg: str) -> None:
        super().__init__(f"error: {msg}")


def probe(video: Path) -> dict[str, Any]:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "format=duration:stream=codec_type,codec_name,width,height",
                          "-of", "json", str(video)], capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    v: dict[str, Any] = next((s for s in data["streams"] if s["codec_type"] == "video"), {})
    a: dict[str, Any] = next((s for s in data["streams"] if s["codec_type"] == "audio"), {})
    return {"duration": float(data["format"]["duration"]), "width": v.get("width", 0), "height": v.get("height", 0),
            "vcodec": v.get("codec_name"), "acodec": a.get("codec_name")}


def validate_video(info: dict[str, Any]) -> list[str]:
    problems = []
    if not IG_MIN_S <= info["duration"] <= IG_MAX_S:
        problems.append(f"duration {info['duration']:.1f}s outside Instagram's {IG_MIN_S}-{IG_MAX_S}s")
    if info["duration"] > YT_SHORT_MAX_S:
        problems.append(f"duration {info['duration']:.1f}s is over the {YT_SHORT_MAX_S}s Shorts limit")
    if info["height"] <= info["width"]:
        problems.append(f"video is {info['width']}x{info['height']}, not vertical")
    if info["vcodec"] not in ("h264", "hevc"):
        problems.append(f"video codec {info['vcodec']} (Instagram wants H.264/HEVC)")
    if info["acodec"] not in ("aac", None):
        problems.append(f"audio codec {info['acodec']} (Instagram wants AAC)")
    return problems


def _find(run_dir: Path, pattern: str, explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    found = sorted(p for p in run_dir.glob(pattern) if p.is_file())
    if not found:
        raise CliError(f"no {pattern} in {run_dir}")
    return found[0]


def summary(item: QueueItem) -> str:
    slot = item.slot_dt.astimezone(IST).strftime("%a %d %b %Y, %I:%M %p IST")
    platforms = [p for p, st in (("Instagram Reel", item.instagram), ("YouTube Short", item.youtube))
                 if st.state != PlatformState.SKIPPED]
    lines = [f"# Ready for approval: {item.id}", "", f"**When:** {slot}", f"**Where:** {', '.join(platforms)}",
             f"**Video:** {item.duration_s:.1f}s  ·  sha {item.video_sha256[:12]}", "",
             "## Instagram caption", item.ig_caption, "", "## YouTube title", item.yt_title, "",
             "## YouTube description", item.yt_description]
    if item.first_comment:
        lines += ["", "## First comment (pin it by hand)", item.first_comment]
    lines += ["", f"Status: {item.status}" + (f", approved by {item.approval.by}" if item.approval else "")]
    return "\n".join(lines)


async def cmd_queue(a: argparse.Namespace, store: Store) -> None:
    run_dir = Path(a.run_dir)
    pack = post_pack.parse((run_dir / "post-pack.md").read_text(encoding="utf-8"))
    video, cover = _find(run_dir, "*.mp4", a.video), _find(run_dir, "cover.jpg", a.cover)
    info = probe(video)
    problems = validate_video(info)
    if problems:
        raise CliError("video not publishable: " + "; ".join(problems))
    if cover.stat().st_size > 2 * 1024 * 1024:
        print("warning: cover over 2 MB; YouTube will reject it as a thumbnail", file=sys.stderr)
    now = datetime.now(timezone.utc)
    items = [i for i in [await load_item(store, x) for x in await store.list_ids()] if i]
    blocked = await blocked_dates(store)
    taken = {i.slot_dt.astimezone(IST).date().isoformat() for i in items if i.status != "cancelled"} | set(blocked)
    slot = parse_slot(a.slot, now, taken)
    day = slot.date().isoformat()
    if slot <= now:
        raise CliError(f"slot {slot.isoformat()} is in the past")
    if day in blocked:
        raise CliError(f"{day} is blocked: {blocked[day]}")
    if day in taken and not a.allow_same_day:
        raise CliError(f"{day} already has a queued post (use --allow-same-day to add another)")
    slug = re.sub(r"[^a-z0-9]+", "-", run_dir.name.lower()).strip("-")[:48]
    item = QueueItem(
        id=f"{day}-{slug}", slot=slot.isoformat(), source_dir=str(run_dir),
        ig_caption=pack.ig_caption(a.caption), yt_title=pack.yt_title, yt_description=pack.yt_description,
        yt_tags=pack.yt_tags(), first_comment="" if a.no_comment else pack.pinned_comment,
        video_sha256=sha256_file(video), cover_sha256=sha256_file(cover), duration_s=info["duration"],
        created_at=now.isoformat())
    platforms = set(a.platforms.split(","))
    if "instagram" not in platforms:
        item.instagram.state = PlatformState.SKIPPED
    if "youtube" not in platforms:
        item.youtube.state = PlatformState.SKIPPED
    if await load_item(store, item.id):
        raise CliError(f"{item.id} already exists; cancel it first or pick another slot")
    await store.put_file(f"{item.id}/video.mp4", video, "video/mp4")
    await store.put_file(f"{item.id}/cover.jpg", cover, "image/jpeg")
    item.note(f"queued from {run_dir}", now)
    await save_item(store, item)
    print(summary(item))


async def _get(store: Store, item_id: str) -> QueueItem:
    item = await load_item(store, item_id)
    if not item:
        raise CliError(f"no item {item_id}")
    return item


async def cmd_approve(a: argparse.Namespace, store: Store) -> None:
    item = await _get(store, a.id)
    if item.status != "awaiting_approval":
        raise CliError(f"{item.id} is {item.status}, not awaiting approval")
    if item.slot_dt <= datetime.now(timezone.utc):
        raise CliError("slot already passed; re-queue with a new --slot")
    item.approval = Approval(by=a.by, at=datetime.now(timezone.utc).isoformat(), content_hash=item.content_hash(),
                             note=a.note or "")
    item.status = "approved"
    item.note(f"approved by {a.by}")
    await save_item(store, item)
    print(summary(item))


async def cmd_status(a: argparse.Namespace, store: Store) -> None:
    ids = [a.id] if a.id else await store.list_ids()
    for item_id in ids:
        item = await _get(store, item_id)
        if a.id:
            print(summary(item))
            print("\nLog:\n" + "\n".join(item.log))
            print(json.dumps({"instagram": item.instagram.__dict__, "youtube": item.youtube.__dict__}, indent=1))
        else:
            when = item.slot_dt.astimezone(IST).strftime("%d %b %H:%M")
            print(f"{item.id:44} {when} IST  {item.status:18} ig={item.instagram.state:10} yt={item.youtube.state}")


async def cmd_cancel(a: argparse.Namespace, store: Store) -> None:
    item = await _get(store, a.id)
    if item.instagram.state == PlatformState.PUBLISHED:
        raise CliError("Instagram post is already live; delete it in the app")
    item.status = "cancelled"
    item.note("cancelled" + (" (YouTube upload exists: delete it in Studio)" if item.youtube.remote_id else ""))
    await save_item(store, item)
    print(f"cancelled {item.id}" + (f"; YouTube video {item.youtube.url} still exists, delete it in Studio"
                                     if item.youtube.remote_id else ""))


async def cmd_retry(a: argparse.Namespace, store: Store) -> None:
    item = await _get(store, a.id)
    for name in ([a.platform] if a.platform else ["instagram", "youtube"]):
        st = getattr(item, name)
        if st.state == PlatformState.FAILED:
            st.state, st.attempts, st.last_error, st.container_id = PlatformState.PENDING, 0, {}, ""
    if item.status == "failed":
        item.status = "approved" if item.approval_valid() else "awaiting_approval"
    item.note("retry requested")
    await save_item(store, item)
    print(summary(item))


async def cmd_block(a: argparse.Namespace, store: Store) -> None:
    blocked = await blocked_dates(store)
    for d in a.dates:
        datetime.strptime(d, "%Y-%m-%d")
        blocked[d] = a.note
    await store.write_json("_config/blocked.json", blocked)
    print(json.dumps(blocked, indent=1))


async def cmd_instagram_token(a: argparse.Namespace) -> None:
    token = getpass.getpass("Paste the Instagram access token (hidden): ").strip()
    user_id = os.environ.get("JACK_IG_USER_ID", "")
    flavour = os.environ.get("JACK_IG_API", "instagram")
    cfg = ig_mod.IGConfig(user_id or "me", token, flavour)
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(f"{cfg.base}/me", params={"fields": "user_id,username", "access_token": token})
        me = r.json()
        if r.status_code >= 400:
            raise CliError(f"token rejected: {me}")
    found = str(me.get("user_id") or me.get("id"))
    print(f"Token works for @{me.get('username')} (IG user id {found}).")
    if user_id and user_id != found:
        print(f"warning: JACK_IG_USER_ID is {user_id}; set it to {found}", file=sys.stderr)
    ig_mod.save_token(state_dir(), token)
    print(f"Saved to {ig_mod.token_path(state_dir())}. The worker refreshes it weekly.")


async def cmd_youtube_auth(a: argparse.Namespace) -> None:
    cid, secret = os.environ.get("JACK_YT_CLIENT_ID", ""), os.environ.get("JACK_YT_CLIENT_SECRET", "")
    if not (cid and secret):
        raise CliError("set JACK_YT_CLIENT_ID and JACK_YT_CLIENT_SECRET in the server env first")
    async with httpx.AsyncClient(timeout=30) as http:
        await yt_mod.device_auth(http, cid, secret, state_dir())


async def cmd_check(a: argparse.Namespace) -> None:
    sdir = state_dir()
    print(f"publishing enabled: {os.environ.get('JACK_PUBLISH_ENABLED') == '1'}  (JACK_PUBLISH_ENABLED)")
    print(f"store: {os.environ.get('JACK_PUBLISH_STORE') or 'NOT SET'}")
    async with httpx.AsyncClient(timeout=30) as http:
        ig_cfg = ig_mod.load_config(sdir)
        if ig_cfg:
            try:
                q = await ig_mod.InstagramClient(ig_cfg, http).publishing_quota()
                print(f"instagram: ok, quota {q.get('data')}; token expires {ig_mod.token_expiry(sdir) or 'unknown'}")
            except ig_mod.InstagramError as exc:
                print(f"instagram: ERROR {exc}")
        else:
            print("instagram: not configured (JACK_IG_USER_ID + `cli instagram-token`)")
        yt_cfg = yt_mod.load_config(sdir)
        if yt_cfg:
            try:
                ch = await yt_mod.YouTubeClient(yt_cfg, http).my_channel_id()
                ok = not yt_cfg.channel_id or ch == yt_cfg.channel_id
                print(f"youtube: {'ok' if ok else 'WRONG CHANNEL'}, signed in as channel {ch}")
            except yt_mod.YouTubeError as exc:
                print(f"youtube: ERROR {exc}")
        else:
            print("youtube: not configured (JACK_YT_CLIENT_ID/SECRET + `cli youtube-auth`)")
    hb = sdir / "heartbeat"
    print(f"worker heartbeat: {hb.read_text() if hb.exists() else 'never'}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="jack_publish", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue")
    q.add_argument("run_dir")
    q.add_argument("--slot", help='IST, "YYYY-MM-DD" (7 PM) or "YYYY-MM-DD HH:MM"; default next free 7 PM')
    q.add_argument("--caption", default="A")
    q.add_argument("--platforms", default="instagram,youtube")
    q.add_argument("--video")
    q.add_argument("--cover")
    q.add_argument("--no-comment", action="store_true")
    q.add_argument("--allow-same-day", action="store_true")
    ap = sub.add_parser("approve")
    ap.add_argument("id")
    ap.add_argument("--by", required=True)
    ap.add_argument("--note")
    st = sub.add_parser("status")
    st.add_argument("id", nargs="?")
    sub.add_parser("cancel").add_argument("id")
    rt = sub.add_parser("retry")
    rt.add_argument("id")
    rt.add_argument("--platform", choices=["instagram", "youtube"])
    bl = sub.add_parser("block")
    bl.add_argument("dates", nargs="+")
    bl.add_argument("--note", default="scheduled by hand")
    for name in ("instagram-token", "youtube-auth", "check"):
        sub.add_parser(name)
    return p


async def run(argv: list[str] | None = None) -> None:
    a = build_parser().parse_args(argv)
    if a.cmd == "instagram-token":
        return await cmd_instagram_token(a)
    if a.cmd == "youtube-auth":
        return await cmd_youtube_auth(a)
    if a.cmd == "check":
        return await cmd_check(a)
    store = open_store()
    handlers = {"queue": cmd_queue, "approve": cmd_approve, "status": cmd_status, "cancel": cmd_cancel,
                "retry": cmd_retry, "block": cmd_block}
    await handlers[a.cmd](a, store)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
