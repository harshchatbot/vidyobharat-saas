"""Tests for optional local YuNet setup; never download or use real secrets."""
from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

from scripts import setup_yunet_local as setup


def test_env_update_only_writes_yunet_key(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=keep-this-secret\nRANGMANCH_YUNET_MODEL_PATH=old.onnx\nCUSTOM=preserve\n")
    monkeypatch.setattr(setup, "ENV_FILE", env)
    setup._configure_env(tmp_path / "model.onnx")
    result = env.read_text()
    assert "OPENAI_API_KEY=keep-this-secret" in result
    assert "CUSTOM=preserve" in result
    assert result.count("RANGMANCH_YUNET_MODEL_PATH=") == 1
    assert str(tmp_path / "model.onnx") in result


def test_uses_pinned_dynamic_input_model_for_opencv_5():
    assert setup._MODEL_NAME == "face_detection_yunet_2026may.onnx"
    assert setup._MODEL_SHA256 == "ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0"
    assert "opencv/opencv_zoo" in setup._MODEL_URL
    assert "2026may" in setup._MODEL_URL


def test_model_checksum_is_streamed(tmp_path):
    model = tmp_path / "fake.onnx"
    model.write_bytes(b"example-model")
    assert setup._sha256(model) == hashlib.sha256(b"example-model").hexdigest()


def test_download_rejects_wrong_hash_and_keeps_existing_model(monkeypatch, tmp_path):
    target = tmp_path / "model.onnx"
    target.write_bytes(b"existing-file")
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, count): return b"definitely-not-the-pinned-model"
    monkeypatch.setattr(setup.urllib.request, "urlopen", lambda *a, **kw: Response())
    try:
        setup._download_pinned_model(target)
        raise AssertionError("Untrusted model accepted")
    except RuntimeError as exc:
        assert "SHA256 mismatch" in str(exc)
    assert target.read_bytes() == b"existing-file"
    assert not list(tmp_path.glob(".yunet-*.onnx"))


def test_verified_download_keeps_onnx_suffix_for_opencv(monkeypatch, tmp_path):
    target = tmp_path / "yunet.onnx"
    payload = b"verified-onnx-model-fixture"
    monkeypatch.setattr(setup, "_MODEL_SHA256", hashlib.sha256(payload).hexdigest())

    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, count): return payload

    monkeypatch.setattr(setup.urllib.request, "urlopen", lambda *a, **kw: Response())
    observed = []
    def validate(path):
        observed.append(path.suffix)
        assert path.name.startswith(".yunet-")
        assert path.read_bytes() == payload

    monkeypatch.setattr(setup, "_validate_model", validate)
    setup._download_pinned_model(target)
    assert observed == [".onnx"]
    assert target.read_bytes() == payload
    assert not list(tmp_path.glob(".yunet-*.onnx"))


def test_check_video_returns_structured_face_observations(monkeypatch, tmp_path):
    video = tmp_path / "source.mp4"
    video.write_bytes(b"source")
    monkeypatch.setattr(setup, "probe_video", lambda *a: SimpleNamespace(
        duration_seconds=15.73, width=720, height=1280))
    box = SimpleNamespace(model_dump=lambda: {"x": .3, "y": .2, "width": .4, "height": .4})
    monkeypatch.setattr(setup, "detect_faces", lambda *a: ("complete", [
        SimpleNamespace(time=1, confidence=.98765, box=box)
    ]))
    result = setup.check_video(video)
    assert result["face_status"] == "complete"
    assert result["face_samples"] == 1
    assert result["first_observations"][0]["confidence"] == .988
