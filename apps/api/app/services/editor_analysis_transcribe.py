"""Transcribe an already downloaded, owner-authorized guest video.

Only the caller may resolve the original storage object. This service never
reads Firebase credentials or fetches remote media.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

import httpx
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from app.services.editor_transcription import transcribe_video_bytes


async def transcribe_source(source: Path) -> dict:
    stt_url = os.getenv("RANGMANCH_STT_URL", "").strip()
    if stt_url and not os.getenv("RANGMANCH_STT_TOKEN", ""):
        raise HTTPException(status_code=503, detail="Speech recognition is not configured.")

    def prepare() -> bytes:
        if not stt_url:
            return source.read_bytes()
        audio = source.with_name("speech.wav")
        try:
            subprocess.run(
                ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                 "-y", "-i", str(source), "-t", "65", "-vn", "-ac", "1",
                 "-ar", "16000", str(audio)],
                check=True, timeout=45, capture_output=True,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
            raise ValueError("Unable to decode audio from this recording.") from exc
        if audio.stat().st_size > 4 * 1024 * 1024:
            raise ValueError("Recording audio exceeds transcription limit.")
        return audio.read_bytes()

    data = await run_in_threadpool(prepare)
    if stt_url:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(265.0, connect=5.0), trust_env=False) as client:
                result = await client.post(
                    stt_url.rstrip("/") + "/transcribe",
                    content=data,
                    headers={
                        "X-RangManch-STT-Token": os.environ["RANGMANCH_STT_TOKEN"],
                        "Content-Type": "audio/wav",
                    },
                )
            if result.status_code == 422:
                raise HTTPException(status_code=422, detail="Unable to transcribe this audio.")
            if result.status_code != 200:
                raise HTTPException(status_code=503, detail="Speech recognition is temporarily unavailable.")
            return result.json()
        except (httpx.RequestError, ValueError) as exc:
            raise HTTPException(status_code=503, detail="Speech recognition service unavailable.") from exc
    try:
        return await asyncio.wait_for(run_in_threadpool(transcribe_video_bytes, data), timeout=300)
    except TimeoutError as exc:
        raise HTTPException(
            status_code=503, detail="Speech recognition is taking too long. Please retry shortly.",
        ) from exc
