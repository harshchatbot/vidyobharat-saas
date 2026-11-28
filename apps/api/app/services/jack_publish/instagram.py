"""Instagram Reels publishing (Content Publishing API).

Two API flavours, picked by ``JACK_IG_API``:
  instagram (default)  Instagram API with Instagram Login, host graph.instagram.com.
                       60-day token, refreshed by the worker; no Facebook Page needed.
  facebook             Instagram API with Facebook Login, host graph.facebook.com
                       (Page / system-user token; no refresh).

Publishing is two steps: create a REELS container, wait until it is FINISHED,
then ``media_publish``. Containers expire after 24 h, so the worker creates the
container ~15 min before the slot and publishes at the slot.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

API_VERSION = "v21.0"


class InstagramError(RuntimeError):
    def __init__(self, message: str, recoverable: bool = True) -> None:
        super().__init__(message)
        self.recoverable = recoverable


@dataclass
class IGConfig:
    user_id: str
    token: str
    flavour: str = "instagram"

    @property
    def base(self) -> str:
        host = "graph.instagram.com" if self.flavour == "instagram" else "graph.facebook.com"
        return f"https://{host}/{API_VERSION}"


def _raise(resp: httpx.Response, what: str) -> dict[str, Any]:
    try:
        data: dict[str, Any] = resp.json()
    except ValueError:
        data = {"raw": resp.text[:300]}
    if resp.status_code >= 400 or "error" in data:
        err = data.get("error", {}) if isinstance(data.get("error"), dict) else {}
        code = err.get("code")
        # 190 = bad/expired token, 10/200 = permission: a human must fix those.
        recoverable = code not in (190, 10, 200) and resp.status_code not in (401, 403)
        raise InstagramError(f"{what} failed ({resp.status_code}, code {code}): {err.get('message') or data}", recoverable)
    return data


class InstagramClient:
    def __init__(self, cfg: IGConfig, http: httpx.AsyncClient) -> None:
        self.cfg, self.http = cfg, http

    def _p(self, **kw: Any) -> dict[str, Any]:
        return {**{k: v for k, v in kw.items() if v is not None}, "access_token": self.cfg.token}

    async def publishing_quota(self) -> dict[str, Any]:
        r = await self.http.get(f"{self.cfg.base}/{self.cfg.user_id}/content_publishing_limit",
                                params=self._p(fields="quota_usage,config"))
        return _raise(r, "content_publishing_limit")

    async def create_container_from_url(self, video_url: str, caption: str, cover_url: str | None,
                                        thumb_offset_ms: int | None) -> str:
        r = await self.http.post(f"{self.cfg.base}/{self.cfg.user_id}/media", data=self._p(
            media_type="REELS", video_url=video_url, caption=caption, share_to_feed="true",
            cover_url=cover_url, thumb_offset=None if cover_url else thumb_offset_ms))
        return str(_raise(r, "create container (url)")["id"])

    async def create_container_resumable(self, video: Path, caption: str, cover_url: str | None,
                                         thumb_offset_ms: int | None) -> str:
        r = await self.http.post(f"{self.cfg.base}/{self.cfg.user_id}/media", data=self._p(
            media_type="REELS", upload_type="resumable", caption=caption, share_to_feed="true",
            cover_url=cover_url, thumb_offset=None if cover_url else thumb_offset_ms))
        data = _raise(r, "create container (resumable)")
        cid = str(data["id"])
        uri = data.get("uri") or f"https://rupload.facebook.com/ig-api-upload/{API_VERSION}/{cid}"
        size = video.stat().st_size
        up = await self.http.post(uri, content=video.read_bytes(), timeout=600, headers={
            "Authorization": f"OAuth {self.cfg.token}", "offset": "0", "file_size": str(size)})
        _raise(up, "resumable video upload")
        return cid

    async def container_status(self, container_id: str) -> tuple[str, str]:
        r = await self.http.get(f"{self.cfg.base}/{container_id}", params=self._p(fields="status_code,status"))
        d = _raise(r, "container status")
        return str(d.get("status_code", "")), str(d.get("status", ""))

    async def publish(self, container_id: str) -> str:
        r = await self.http.post(f"{self.cfg.base}/{self.cfg.user_id}/media_publish",
                                 data=self._p(creation_id=container_id))
        return str(_raise(r, "media_publish")["id"])

    async def permalink(self, media_id: str) -> str:
        r = await self.http.get(f"{self.cfg.base}/{media_id}", params=self._p(fields="permalink"))
        return str(_raise(r, "permalink").get("permalink", ""))

    async def comment(self, media_id: str, message: str) -> str:
        r = await self.http.post(f"{self.cfg.base}/{media_id}/comments", data=self._p(message=message))
        return str(_raise(r, "comment").get("id", ""))


# ------------------------------------------------------------------ token
REFRESH_AFTER_S = 7 * 86400  # refresh weekly; IG Login tokens last 60 days


def token_path(state_dir: Path) -> Path:
    return state_dir / "ig_token.json"


def save_token(state_dir: Path, token: str, expires_in: int | None = None) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    p = token_path(state_dir)
    now = int(time.time())
    p.write_text(json.dumps({"access_token": token, "refreshed_at": now,
                             "expires_at": now + expires_in if expires_in else None}))
    os.chmod(p, 0o600)


def load_config(state_dir: Path) -> IGConfig | None:
    user_id = os.environ.get("JACK_IG_USER_ID", "")
    p = token_path(state_dir)
    token = json.loads(p.read_text())["access_token"] if p.exists() else os.environ.get("JACK_IG_ACCESS_TOKEN", "")
    if not (user_id and token):
        return None
    return IGConfig(user_id=user_id, token=token, flavour=os.environ.get("JACK_IG_API", "instagram"))


async def refresh_token_if_due(cfg: IGConfig, state_dir: Path, http: httpx.AsyncClient) -> bool:
    """Instagram Login tokens: refresh once a week so the 60-day token never lapses."""
    if cfg.flavour != "instagram":
        return False
    p = token_path(state_dir)
    if p.exists() and time.time() - json.loads(p.read_text()).get("refreshed_at", 0) < REFRESH_AFTER_S:
        return False
    r = await http.get("https://graph.instagram.com/refresh_access_token",
                       params={"grant_type": "ig_refresh_token", "access_token": cfg.token})
    d = _raise(r, "token refresh")
    cfg.token = str(d["access_token"])
    save_token(state_dir, cfg.token, int(d.get("expires_in", 0)) or None)
    return True


def token_expiry(state_dir: Path) -> datetime | None:
    p = token_path(state_dir)
    if not p.exists():
        return None
    exp = json.loads(p.read_text()).get("expires_at")
    return datetime.fromtimestamp(exp, timezone.utc) if exp else None
