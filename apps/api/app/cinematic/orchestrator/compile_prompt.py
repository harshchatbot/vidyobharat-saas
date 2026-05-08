from __future__ import annotations

from app.cinematic.compilers.kling_compiler import compile_kling_prompt
from app.cinematic.compilers.ltx_compiler import compile_ltx_prompt
from app.cinematic.compilers.seedance_compiler import compile_seedance_prompt
from app.cinematic.schemas.cinematic_spec import CinematicSpec


KLING_MODEL_KEYS = {
    'kling_o3_standard_reference',
    'kling_o3_pro_reference',
    'kling_o3_4k_reference',
    'kling_o3_reference',
}


def compile_cinematic_prompt(*, family: str, model_key: str, spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    _ = family
    if model_key == 'seedance_v1_lite_reference':
        prompt, compiler_metadata = compile_seedance_prompt(spec)
    elif model_key in KLING_MODEL_KEYS:
        prompt, compiler_metadata = compile_kling_prompt(spec)
    elif model_key == 'fal_ltx23_i2v':
        prompt, compiler_metadata = compile_ltx_prompt(spec)
    else:
        prompt, compiler_metadata = compile_kling_prompt(spec)

    return prompt, {
        **compiler_metadata,
        'recipe_family': spec.recipe_family,
        'recipe_version': spec.recipe_version,
        'model_key': model_key,
    }
