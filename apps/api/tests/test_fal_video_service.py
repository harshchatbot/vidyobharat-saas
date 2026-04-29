from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
import httpx

import app.services.fal_video_service as fal_video_service_module
from app.services.fal_video_service import FalVideoService


@dataclass
class _FakeResponse:
    status_code: int
    payload: dict
    text: str = ""

    def json(self) -> dict:
        return self.payload


def test_fetch_completed_response_payload_uses_top_level_response_endpoint_for_queue_request_url() -> None:
    service = FalVideoService()
    calls: list[tuple[str, str]] = []

    def fake_request_with_timeout(**kwargs):
        method = kwargs["method"]
        url = kwargs["url"]
        calls.append((method, url))
        return _FakeResponse(
            200,
            {
                "status": "completed",
                "video": {"url": "https://v3.fal.media/final.mp4"},
            },
        )

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    payload, tried = service._fetch_completed_response_payload(
        client=None,  # type: ignore[arg-type]
        headers={},
        status_url="https://queue.fal.run/fal-ai/ltx-2.3/requests/root/status",
        submit_response_url="https://queue.fal.run/fal-ai/ltx-2.3/requests/root",
        completed_payload={"status": "completed", "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/root"},
        allow_status_response_fallback=False,
        allow_queue_request_response_endpoint=True,
        allow_queue_request_direct_get=False,
    )

    assert payload is not None
    assert tried == ["https://queue.fal.run/fal-ai/ltx-2.3/requests/root/response"]
    assert calls == [("POST", "https://queue.fal.run/fal-ai/ltx-2.3/requests/root/response")]


def test_fetch_completed_response_payload_uses_get_for_top_level_bare_queue_request_url() -> None:
    service = FalVideoService()
    calls: list[tuple[str, str]] = []

    def fake_request_with_timeout(**kwargs):
        calls.append((kwargs["method"], kwargs["url"]))
        return _FakeResponse(
            200,
            {
                "status": "completed",
                "video": {"url": "https://v3.fal.media/from-get.mp4"},
            },
        )

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    payload, tried = service._fetch_completed_response_payload(
        client=None,  # type: ignore[arg-type]
        headers={},
        status_url="https://queue.fal.run/fal-ai/ltx-2.3/requests/root/status",
        submit_response_url="https://queue.fal.run/fal-ai/ltx-2.3/requests/root",
        completed_payload={"status": "completed", "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/root"},
        allow_status_response_fallback=False,
        allow_queue_request_response_endpoint=False,
        allow_queue_request_direct_get=True,
    )

    assert payload is not None
    assert tried == ["https://queue.fal.run/fal-ai/ltx-2.3/requests/root"]
    assert calls == [("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/root")]


def test_follow_queued_response_request_resolves_multi_hop_nested_lineage_via_status_only() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0
    calls: list[tuple[str, str]] = []

    responses = {
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req1",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
                "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2",
            },
        ),
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req2",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status",
                "video": {"url": "https://v3.fal.media/final.mp4"},
            },
        ),
    }

    def fake_request_with_timeout(**kwargs):
        key = (kwargs["method"], kwargs["url"])
        calls.append(key)
        response = responses.get(key)
        if response is None:
            raise AssertionError(f"Unexpected request {key}")
        return response

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    resolved = service._follow_queued_response_request(
        client=None,  # type: ignore[arg-type]
        headers={},
        payload={
            "status": "in_queue",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        },
        requested_model_key="fal_ltx23_i2v",
        resolved_endpoint="fal-ai/ltx-2.3/image-to-video",
    )

    assert resolved.status == "resolved"
    assert resolved.video_url == "https://v3.fal.media/final.mp4"
    assert resolved.payload is not None
    assert resolved.payload["request_id"] == "req2"
    assert all(not url.endswith("/response") for _, url in calls)


def test_follow_queued_response_request_never_requests_nested_response_endpoint() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0
    calls: list[tuple[str, str]] = []

    responses = {
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req1",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
                "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2",
            },
        ),
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req2",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status",
                "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req3",
            },
        ),
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req3/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req3",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req3/status",
                "video": {"url": "https://v3.fal.media/from-status.mp4"},
            },
        ),
    }

    def fake_request_with_timeout(**kwargs):
        key = (kwargs["method"], kwargs["url"])
        calls.append(key)
        response = responses.get(key)
        if response is None:
            raise AssertionError(f"Unexpected request {key}")
        return response

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    resolved = service._follow_queued_response_request(
        client=None,  # type: ignore[arg-type]
        headers={},
        payload={
            "status": "in_queue",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        },
        requested_model_key="fal_ltx23_i2v",
        resolved_endpoint="fal-ai/ltx-2.3/image-to-video",
    )

    assert resolved.status == "resolved"
    assert all(not url.endswith("/response") for _, url in calls)


def test_follow_queued_response_request_classifies_self_loop_as_cycle() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0

    responses = {
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req1",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
                "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
            },
        ),
    }

    def fake_request_with_timeout(**kwargs):
        key = (kwargs["method"], kwargs["url"])
        response = responses.get(key)
        if response is None:
            raise AssertionError(f"Unexpected request {key}")
        return response

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    resolved = service._follow_queued_response_request(
        client=None,  # type: ignore[arg-type]
        headers={},
        payload={
            "status": "in_queue",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        },
        requested_model_key="fal_ltx23_i2v",
        resolved_endpoint="fal-ai/ltx-2.3/image-to-video",
    )

    assert resolved.status == "cycle_detected"
    assert resolved.reason == "lineage_cycle"
    assert resolved.request_id == "req1"


def test_follow_queued_response_request_classifies_multi_hop_cycle() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0

    responses = {
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req1",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
                "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2",
            },
        ),
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req2",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status",
                "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
            },
        ),
    }

    def fake_request_with_timeout(**kwargs):
        key = (kwargs["method"], kwargs["url"])
        response = responses.get(key)
        if response is None:
            raise AssertionError(f"Unexpected request {key}")
        return response

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    resolved = service._follow_queued_response_request(
        client=None,  # type: ignore[arg-type]
        headers={},
        payload={
            "status": "in_queue",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        },
        requested_model_key="fal_ltx23_i2v",
        resolved_endpoint="fal-ai/ltx-2.3/image-to-video",
    )

    assert resolved.status == "cycle_detected"
    assert resolved.request_id == "req1"
    assert resolved.lineage == ["req1", "req2"]


def test_follow_queued_response_request_classifies_broken_completed_payload() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0

    responses = {
        ("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status"): _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "req1",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            },
        ),
    }

    def fake_request_with_timeout(**kwargs):
        key = (kwargs["method"], kwargs["url"])
        response = responses.get(key)
        if response is None:
            raise AssertionError(f"Unexpected request {key}")
        return response

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    resolved = service._follow_queued_response_request(
        client=None,  # type: ignore[arg-type]
        headers={},
        payload={
            "status": "in_queue",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        },
        requested_model_key="fal_ltx23_i2v",
        resolved_endpoint="fal-ai/ltx-2.3/image-to-video",
    )

    assert resolved.status == "broken_payload"
    assert resolved.reason == "completed_without_video_or_next_status"


def test_follow_queued_response_request_classifies_timeout() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0
    service._MODEL_TERMINAL_STATUS_TIMEOUT_SECONDS["fal_ltx23_i2v"] = 0

    resolved = service._follow_queued_response_request(
        client=None,  # type: ignore[arg-type]
        headers={},
        payload={
            "status": "in_queue",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        },
        requested_model_key="fal_ltx23_i2v",
        resolved_endpoint="fal-ai/ltx-2.3/image-to-video",
    )

    assert resolved.status == "timed_out"
    assert resolved.reason == "timeout"


@dataclass
class _FakeSubmitContextClient:
    submit_payload: dict[str, Any]
    submit_calls: list[tuple[str, str]]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]):
        self.submit_calls.append(("POST", url))
        return _FakeResponse(200, self.submit_payload)


def test_generate_threads_generate_audio_for_supported_models(monkeypatch: pytest.MonkeyPatch) -> None:
    submitted_payloads: list[dict[str, Any]] = []

    class _Client(_FakeSubmitContextClient):
        def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]):
            submitted_payloads.append(json)
            return super().post(url, headers=headers, json=json)

    service = FalVideoService()
    monkeypatch.setattr(
        fal_video_service_module.httpx,
        "Client",
        lambda *args, **kwargs: _Client(
            submit_payload={
                "request_id": "req-audio-1",
                "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req-audio-1/status",
            },
            submit_calls=[],
        ),
    )
    service._poll_status_until_terminal = lambda **kwargs: {  # type: ignore[method-assign]
        "status": "completed",
        "request_id": "req-audio-1",
        "video": {"url": "https://cdn.example.com/generated.mp4"},
    }

    video_url, metadata = service.generate(
        model_key="fal_ltx23_i2v",
        prompt="ambient coffee shop product shot",
        aspect_ratio="9:16",
        resolution="1080p",
        duration_seconds=6,
        image_url="https://example.com/reference.png",
        generate_audio=True,
    )

    assert video_url == "https://cdn.example.com/generated.mp4"
    assert metadata["request_id"] == "req-audio-1"
    assert submitted_payloads[0]["generate_audio"] is True


def test_generate_omits_generate_audio_for_seedance(monkeypatch: pytest.MonkeyPatch) -> None:
    submitted_payloads: list[dict[str, Any]] = []

    class _Client(_FakeSubmitContextClient):
        def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]):
            submitted_payloads.append(json)
            return super().post(url, headers=headers, json=json)

    service = FalVideoService()
    monkeypatch.setattr(
        fal_video_service_module.httpx,
        "Client",
        lambda *args, **kwargs: _Client(
            submit_payload={
                "request_id": "req-seedance-1",
                "status_url": "https://queue.fal.run/fal-ai/seedance/requests/req-seedance-1/status",
            },
            submit_calls=[],
        ),
    )
    service._poll_status_until_terminal = lambda **kwargs: {  # type: ignore[method-assign]
        "status": "completed",
        "request_id": "req-seedance-1",
        "video": {"url": "https://cdn.example.com/seedance.mp4"},
    }

    video_url, metadata = service.generate(
        model_key="seedance_v1_lite_reference",
        prompt="reference-to-video test",
        aspect_ratio="9:16",
        resolution="720p",
        duration_seconds=5,
        image_url="https://example.com/reference.png",
        generate_audio=True,
    )

    assert video_url == "https://cdn.example.com/seedance.mp4"
    assert metadata["request_id"] == "req-seedance-1"
    assert "generate_audio" not in submitted_payloads[0]


def test_generate_uses_get_response_url_for_same_request_top_level_completion(monkeypatch: pytest.MonkeyPatch) -> None:
    service = FalVideoService()
    submit_payload = {
        "status": "IN_QUEUE",
        "request_id": "req1",
        "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
        "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
    }
    submit_calls: list[tuple[str, str]] = []

    monkeypatch.setattr(
        fal_video_service_module.httpx,
        "Client",
        lambda *args, **kwargs: _FakeSubmitContextClient(submit_payload=submit_payload, submit_calls=submit_calls),
    )

    def fake_poll_status_until_terminal(**kwargs):
        return {
            "status": "COMPLETED",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
        }

    service._poll_status_until_terminal = fake_poll_status_until_terminal  # type: ignore[method-assign]

    response_fetch_calls: list[tuple[str, str]] = []

    def fake_request_with_timeout(**kwargs):
        response_fetch_calls.append((kwargs["method"], kwargs["url"]))
        return _FakeResponse(
            200,
            {
                "status": "completed",
                "video": {"url": "https://v3.fal.media/from-top-level-get.mp4"},
            },
        )

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    video_url, metadata = service.generate(
        model_key="fal_ltx23_i2v",
        prompt="showcase prompt",
        aspect_ratio="9:16",
        resolution="1080p",
        duration_seconds=6,
        image_url="https://example.com/product.png",
        request_context={"recipe_id": "avatar_product", "scene_id": "showcase", "scene_index": 1, "scene_role": "showcase"},
    )

    assert video_url == "https://v3.fal.media/from-top-level-get.mp4"
    assert metadata["mode"] == "async_response_url"
    assert response_fetch_calls == [("GET", "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1")]
    assert submit_calls == [("POST", "https://queue.fal.run/fal-ai/ltx-2.3-22b/image-to-video")]


def test_generate_follows_top_level_descriptor_to_different_request_without_posting_response_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    service = FalVideoService()
    submit_payload = {
        "status": "IN_QUEUE",
        "request_id": "req1",
        "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
        "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1",
    }
    submit_calls: list[tuple[str, str]] = []

    monkeypatch.setattr(
        fal_video_service_module.httpx,
        "Client",
        lambda *args, **kwargs: _FakeSubmitContextClient(submit_payload=submit_payload, submit_calls=submit_calls),
    )

    def fake_poll_status_until_terminal(**kwargs):
        return {
            "status": "COMPLETED",
            "request_id": "req1",
            "status_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req1/status",
            "response_url": "https://queue.fal.run/fal-ai/ltx-2.3/requests/req2",
        }

    service._poll_status_until_terminal = fake_poll_status_until_terminal  # type: ignore[method-assign]

    def fake_follow(**kwargs):
        payload = kwargs["payload"]
        assert payload["request_id"] == "req2"
        return fal_video_service_module.FalFollowUpResult(
            status="resolved",
            video_url="https://v3.fal.media/final-top-level-followup.mp4",
            payload={"request_id": "req2", "video": {"url": "https://v3.fal.media/final-top-level-followup.mp4"}},
            lineage=["req1", "req2"],
            request_id="req2",
            status_url="https://queue.fal.run/fal-ai/ltx-2.3/requests/req2/status",
        )

    service._follow_queued_response_request = fake_follow  # type: ignore[method-assign]

    def fake_request_with_timeout(**kwargs):
        raise AssertionError("Top-level queue /response should not be fetched for bare queue URLs")

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    video_url, metadata = service.generate(
        model_key="fal_ltx23_i2v",
        prompt="showcase prompt",
        aspect_ratio="9:16",
        resolution="1080p",
        duration_seconds=6,
        image_url="https://example.com/product.png",
        request_context={"recipe_id": "avatar_product", "scene_id": "showcase", "scene_index": 1, "scene_role": "showcase"},
    )

    assert video_url == "https://v3.fal.media/final-top-level-followup.mp4"
    assert metadata["mode"] == "top_level_status_followup"
    assert submit_calls == [("POST", "https://queue.fal.run/fal-ai/ltx-2.3-22b/image-to-video")]


def test_generate_infinite_talk_waits_for_completed_recipe_scene(monkeypatch: pytest.MonkeyPatch) -> None:
    service = FalVideoService()
    submit_payload = {
        "request_id": "it-req-1",
        "status_url": "https://queue.fal.run/fal-ai/infinitalk/requests/it-req-1/status",
        "response_url": "https://queue.fal.run/fal-ai/infinitalk/requests/it-req-1",
    }
    submit_calls: list[tuple[str, str]] = []

    monkeypatch.setattr(
        fal_video_service_module.httpx,
        "Client",
        lambda *args, **kwargs: _FakeSubmitContextClient(submit_payload=submit_payload, submit_calls=submit_calls),
    )

    def fake_poll_status_until_terminal(**kwargs):
        return {
            "status": "COMPLETED",
            "request_id": "it-req-1",
            "status_url": "https://queue.fal.run/fal-ai/infinitalk/requests/it-req-1/status",
        }

    def fake_fetch_infinitetalk_result_payload(**kwargs):
        return {
            "status": "COMPLETED",
            "request_id": "it-req-1",
            "video": {"url": "https://v3.fal.media/infinitalk-scene.mp4"},
        }

    service._poll_status_until_terminal = fake_poll_status_until_terminal  # type: ignore[method-assign]
    service._fetch_infinitetalk_result_payload = fake_fetch_infinitetalk_result_payload  # type: ignore[method-assign]

    video_url, metadata = service.generate_infinite_talk(
        persona_image_url="https://example.com/avatar.png",
        audio_url="https://example.com/audio.wav",
        prompt="Creator speaks about the product",
        duration_hint_seconds=5,
        audio_duration_seconds=4.8,
        wait_for_completion=True,
        metadata={"persona_id": "avatar_1", "video_id": "scene-video-id"},
    )

    assert video_url == "https://v3.fal.media/infinitalk-scene.mp4"
    assert metadata["mode"] == "completed"
    assert metadata["request_id"] == "it-req-1"
    assert metadata["video_url"] == "https://v3.fal.media/infinitalk-scene.mp4"
    assert submit_calls == [("POST", "https://queue.fal.run/fal-ai/infinitalk")]


def test_poll_status_until_terminal_retries_connect_timeout_then_completes() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0
    responses: list[object] = [
        None,
        _FakeResponse(
            200,
            {
                "status": "completed",
                "request_id": "it-req-1",
                "video": {"url": "https://v3.fal.media/final.mp4"},
            },
        ),
    ]

    def fake_request_with_timeout(**kwargs):
        item = responses.pop(0)
        return item

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    payload = service._poll_status_until_terminal(
        client=None,  # type: ignore[arg-type]
        headers={},
        status_url="https://queue.fal.run/fal-ai/infinitalk/requests/it-req-1/status",
        requested_model_key="fal_infinite_talk",
        resolved_endpoint="fal-ai/infinitalk",
    )

    assert payload["request_id"] == "it-req-1"
    assert payload["video"]["url"] == "https://v3.fal.media/final.mp4"


def test_poll_status_until_terminal_times_out_after_retryable_failures() -> None:
    service = FalVideoService()
    service._STATUS_POLL_INTERVAL_SECONDS = 0
    service._MODEL_TERMINAL_STATUS_TIMEOUT_SECONDS["fal_infinite_talk"] = 0

    def fake_request_with_timeout(**kwargs):
        return None

    service._request_with_timeout = fake_request_with_timeout  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="timed out while waiting for completion"):
        service._poll_status_until_terminal(
            client=None,  # type: ignore[arg-type]
            headers={},
            status_url="https://queue.fal.run/fal-ai/infinitalk/requests/it-req-1/status",
            requested_model_key="fal_infinite_talk",
            resolved_endpoint="fal-ai/infinitalk",
        )


def test_request_with_timeout_returns_none_for_connect_timeout() -> None:
    service = FalVideoService()

    class _FakeClient:
        def request(self, *args, **kwargs):
            raise httpx.ConnectTimeout("timed out")

    response = service._request_with_timeout(
        client=_FakeClient(),  # type: ignore[arg-type]
        method="GET",
        url="https://queue.fal.run/test/status",
        headers={},
        timeout=httpx.Timeout(20.0, connect=10.0),
        failure_label="fal status poll",
    )

    assert response is None


def test_build_video_payload_maps_ltx_text_to_video_fields() -> None:
    service = FalVideoService()

    payload = service._build_video_payload(
        model_key='fal_ltx23_t2v',
        prompt='A creator walks into frame.',
        aspect_ratio='9:16',
        resolution='1080p',
        duration_seconds=5,
        image_url=None,
        multi_prompt=None,
        generate_audio=False,
    )

    assert payload['video_size'] == {'width': 1080, 'height': 1920}
    assert payload['num_frames'] == 120
    assert payload['fps'] == 24
    assert payload['generate_audio'] is False
    assert 'image_url' not in payload


def test_build_video_payload_maps_seedance_image_to_video_fields() -> None:
    service = FalVideoService()

    payload = service._build_video_payload(
        model_key='seedance_v1_lite_i2v',
        prompt='Animate the uploaded product naturally.',
        aspect_ratio='9:16',
        resolution='720p',
        duration_seconds=5,
        image_url='https://example.com/product.png',
        multi_prompt=None,
        generate_audio=None,
    )

    assert payload['image_url'] == 'https://example.com/product.png'
    assert payload['duration'] == '5'
    assert payload['resolution'] == '720p'
    assert 'generate_audio' not in payload


def test_build_video_payload_maps_kling_text_and_reference_routes() -> None:
    service = FalVideoService()

    text_payload = service._build_video_payload(
        model_key='kling_o3_pro_t2v',
        prompt='A café scene with gentle motion.',
        aspect_ratio='16:9',
        resolution='720p',
        duration_seconds=10,
        image_url=None,
        multi_prompt=None,
        generate_audio=True,
    )
    reference_payload = service._build_video_payload(
        model_key='kling_o3_reference',
        prompt='Keep the product label stable.',
        aspect_ratio='9:16',
        resolution='720p',
        duration_seconds=5,
        image_url='https://example.com/reference.png',
        multi_prompt=None,
        generate_audio=False,
    )

    assert text_payload['duration'] == '10'
    assert text_payload['generate_audio'] is True
    assert reference_payload['image_urls'] == ['https://example.com/reference.png']
    assert reference_payload['generate_audio'] is False
