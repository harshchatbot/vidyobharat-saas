from __future__ import annotations

from app.services.ltx_video_service import LtxVideoService


def test_build_output_name_prefers_render_and_scene_metadata() -> None:
    service = LtxVideoService()
    output_name = service._build_output_name(  # noqa: SLF001 - targeted unit coverage for provider payload contract
        render_id="vid-123",
        metadata={"scene_id": "scene_1_establish", "scene_role": "establish"},
    )
    assert output_name == "vid-123-scene_1_establish-establish.mp4"


def test_mock_job_status_progresses_to_completed(monkeypatch) -> None:
    service = LtxVideoService()
    monkeypatch.setattr(service.settings, "ltx_mock_mode", True)
    monkeypatch.setattr(service.settings, "ltx_mock_queue_seconds", 0)
    monkeypatch.setattr(service.settings, "ltx_mock_processing_seconds", 0)

    submit = service.submit_ltx_job(
        render_id="vid-mock",
        prompt="test prompt",
        aspect_ratio="16:9",
        resolution="720p",
        duration_seconds=8,
        metadata={"scene_role": "establish"},
    )

    assert submit["external_job_id"].startswith("mock-ltx-")
    assert submit["output_name"].endswith(".mp4")
    status = service.get_ltx_job_status(job_id=submit["external_job_id"])
    assert status["provider_status"] == "completed"
    assert str(status["video_source"]).endswith("advertisement.mp4")
