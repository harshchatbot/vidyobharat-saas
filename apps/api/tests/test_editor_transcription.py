from __future__ import annotations

import sys
import types
from types import SimpleNamespace

from app.services import editor_transcription


def test_transcription_reuses_model_and_cached_result(monkeypatch) -> None:
    calls = {"models": 0, "transcribes": 0}

    class FakeWhisperModel:
        def __init__(self, *_args, **_kwargs) -> None:
            calls["models"] += 1

        def transcribe(self, *_args, **_kwargs):
            calls["transcribes"] += 1
            return [SimpleNamespace(words=[SimpleNamespace(word=" hello ", start=0.1, end=0.4)])], SimpleNamespace(language="en")

    fake_module = types.ModuleType("faster_whisper")
    fake_module.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_module)
    monkeypatch.setattr(editor_transcription.subprocess, "run", lambda *_args, **_kwargs: None)
    editor_transcription.clear_transcription_caches_for_testing()

    first = editor_transcription.transcribe_video_bytes(b"same-recording")
    second = editor_transcription.transcribe_video_bytes(b"same-recording")

    assert first == {"language": "en", "words": [{"text": "hello", "start": 0.1, "end": 0.4}]}
    assert second == first
    assert calls == {"models": 1, "transcribes": 1}
    editor_transcription.clear_transcription_caches_for_testing()
