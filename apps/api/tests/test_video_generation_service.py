from __future__ import annotations

import pytest

from app.services.video_generation_service import ClipGenerationRequest, VideoGenerationService


class _FakeFalService:
    def generate_infinite_talk(self, **_kwargs):
        raise AssertionError('unexpected fal call')


class _FakeAiVideoService:
    def __init__(self) -> None:
        self.fal = _FakeFalService()


def test_generate_talking_avatar_clip_rejects_retired_heygen_persona() -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()

    with pytest.raises(RuntimeError, match='retired HeyGen path'):
        service.generate_talking_avatar_clip(
            ClipGenerationRequest(
                video_id='video-retired',
                prompt='Talk about the product.',
                talking_script='Talk about the product.',
                model_key='fal_infinite_talk',
                aspect_ratio='9:16',
                resolution='720p',
                duration_seconds=6,
                render_lane='talking_avatar',
                persona_id='persona-retired',
                persona_provider='heygen',
                persona_avatar_id='legacy-avatar-id',
                voice_provider='heygen',
                metadata={'require_talking_avatar': True},
            )
        )


def test_generate_talking_avatar_clip_uses_fal_for_reference_image_persona(monkeypatch) -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    called: dict[str, object] = {}

    def fake_generate_infinite_talk(**kwargs):
        called.update(kwargs)
        return 'https://cdn.example.com/fal.mp4', {'status': 'completed', 'request_id': 'fal-1'}

    monkeypatch.setattr(service.service.fal, 'generate_infinite_talk', fake_generate_infinite_talk)

    result = service.generate_talking_avatar_clip(
        ClipGenerationRequest(
            video_id='video-2',
            prompt='Legacy talking avatar clip.',
            talking_script='Legacy talking avatar clip.',
            model_key='fal_infinite_talk',
            aspect_ratio='9:16',
            resolution='720p',
            duration_seconds=6,
            render_lane='talking_avatar',
            persona_id='persona-2',
            persona_provider='reference_image',
            persona_image_url='https://example.com/avatar.png',
            talking_audio_url='https://example.com/audio.wav',
            talking_audio_duration_seconds=4.2,
            metadata={'require_talking_avatar': True},
        )
    )

    assert result.provider == 'fal.ai InfiniteTalk'
    assert result.video_url == 'https://cdn.example.com/fal.mp4'
    assert called['persona_image_url'] == 'https://example.com/avatar.png'
    assert called['audio_url'] == 'https://example.com/audio.wav'


def test_generate_talking_avatar_clip_requires_reference_image_for_selected_persona() -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()

    with pytest.raises(RuntimeError, match='could not be resolved to a usable image'):
        service.generate_talking_avatar_clip(
            ClipGenerationRequest(
                video_id='video-missing-image',
                prompt='Talk about the product.',
                talking_script='Talk about the product.',
                model_key='fal_infinite_talk',
                aspect_ratio='9:16',
                resolution='720p',
                duration_seconds=6,
                render_lane='talking_avatar',
                persona_id='persona-missing-image',
                persona_provider='reference_image',
                talking_audio_url='https://example.com/audio.wav',
                metadata={'require_talking_avatar': True},
            )
        )
