from __future__ import annotations

from pathlib import Path

import pytest

from app.cinematic.families.motion_control.builder import build_motion_control_dance_spec
from app.cinematic.families.ugc.builder import build_ugc_avatar_product_spec
from app.cinematic.orchestrator.compile_prompt import compile_cinematic_prompt
from app.services.motion_control_media_service import MotionControlMediaService


def _build_spec():
    return build_ugc_avatar_product_spec(
        avatar_name='Chitrakala',
        product_name='Wooden wall clock',
        product_category_hint='home decor',
        narration_script='A clean product-first creator ad.',
        duration_seconds=5,
    )


def _build_silent_spec():
    return build_ugc_avatar_product_spec(
        avatar_name='Chitrakala',
        product_name='Wooden wall clock',
        product_category_hint='home decor',
        narration_script='',
        duration_seconds=5,
    )


def test_ugc_spec_builder_creates_valid_cinematic_spec() -> None:
    spec = _build_spec()
    assert spec.recipe_family == 'ugc_avatar_product'
    assert spec.recipe_version == 'v2'
    assert spec.rendering.aspect_ratio == '9:16'
    assert 'Reference Image 1' in spec.talent.identity_reference_rule
    assert 'Reference Image 2' in spec.talent.product_reference_rule


def test_ugc_spec_builder_enables_speaking_frame_safety_for_narrated_runs() -> None:
    spec = _build_spec()
    assert spec.metadata['speaking_frame_safety_enabled'] is True
    assert spec.metadata['product_face_spacing_strategy'] == 'lower_beside_face_chest_to_shoulder_zone'
    assert 'mouth line' in spec.action.opening_action
    assert 'lips fully visible' in spec.action.ending_action
    assert 'keep lips fully visible throughout spoken sections' in spec.constraints.must_do


def test_ugc_spec_builder_keeps_silent_runs_less_restrictive() -> None:
    spec = _build_silent_spec()
    assert spec.metadata['speaking_frame_safety_enabled'] is False
    assert spec.metadata['product_face_spacing_strategy'] == 'standard_recipe_framing'
    assert 'mouth line' not in spec.action.opening_action.lower()
    assert all('spoken sections' not in item for item in spec.constraints.must_do)


def test_seedance_compiler_contains_reference_and_safety_locks() -> None:
    spec = _build_spec()
    prompt, metadata = compile_cinematic_prompt(family='ugc_avatar_product', model_key='seedance_v1_lite_reference', spec=spec)
    assert 'Reference Image 1' in prompt
    assert 'Reference Image 2' in prompt
    assert 'Product visible from first frame' in prompt
    assert 'Face stable' in prompt or 'face stable' in prompt
    assert 'No subtitles' in prompt or 'no subtitles' in prompt
    assert 'never near the lips or chin' in prompt
    assert 'No profile turns during speech' in prompt
    assert metadata['compiler_name'] == 'seedance_compiler'


def test_kling_compiler_contains_structured_sections() -> None:
    spec = _build_spec()
    prompt, metadata = compile_cinematic_prompt(family='ugc_avatar_product', model_key='kling_o3_standard_reference', spec=spec)
    assert 'Scene:' in prompt
    assert 'Talent:' in prompt
    assert 'Action:' in prompt
    assert 'Rendering:' in prompt
    assert 'Constraints:' in prompt
    assert 'Speaking-frame safety enabled: yes' in prompt
    assert 'Product/face spacing strategy: lower_beside_face_chest_to_shoulder_zone' in prompt
    assert metadata['compiler_name'] == 'kling_compiler'


def test_ltx_compiler_is_motion_focused_and_shorter_than_kling() -> None:
    spec = _build_spec()
    ltx_prompt, ltx_metadata = compile_cinematic_prompt(family='ugc_avatar_product', model_key='fal_ltx23_i2v', spec=spec)
    kling_prompt, _ = compile_cinematic_prompt(family='ugc_avatar_product', model_key='kling_o3_standard_reference', spec=spec)
    assert 'Camera motion' in ltx_prompt or 'camera motion' in ltx_prompt
    assert 'below the mouth line' in ltx_prompt
    assert len(ltx_prompt) < len(kling_prompt)
    assert ltx_metadata['compiler_name'] == 'ltx_compiler'


def test_seedance_changes_do_not_affect_kling_output() -> None:
    spec = _build_spec()
    seedance_prompt, _ = compile_cinematic_prompt(family='ugc_avatar_product', model_key='seedance_v1_lite_reference', spec=spec)
    kling_prompt, _ = compile_cinematic_prompt(family='ugc_avatar_product', model_key='kling_o3_standard_reference', spec=spec)
    assert 'Scene:\n-' not in seedance_prompt
    assert 'Scene:' in kling_prompt


def test_motion_control_builder_creates_valid_cinematic_spec() -> None:
    spec = build_motion_control_dance_spec(
        character_description='panda mascot',
        user_prompt='funny viral dance reel',
        dance_style='Funny',
        character_energy='Goofy',
        visual_style='3D Cartoon',
        motion_fidelity='Balanced',
        character_orientation='video',
        keep_original_sound=True,
        duration_seconds=18,
        has_audio=True,
    )
    assert spec.recipe_family == 'motion_control_dance'
    assert spec.recipe_version == 'v1'
    assert spec.rendering.aspect_ratio == '9:16'
    assert spec.metadata['generation_mode'] == 'reference_driven'
    assert spec.metadata['motion_fidelity'] == 'Strict'
    assert spec.metadata['character_orientation'] == 'video'
    assert 'Reference Image 1' in spec.talent.identity_reference_rule


def test_motion_control_compiler_preserves_identity_and_reference_timing() -> None:
    spec = build_motion_control_dance_spec(
        character_description='anime fox girl',
        user_prompt='anime dance edit',
        dance_style='Anime',
        character_energy='Cute',
        visual_style='Anime',
        motion_fidelity='Strict',
        character_orientation='video',
        keep_original_sound=False,
        duration_seconds=12,
    )
    prompt, metadata = compile_cinematic_prompt(
        family='motion_control_dance',
        model_key='kling_v26_standard_motion_control',
        spec=spec,
    )
    assert 'Preserve the character identity exactly' in prompt
    assert 'Follow the uploaded reference video for choreography and pacing' in prompt
    assert 'Avoid extra limbs, warped hands, body distortion' in prompt
    assert 'Stay closely faithful to the original choreography timing and move sequence' in prompt
    assert metadata['compiler_name'] == 'kling_motion_control_compiler'


def test_motion_control_orchestrator_routes_to_dedicated_compiler() -> None:
    spec = build_motion_control_dance_spec(
        character_description='panda mascot',
        user_prompt='viral reel',
        dance_style='Funny',
        character_energy='Playful',
        visual_style='Realistic',
        motion_fidelity='Balanced',
        character_orientation='video',
        keep_original_sound=True,
        duration_seconds=9,
    )
    _, metadata = compile_cinematic_prompt(
        family='motion_control_dance',
        model_key='kling_v26_standard_motion_control',
        spec=spec,
    )
    assert metadata['compiler_name'] == 'kling_motion_control_compiler'
    assert metadata['model_key'] == 'kling_v26_standard_motion_control'


def test_motion_control_media_analysis_detects_duration_and_audio(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    media_service = MotionControlMediaService()
    video_path = tmp_path / 'dance.mp4'
    video_path.write_bytes(b'fake')

    monkeypatch.setattr(media_service.pipeline, 'ensure_local_media_path', lambda _url: video_path)
    monkeypatch.setattr(media_service.pipeline, 'video_has_audio_stream', lambda _path: True)
    monkeypatch.setattr(media_service, '_probe_duration', lambda _path: 18.4)

    analysis = media_service.analyze_reference_video('https://example.com/dance.mp4')

    assert analysis.duration_seconds == 18.4
    assert analysis.billed_duration_seconds == 19
    assert analysis.has_audio is True


def test_motion_control_media_analysis_rejects_long_videos(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    media_service = MotionControlMediaService()
    video_path = tmp_path / 'long-dance.mp4'
    video_path.write_bytes(b'fake')

    monkeypatch.setattr(media_service.pipeline, 'ensure_local_media_path', lambda _url: video_path)
    monkeypatch.setattr(media_service.pipeline, 'video_has_audio_stream', lambda _path: False)
    monkeypatch.setattr(media_service, '_probe_duration', lambda _path: 40.2)

    analysis = media_service.analyze_reference_video('https://example.com/long-dance.mp4')
    with pytest.raises(ValueError, match='Dance videos longer than 40 seconds are not supported yet.'):
        media_service.validate_supported_duration(analysis)
