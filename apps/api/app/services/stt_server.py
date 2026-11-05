"""Private, container-network-only Faster-Whisper transcription service.

Do not expose its port via host or public reverse proxy.
"""
import os
import secrets
from threading import Lock

from fastapi import FastAPI, Header, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.services.editor_transcription import MAX_INPUT_BYTES, transcribe_video_bytes

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
transcription_lock = Lock()
MAX_AUDIO_BYTES = 4 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(request: Request, x_rangmanch_stt_token: str | None = Header(default=None)):
    expected = os.getenv("RANGMANCH_STT_TOKEN", "")
    if not expected or not x_rangmanch_stt_token or not secrets.compare_digest(x_rangmanch_stt_token, expected):
        raise HTTPException(status_code=403, detail="Forbidden")
    if request.headers.get("content-length"):
        try:
            size = int(request.headers["content-length"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content length")
        if size > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio too large")
    audio = await request.body()
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio must be 1 to 4 MB")
    if not transcription_lock.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Transcription worker busy; retry shortly")
    try:
        try:
            return await run_in_threadpool(transcribe_video_bytes, audio)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        transcription_lock.release()
