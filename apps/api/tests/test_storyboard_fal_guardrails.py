from __future__ import annotations

from types import SimpleNamespace

import app.services.fal_image_service as fal_image_service
from app.services.fal_image_service import FalImageService
from app.workers.storyboard_tasks import _build_image_prompt


def test_storyboard_prompt_is_compact_and_structured() -> None:
    scene = SimpleNamespace(
        visual_description="Creator showing smartwatch in a cafe",
        shot_type="medium",
        mood="confident",
        environment="modern Indian urban cafe with warm interiors",
        avatar_action="holding product naturally",
        product_visibility="prominent",
    )
    prompt = _build_image_prompt(
        scene,
        avatar_name="Chitrakala",
        character_lock_text="Keep same identity",
        product_lock_text="Keep same watch geometry",
        reference_strength=0.85,
        cultural_guidance="Environment and styling should feel authentically Indian urban lifestyle.",
    )
    assert "Create a realistic vertical 9:16 storyboard frame." in prompt
    assert "Identity:" in prompt
    assert "Product:" in prompt
    assert "Avoid:" in prompt


def test_fal_result_url_fallback_preserves_endpoint(monkeypatch) -> None:
    class _Response:
        def __init__(self, status_code: int, payload: dict):
            self.status_code = status_code
            self._payload = payload
            self.content = b"1"
            self.text = str(payload)

        def json(self):
            return self._payload

    class _Client:
        def __init__(self, *args, **kwargs):
            self.calls = []

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            self.calls.append(("POST", url))
            return _Response(200, {"request_id": "abc123"})

        def get(self, url, headers=None):
            self.calls.append(("GET", url))
            if url.endswith("/status"):
                return _Response(200, {"status": "completed"})
            return _Response(200, {"images": [{"url": "https://example.com/x.png"}]})

    monkeypatch.setattr(fal_image_service.httpx, "Client", _Client)

    service = FalImageService()
    service.settings.fal_api_key = "x"
    service.settings.fal_api_base = "https://queue.fal.run"
    result = service._submit_storyboard_image_job(
        endpoint="fal-ai/gemini-25-flash-image/edit",
        payload={"prompt": "x"},
        metadata={},
        mode="reference",
    )
    assert result["image_url"] == "https://example.com/x.png"
    assert "fal-ai/gemini-25-flash-image/edit/requests/abc123/status" in result["status_url"]
    assert "fal-ai/gemini-25-flash-image/edit/requests/abc123" in result["response_url"]

