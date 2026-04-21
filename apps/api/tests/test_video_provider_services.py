from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

from app.core.config import Settings
from app.services.video.ltx_service import LtxService
from app.services.video.providers.hf_ltx_provider import HFLtxProvider
from app.services.video.providers.self_hosted_ltx_provider import SelfHostedLtxProvider


class _FakeHFInferenceClient:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.calls: list[dict[str, object]] = []

    def text_to_video(self, **kwargs):
        self.calls.append(kwargs)
        return b'fake-video-bytes'


def test_video_provider_selection_based_on_config() -> None:
    mock_service = LtxService(Settings(_env_file=None, ai_video_provider='mock', ltx_mock_mode=True))
    assert mock_service.provider_name() == 'mock_ltx'

    hf_service = LtxService(Settings(_env_file=None, ai_video_provider='hf_ltx', hf_token='hf_test_token'))
    assert hf_service.provider_name() == 'hf_ltx'

    self_hosted_service = LtxService(Settings(_env_file=None, ai_video_provider='self_hosted_ltx', ltx_self_hosted_base_url='http://localhost:8010'))
    assert self_hosted_service.provider_name() == 'self_hosted_ltx'


def test_hf_ltx_request_normalization(monkeypatch, tmp_path: Path) -> None:
    created: dict[str, object] = {}

    class FakeInferenceClient:
        def __init__(self, **kwargs) -> None:
            created['init'] = kwargs

        def text_to_video(self, **kwargs):
            created['request'] = kwargs
            return b'video-bytes'

    monkeypatch.setitem(sys.modules, 'huggingface_hub', types.SimpleNamespace(InferenceClient=FakeInferenceClient))
    monkeypatch.chdir(tmp_path)

    provider = HFLtxProvider(Settings(ai_video_provider='hf_ltx', hf_token='hf_test_token', hf_ltx_model='LTX/Test', hf_ltx_provider='fal-ai'))
    result = provider.submit_generation(
        render_id='vid-123',
        prompt='cinematic prompt',
        aspect_ratio='16:9',
        resolution='720p',
        duration_seconds=8,
        metadata={'negative_prompt': 'no speaking', 'guidance_scale': 4.5},
    )

    assert result.status == 'completed'
    assert result.video_url
    normalized_request = result.metadata['normalized_request']
    assert normalized_request['model'] == 'LTX/Test'
    assert normalized_request['provider'] == 'fal-ai'
    assert normalized_request['parameters']['num_frames'] == 81
    assert normalized_request['parameters']['guidance_scale'] == 4.5
    assert created['request']['prompt'] == 'cinematic prompt'


def test_mock_ltx_submit_poll_complete_flow(tmp_path: Path) -> None:
    sample_video = tmp_path / 'sample.mp4'
    sample_video.write_bytes(b'video')
    service = LtxService(
        Settings(
            ai_video_provider='mock',
            ltx_mock_mode=True,
            ltx_mock_latency_ms=0,
            ltx_mock_sample_video_path=str(sample_video),
        )
    )
    video_url, metadata = service.generate_scene(
        render_id='vid-mock-flow',
        prompt='test prompt',
        aspect_ratio='16:9',
        resolution='720p',
        duration_seconds=8,
        metadata={'scene_role': 'establish'},
    )
    assert video_url == '/static/renders/vid-mock-flow.mp4'
    assert metadata['status'] == 'completed'
    assert metadata['external_job_id'].startswith('mock-ltx-')


def test_mock_ltx_forced_error_mode(tmp_path: Path) -> None:
    sample_video = tmp_path / 'sample.mp4'
    sample_video.write_bytes(b'video')
    service = LtxService(
        Settings(
            ai_video_provider='mock',
            ltx_mock_mode=True,
            ltx_mock_force_error=True,
            ltx_mock_latency_ms=0,
            ltx_mock_sample_video_path=str(sample_video),
        )
    )
    with pytest.raises(RuntimeError, match='forced error'):
        service.generate_scene(
            render_id='vid-mock-error',
            prompt='test prompt',
            aspect_ratio='16:9',
            resolution='720p',
            duration_seconds=8,
            metadata={'scene_role': 'establish'},
        )


def test_self_hosted_ltx_config_wiring() -> None:
    provider = SelfHostedLtxProvider(Settings(ai_video_provider='self_hosted_ltx', ltx_self_hosted_base_url='http://localhost:8010', ltx_video_status_path='/status/{job_id}'))
    health = provider.healthcheck()
    assert health['ok'] is True
    assert health['base_url'] == 'http://localhost:8010'


def test_service_level_mock_business_logic_without_network(tmp_path: Path) -> None:
    sample_video = tmp_path / 'sample.mp4'
    sample_video.write_bytes(b'video')
    service = LtxService(Settings(ai_video_provider='mock', ltx_mock_mode=True, ltx_mock_latency_ms=0, ltx_mock_sample_video_path=str(sample_video)))
    submit = service.submit_ltx_job(
        render_id='vid-service-check',
        prompt='test prompt',
        aspect_ratio='16:9',
        resolution='720p',
        duration_seconds=8,
        metadata={'scene_id': 'scene_1', 'scene_role': 'establish'},
    )
    status = service.get_ltx_job_status(job_id=submit['external_job_id'])
    assert submit['output_name'].endswith('.mp4')
    assert status['provider_status'] in {'queued', 'running', 'completed'}
