from __future__ import annotations

from app.cinematic.families.ugc.builder import build_ugc_avatar_product_spec
from app.cinematic.orchestrator.compile_prompt import compile_cinematic_prompt


def _build_spec():
    return build_ugc_avatar_product_spec(
        avatar_name='Chitrakala',
        product_name='Wooden wall clock',
        product_category_hint='home decor',
        narration_script='A clean product-first creator ad.',
        duration_seconds=5,
    )


def test_ugc_spec_builder_creates_valid_cinematic_spec() -> None:
    spec = _build_spec()
    assert spec.recipe_family == 'ugc_avatar_product'
    assert spec.recipe_version == 'v2'
    assert spec.rendering.aspect_ratio == '9:16'
    assert 'Reference Image 1' in spec.talent.identity_reference_rule
    assert 'Reference Image 2' in spec.talent.product_reference_rule


def test_seedance_compiler_contains_reference_and_safety_locks() -> None:
    spec = _build_spec()
    prompt, metadata = compile_cinematic_prompt(family='ugc_avatar_product', model_key='seedance_v1_lite_reference', spec=spec)
    assert 'Reference Image 1' in prompt
    assert 'Reference Image 2' in prompt
    assert 'Product visible from first frame' in prompt
    assert 'Face stable' in prompt or 'face stable' in prompt
    assert 'No subtitles' in prompt or 'no subtitles' in prompt
    assert metadata['compiler_name'] == 'seedance_compiler'


def test_kling_compiler_contains_structured_sections() -> None:
    spec = _build_spec()
    prompt, metadata = compile_cinematic_prompt(family='ugc_avatar_product', model_key='kling_o3_standard_reference', spec=spec)
    assert 'Scene:' in prompt
    assert 'Talent:' in prompt
    assert 'Action:' in prompt
    assert 'Rendering:' in prompt
    assert 'Constraints:' in prompt
    assert metadata['compiler_name'] == 'kling_compiler'


def test_ltx_compiler_is_motion_focused_and_shorter_than_kling() -> None:
    spec = _build_spec()
    ltx_prompt, ltx_metadata = compile_cinematic_prompt(family='ugc_avatar_product', model_key='fal_ltx23_i2v', spec=spec)
    kling_prompt, _ = compile_cinematic_prompt(family='ugc_avatar_product', model_key='kling_o3_standard_reference', spec=spec)
    assert 'Camera motion' in ltx_prompt or 'camera motion' in ltx_prompt
    assert len(ltx_prompt) < len(kling_prompt)
    assert ltx_metadata['compiler_name'] == 'ltx_compiler'


def test_seedance_changes_do_not_affect_kling_output() -> None:
    spec = _build_spec()
    seedance_prompt, _ = compile_cinematic_prompt(family='ugc_avatar_product', model_key='seedance_v1_lite_reference', spec=spec)
    kling_prompt, _ = compile_cinematic_prompt(family='ugc_avatar_product', model_key='kling_o3_standard_reference', spec=spec)
    assert 'Scene:\n-' not in seedance_prompt
    assert 'Scene:' in kling_prompt
