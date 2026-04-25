from __future__ import annotations

from app.services.video_generation_service import ClipGenerationRequest, VideoGenerationService


class _FakeFalService:
    def generate_infinite_talk(self, **_kwargs):
        raise AssertionError('unexpected fal call')


class _FakeAiVideoService:
    def __init__(self) -> None:
        self.fal = _FakeFalService()


class _FakeHeygenService:
    def generate_avatar_video(self, **_kwargs):
        raise AssertionError('unexpected heygen call')

    def generate_video_agent_avatar_video(self, **_kwargs):
        raise AssertionError('unexpected heygen video agent call')


def test_generate_talking_avatar_clip_uses_heygen_for_heygen_persona(monkeypatch) -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    service.heygen = _FakeHeygenService()
    called: dict[str, object] = {}

    def fake_generate_avatar_video(**kwargs):
        called.update(kwargs)
        return 'https://cdn.example.com/heygen.mp4', {'status': 'completed', 'video_id': 'heygen-video-1'}

    monkeypatch.setattr(service.heygen, 'generate_avatar_video', fake_generate_avatar_video)
    monkeypatch.setattr(
        service.service.fal,
        'generate_infinite_talk',
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError('fal should not be called for HeyGen personas')),
    )

    result = service.generate_talking_avatar_clip(
        ClipGenerationRequest(
            video_id='video-1',
            prompt='Talk about the product.',
            talking_script='Talk about the product.',
            model_key='fal_infinite_talk',
            aspect_ratio='9:16',
            resolution='720p',
            duration_seconds=6,
            render_lane='talking_avatar',
            persona_id='persona-1',
            persona_provider='heygen',
            persona_avatar_id='heygen-avatar-1',
            persona_voice_id='heygen-voice-1',
            voice_provider='heygen',
            metadata={'require_talking_avatar': True, 'supports_avatar_video_generation': True},
        )
    )

    assert result.provider == 'HeyGen'
    assert result.model_key == 'heygen_avatar_video'
    assert result.video_url == 'https://cdn.example.com/heygen.mp4'
    assert called['avatar_id'] == 'heygen-avatar-1'
    assert called['voice_id'] == 'heygen-voice-1'


def test_generate_talking_avatar_clip_uses_heygen_video_agent_for_avatar_product(monkeypatch) -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    service.heygen = _FakeHeygenService()
    called: dict[str, object] = {}

    monkeypatch.setattr(
        service.heygen,
        'generate_avatar_video',
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError('standard heygen path should not be called for avatar_product')),
    )

    def fake_generate_video_agent_avatar_video(**kwargs):
        called.update(kwargs)
        return 'https://cdn.example.com/agent.mp4', {'status': 'completed', 'video_agent_session_id': 'agent-1'}

    monkeypatch.setattr(service.heygen, 'generate_video_agent_avatar_video', fake_generate_video_agent_avatar_video)

    result = service.generate_talking_avatar_clip(
        ClipGenerationRequest(
            video_id='video-agent',
            prompt='Talk about the product.',
            talking_script='Talk about the product.',
            model_key='fal_infinite_talk',
            aspect_ratio='9:16',
            resolution='720p',
            duration_seconds=6,
            render_lane='talking_avatar',
            reference_image_url='https://cdn.example.com/product.png',
            persona_id='persona-agent',
            persona_provider='heygen',
            persona_avatar_id='heygen-avatar-1',
            persona_voice_id='heygen-voice-1',
            voice_provider='heygen',
            metadata={
                'require_talking_avatar': True,
                'supports_avatar_video_generation': True,
                'recipe_id': 'avatar_product',
                'stage_name': 'showcase',
                'must_show_elements': ['product pack'],
            },
        )
    )

    assert result.provider == 'HeyGen'
    assert result.model_key == 'heygen_video_agent_avatar_video'
    assert called['avatar_id'] == 'heygen-avatar-1'
    assert called['product_image_url'] == 'https://cdn.example.com/product.png'
    assert 'exact product being promoted' in called['prompt']
    assert 'uploaded product visible together' in called['prompt']


def test_generate_talking_avatar_clip_does_not_forward_internal_voice_label_to_heygen(monkeypatch) -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    service.heygen = _FakeHeygenService()
    called: dict[str, object] = {}

    def fake_generate_avatar_video(**kwargs):
        called.update(kwargs)
        return 'https://cdn.example.com/heygen.mp4', {'status': 'completed', 'video_id': 'heygen-video-2'}

    monkeypatch.setattr(service.heygen, 'generate_avatar_video', fake_generate_avatar_video)

    result = service.generate_talking_avatar_clip(
        ClipGenerationRequest(
            video_id='video-voice',
            prompt='Talk about the product.',
            talking_script='Talk about the product.',
            model_key='fal_infinite_talk',
            aspect_ratio='9:16',
            resolution='720p',
            duration_seconds=6,
            voice='Shubh',
            render_lane='talking_avatar',
            persona_id='persona-voice',
            persona_provider='heygen',
            persona_avatar_id='heygen-avatar-voice',
            voice_provider='heygen',
            metadata={'require_talking_avatar': True, 'supports_avatar_video_generation': True},
        )
    )

    assert result.provider == 'HeyGen'
    assert called['voice_id'] is None


def test_generate_talking_avatar_clip_rejects_incompatible_heygen_avatar() -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    service.heygen = _FakeHeygenService()

    try:
        service.generate_talking_avatar_clip(
            ClipGenerationRequest(
                video_id='video-incompatible',
                prompt='Talk about the product.',
                talking_script='Talk about the product.',
                model_key='fal_infinite_talk',
                aspect_ratio='9:16',
                resolution='720p',
                duration_seconds=6,
                render_lane='talking_avatar',
                persona_id='persona-incompatible',
                persona_provider='heygen',
                persona_avatar_id='legacy-avatar-id',
                voice_provider='heygen',
                metadata={
                    'require_talking_avatar': True,
                    'supports_avatar_video_generation': False,
                },
            )
        )
    except RuntimeError as exc:
        assert 'not Avatar IV compatible' in str(exc)
    else:
        raise AssertionError('expected RuntimeError for incompatible HeyGen avatar')


def test_generate_talking_avatar_clip_requires_product_image_for_avatar_product() -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    service.heygen = _FakeHeygenService()

    try:
        service.generate_talking_avatar_clip(
            ClipGenerationRequest(
                video_id='video-no-product',
                prompt='Talk about the product.',
                talking_script='Talk about the product.',
                model_key='fal_infinite_talk',
                aspect_ratio='9:16',
                resolution='720p',
                duration_seconds=6,
                render_lane='talking_avatar',
                persona_id='persona-product',
                persona_provider='heygen',
                persona_avatar_id='heygen-avatar-product',
                persona_voice_id='heygen-voice-1',
                voice_provider='heygen',
                metadata={
                    'require_talking_avatar': True,
                    'supports_avatar_video_generation': True,
                    'recipe_id': 'avatar_product',
                },
            )
        )
    except RuntimeError as exc:
        assert 'uploaded product image' in str(exc)
    else:
        raise AssertionError('expected RuntimeError when avatar_product product image is missing')


def test_generate_talking_avatar_clip_uses_fal_for_legacy_persona(monkeypatch) -> None:
    service = VideoGenerationService.__new__(VideoGenerationService)
    service.service = _FakeAiVideoService()
    service.heygen = _FakeHeygenService()
    called: dict[str, object] = {}

    monkeypatch.setattr(
        service.heygen,
        'generate_avatar_video',
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError('heygen should not be called for fal personas')),
    )

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
            persona_provider='fal',
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
