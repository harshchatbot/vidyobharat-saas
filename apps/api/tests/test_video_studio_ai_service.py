from __future__ import annotations

from types import SimpleNamespace

from app.core.config import Settings
from app.services.video_studio_ai_service import VideoStudioAIService


def _build_video(**overrides):
    base = {
        'id': 'video_123',
        'title': 'Cafe tree scene',
        'status': 'completed',
        'progress': 100,
        'selected_model': 'ltx',
        'provider_name': 'Self-hosted LTX',
        'aspect_ratio': '9:16',
        'resolution': '720p',
        'duration_seconds': 24,
        'narration_enabled': True,
        'captions_enabled': True,
        'music_mode': 'none',
        'reference_images': '[]',
        'source_image_url': None,
        'pipeline_metadata': {
            'events': [
                {
                    'id': 'e1',
                    'title': 'Final render ready',
                    'detail': 'The video is ready for playback.',
                    'state': 'complete',
                    'created_at': '2026-04-21T12:00:00Z',
                }
            ]
        },
        'output_url': 'https://example.com/video.mp4',
        'error_message': None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_video_studio_ai_service_uses_mock_qwen_contextually() -> None:
    service = VideoStudioAIService(
        Settings(_env_file=None, ai_text_provider='mock', qwen_mock_mode=True, qwen_mock_latency_ms=0)
    )
    result = service.reply(
        video=_build_video(),
        message='hi',
        chat_history=[],
    )
    assert result['provider'] == 'mock_qwen'
    assert 'currently at' in result['reply'].lower() or 'render' in result['reply'].lower()


def test_video_studio_ai_service_edit_reply_mentions_rerender() -> None:
    service = VideoStudioAIService(
        Settings(_env_file=None, ai_text_provider='mock', qwen_mock_mode=True, qwen_mock_latency_ms=0)
    )
    result = service.reply(
        video=_build_video(),
        message='can you do an edit',
        chat_history=[{'role': 'user', 'text': 'hi'}],
    )
    assert 'rerender' in result['reply'].lower() or 'edit' in result['reply'].lower()
