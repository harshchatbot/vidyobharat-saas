from __future__ import annotations

from types import SimpleNamespace

from app.core.config import Settings
from app.services.video_studio_ai_service import VideoStudioAIService


class _FakeHFClient:
    def __init__(self, response: str = 'Grounded reply from HF Qwen.') -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def provider_name(self) -> str:
        return 'hf_qwen'

    def selected_model_name(self) -> str:
        return 'Qwen/Test'

    def chat_completion(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


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
        'music_track_id': None,
        'music_file_url': None,
        'music_volume': 0,
        'voice': 'priya',
        'language': 'en',
        'tts_provider': 'sarvam',
        'tts_resolved_voice': 'priya',
        'reference_images': '[]',
        'image_urls': [],
        'source_image_url': None,
        'thumbnail_url': None,
        'script': None,
        'recipe_id': 'ugc_ad',
        'pipeline_mode': 'recipe',
        'pipeline_metadata': {
            'recipe_id': 'ugc_ad',
            'pipeline_mode': 'recipe',
            'narration_script': 'A grounded narration script.',
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


def test_video_studio_ai_service_uses_shared_hf_qwen_contextually() -> None:
    fake_client = _FakeHFClient(response='The current render is grounded in the active workspace.')
    service = VideoStudioAIService(
        Settings(_env_file=None, ai_text_provider='mock', qwen_mock_mode=True, qwen_mock_latency_ms=0),
        hf_client=fake_client,
    )
    result = service.reply(
        video=_build_video(),
        message='hi',
        chat_history=[],
    )
    assert result['provider'] == 'hf_qwen'
    assert result['model'] == 'Qwen/Test'
    assert 'workspace' in result['reply'].lower()


def test_video_studio_ai_service_fallback_reply_mentions_rerender() -> None:
    service = VideoStudioAIService(
        Settings(_env_file=None, ai_text_provider='mock', qwen_mock_mode=True, qwen_mock_latency_ms=0),
        hf_client=None,
    )
    service.hf_client = None
    result = service.reply(
        video=_build_video(),
        message='can you do an edit',
        chat_history=[{'role': 'user', 'text': 'hi'}],
    )
    assert 'rerender' in result['reply'].lower() or 'edit' in result['reply'].lower()


def test_video_studio_ai_service_includes_enhancer_context() -> None:
    fake_client = _FakeHFClient()
    service = VideoStudioAIService(Settings(_env_file=None), hf_client=fake_client)
    video = _build_video(
        recipe_id='avatar_product',
        pipeline_metadata={
            'recipe_id': 'avatar_product',
            'pipeline_mode': 'recipe',
            'narration_script': 'Hook line. Showcase line. CTA line.',
            'enhancer': {
                'status': 'success',
                'hook_line': 'Breakfast got easier for me.',
                'showcase_line': 'It is quick and actually filling.',
                'cta_line': 'Worth trying on busy mornings.',
                'showcase_visual_prompt': 'Avatar holding the breakfast pack near a sunny dorm window.',
                'voice_tone': 'friendly_confident',
                'notes': ['Keep the pack visible', 'Natural morning light'],
            },
            'avatar_product_brief': {
                'product_name': 'Protein oats cup',
                'target_audience': 'Busy college students',
            },
            'selected_persona': {
                'persona_id': 'riya_01',
                'persona_source': 'custom_avatar',
                'name': 'Riya',
                'default_voice_id': 'priya',
            },
            'ugc_scene_plan': [
                {
                    'scene_id': 'hook',
                    'stage_label': 'Hook',
                    'render_lane': 'talking_avatar',
                    'visual_objective': 'Riya opens with a relatable breakfast pain point.',
                }
            ],
            'events': [],
        },
    )

    service.reply(video=video, message='what did the enhancer generate?', chat_history=[])

    prompt = str(fake_client.calls[0]['user_prompt'])
    assert 'Recipe id: avatar_product' in prompt
    assert 'hook_line: Breakfast got easier for me.' in prompt
    assert 'showcase_visual_prompt: Avatar holding the breakfast pack near a sunny dorm window.' in prompt
    assert 'persona_id: riya_01' in prompt


def test_video_studio_ai_service_answers_model_question_directly() -> None:
    fake_client = _FakeHFClient()
    service = VideoStudioAIService(Settings(_env_file=None), hf_client=fake_client)

    result = service.reply(
        video=_build_video(selected_model='fal_ltx23_i2v', provider_name='fal.ai'),
        message='What model did I use in this last video?',
        chat_history=[],
    )

    assert 'fal_ltx23_i2v' in result['reply']
    assert 'fal.ai' in result['reply']
    assert fake_client.calls == []


def test_video_studio_ai_service_answers_duration_question_directly() -> None:
    fake_client = _FakeHFClient()
    service = VideoStudioAIService(Settings(_env_file=None), hf_client=fake_client)

    result = service.reply(
        video=_build_video(duration_seconds=5),
        message='What is the video duration?',
        chat_history=[],
    )

    assert '5 seconds' in result['reply']
    assert fake_client.calls == []
