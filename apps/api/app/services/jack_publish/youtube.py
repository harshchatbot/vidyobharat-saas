"""YouTube Shorts upload (Data API v3) with a scheduled ``publishAt``.

YouTube schedules natively: the video is uploaded as private with
``status.publishAt`` and goes public at the slot on its own.

Caveat: videos uploaded through an unaudited API project are locked private.
Until the project passes YouTube's API compliance audit, uploads still land in
Studio (useful as drafts) but will not go public on their own.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

TOKEN_URL = "https://oauth2.googleapis.com/token"
DEVICE_URL = "https://oauth2.googleapis.com/device/code"
SCOPE = "https://www.googleapis.com/auth/youtube"  # device flow allows this scope, not youtube.upload
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
CATEGORY_SCIENCE_TECH = "28"


class YouTubeError(RuntimeError):
    def __init__(self, message: str, recoverable: bool = True) -> None:
        super().__init__(message)
        self.recoverable = recoverable


@dataclass
class YTConfig:
    client_id: str
    client_secret: str
    refresh_token: str
    channel_id: str = ""
    language: str = "hi"


def token_path(state_dir: Path) -> Path:
    return state_dir / "yt_token.json"


def load_config(state_dir: Path) -> YTConfig | None:
    cid, secret = os.environ.get("JACK_YT_CLIENT_ID", ""), os.environ.get("JACK_YT_CLIENT_SECRET", "")
    p = token_path(state_dir)
    refresh = json.loads(p.read_text())["refresh_token"] if p.exists() else os.environ.get("JACK_YT_REFRESH_TOKEN", "")
    if not (cid and secret and refresh):
        return None
    return YTConfig(cid, secret, refresh, os.environ.get("JACK_YT_CHANNEL_ID", ""),
                    os.environ.get("JACK_YT_LANGUAGE", "hi"))


def _check(resp: httpx.Response, what: str) -> dict[str, Any]:
    if resp.status_code >= 400:
        text = resp.text[:400]
        recoverable = resp.status_code >= 500 or resp.status_code == 429 or "quotaExceeded" in text
        if resp.status_code in (401, 403) and "quotaExceeded" not in text:
            recoverable = False
        raise YouTubeError(f"{what} failed ({resp.status_code}): {text}", recoverable)
    data: dict[str, Any] = resp.json() if resp.content else {}
    return data


class YouTubeClient:
    def __init__(self, cfg: YTConfig, http: httpx.AsyncClient) -> None:
        self.cfg, self.http = cfg, http
        self._access: str | None = None

    async def access_token(self) -> str:
        if self._access:
            return self._access
        r = await self.http.post(TOKEN_URL, data={
            "grant_type": "refresh_token", "client_id": self.cfg.client_id,
            "client_secret": self.cfg.client_secret, "refresh_token": self.cfg.refresh_token})
        d = _check(r, "token refresh")
        self._access = str(d["access_token"])
        return self._access

    async def _h(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {await self.access_token()}"}

    async def my_channel_id(self) -> str:
        r = await self.http.get("https://www.googleapis.com/youtube/v3/channels",
                                params={"part": "id", "mine": "true"}, headers=await self._h())
        items = _check(r, "channels.list").get("items", [])
        return str(items[0]["id"]) if items else ""

    async def upload(self, video: Path, title: str, description: str, tags: list[str], publish_at: datetime) -> str:
        if self.cfg.channel_id:
            mine = await self.my_channel_id()
            if mine != self.cfg.channel_id:
                raise YouTubeError(f"token is for channel {mine or '?'}, expected {self.cfg.channel_id}", False)
        body = {
            "snippet": {"title": title, "description": description, "tags": tags[:15],
                        "categoryId": CATEGORY_SCIENCE_TECH, "defaultLanguage": self.cfg.language,
                        "defaultAudioLanguage": self.cfg.language},
            "status": {"privacyStatus": "private",
                       "publishAt": publish_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                       "selfDeclaredMadeForKids": False, "containsSyntheticMedia": False,
                       "embeddable": True},
        }
        size = video.stat().st_size
        init = await self.http.post(UPLOAD_URL, params={"uploadType": "resumable", "part": "snippet,status"},
                                    json=body, headers={**await self._h(), "X-Upload-Content-Type": "video/mp4",
                                                        "X-Upload-Content-Length": str(size)})
        _check(init, "upload init")
        location = init.headers.get("Location")
        if not location:
            raise YouTubeError("upload init returned no Location header")
        put = await self.http.put(location, content=video.read_bytes(), timeout=900,
                                  headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
        return str(_check(put, "upload")["id"])

    async def set_thumbnail(self, video_id: str, cover: Path) -> None:
        r = await self.http.post("https://www.googleapis.com/upload/youtube/v3/thumbnails/set",
                                 params={"videoId": video_id}, content=cover.read_bytes(),
                                 headers={**await self._h(), "Content-Type": "image/jpeg"})
        _check(r, "thumbnails.set")


# ------------------------------------------------------------------ one-time auth (device flow)
async def device_auth(http: httpx.AsyncClient, client_id: str, client_secret: str, state_dir: Path,
                      show: Any = print, sleep: Any = None) -> None:
    """Sign in once on any phone/laptop; the refresh token is written to the state dir, never printed."""
    import asyncio
    sleep = sleep or asyncio.sleep
    r = await http.post(DEVICE_URL, data={"client_id": client_id, "scope": SCOPE})
    d = _check(r, "device code")
    show(f"On any device open {d['verification_url']} and enter code: {d['user_code']}")
    show("Sign in with the Google account that owns the YouTube channel.")
    interval = int(d.get("interval", 5))
    for _ in range(int(d.get("expires_in", 1800)) // interval):
        await sleep(interval)
        t = await http.post(TOKEN_URL, data={"client_id": client_id, "client_secret": client_secret,
                                             "device_code": d["device_code"],
                                             "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
        body = t.json()
        if body.get("error") in ("authorization_pending", "slow_down"):
            interval += 5 if body.get("error") == "slow_down" else 0
            continue
        if "refresh_token" not in body:
            raise YouTubeError(f"sign-in failed: {body.get('error')}", False)
        state_dir.mkdir(parents=True, exist_ok=True)
        p = token_path(state_dir)
        p.write_text(json.dumps({"refresh_token": body["refresh_token"]}))
        os.chmod(p, 0o600)
        show(f"Saved YouTube sign-in to {p}")
        return
    raise YouTubeError("sign-in timed out", False)
