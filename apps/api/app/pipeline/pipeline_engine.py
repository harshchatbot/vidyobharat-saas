from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.core.config import get_settings
from app.pipeline.prompt_builder import build_scene_prompt
from app.pipeline.scene_planner import plan_scenes
from app.recipes.recipe_registry import get_recipe, validate_recipe_inputs
from app.services.audio_service import RecipeAudioService
from app.services.image_generation_service import ImageGenerationService
from app.services.video_generation_service import ClipGenerationRequest, VideoGenerationService
from app.services.video_pipeline import VideoPipelineService
from app.services.video_stitcher import VideoStitcher

logger = logging.getLogger(__name__)


@dataclass
class RecipePipelineResult:
    provider: str
    model_key: str
    video_url: str
    metadata: dict[str, Any]


def run_recipe_pipeline(
    recipe_id: str,
    inputs: dict[str, Any],
    *,
    video_id: str,
    user_id: str,
    progress_callback: Callable[[int], None] | None = None,
) -> RecipePipelineResult:
    recipe = get_recipe(recipe_id)
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
    logger.info('recipe_pipeline_started', extra={'video_id': video_id, 'recipe_id': recipe.id})

    pipeline = VideoPipelineService()
    reference = _prepare_reference_asset(
        recipe_id=recipe.id,
        inputs=normalized_inputs,
        user_id=user_id,
        video_id=video_id,
        strategy=recipe.reference_strategy,
    )
    if progress_callback:
        progress_callback(30)
    logger.info(
        'recipe_reference_prepared',
        extra={'video_id': video_id, 'recipe_id': recipe.id, 'reference_asset': str(reference)},
    )

    scenes = plan_scenes(recipe)
    if progress_callback:
        progress_callback(45)
    logger.info(
        'recipe_scenes_planned',
        extra={'video_id': video_id, 'recipe_id': recipe.id, 'scene_count': len(scenes)},
    )

    generation = VideoGenerationService(get_settings())
    clip_urls: list[str] = []
    for index, scene in enumerate(scenes):
        logger.info(
            'recipe_scene_generation_started',
            extra={
                'video_id': video_id,
                'recipe_id': recipe.id,
                'scene_id': scene['scene_id'],
                'duration_seconds': scene['duration_seconds'],
                'model_key': recipe.generation_defaults.model_key,
            },
        )
        prompt = build_scene_prompt(recipe, scene, reference, normalized_inputs)
        clip_result = generation.generate_video_clip(
            ClipGenerationRequest(
                video_id=f'{video_id}-{scene["scene_id"]}',
                prompt=prompt,
                model_key=recipe.generation_defaults.model_key,
                aspect_ratio=recipe.generation_defaults.aspect_ratio,
                resolution=recipe.generation_defaults.resolution,
                duration_seconds=int(scene['duration_seconds']),
                reference_image_url=reference,
                voice=recipe.generation_defaults.voice,
                language=recipe.generation_defaults.language,
                captions_enabled=False,
                narration_enabled=False,
                caption_style=recipe.generation_defaults.caption_style,
                metadata={
                    'recipe_id': recipe.id,
                    'scene_id': scene['scene_id'],
                    'scene_index': index,
                },
            )
        )
        clip_urls.append(clip_result.video_url)
        logger.info(
            'recipe_scene_generation_completed',
            extra={
                'video_id': video_id,
                'recipe_id': recipe.id,
                'scene_id': scene['scene_id'],
                'duration_seconds': scene['duration_seconds'],
                'model_key': recipe.generation_defaults.model_key,
                'clip_url': clip_result.video_url,
            },
        )

    if progress_callback:
        progress_callback(70)

    stitcher = VideoStitcher()
    stitched_path = stitcher.stitch_video(
        clips=clip_urls,
        render_id=video_id,
        aspect_ratio=recipe.generation_defaults.aspect_ratio,
        resolution=recipe.generation_defaults.resolution,
    )
    if progress_callback:
        progress_callback(85)
    logger.info(
        'recipe_video_stitched',
        extra={'video_id': video_id, 'recipe_id': recipe.id, 'output_path': str(stitched_path)},
    )

    audio_service = RecipeAudioService()
    final_path = audio_service.add_audio(
        video_path=stitched_path,
        recipe_music=recipe.config.music,
        render_id=video_id,
    )
    if progress_callback:
        progress_callback(92)
    logger.info(
        'recipe_audio_added',
        extra={'video_id': video_id, 'recipe_id': recipe.id, 'output_path': str(final_path)},
    )
    logger.info(
        'recipe_pipeline_completed',
        extra={
            'video_id': video_id,
            'recipe_id': recipe.id,
            **pipeline.probe_media_streams(final_path),
        },
    )
    return RecipePipelineResult(
        provider='recipe_pipeline',
        model_key=recipe.generation_defaults.model_key,
        video_url=f'/static/renders/{Path(final_path).name}',
        metadata={
            'recipe_id': recipe.id,
            'reference_asset': str(reference),
            'scene_count': len(scenes),
            'output_path': str(final_path),
            'requested_model': recipe.generation_defaults.model_key,
            'resolved_model': recipe.generation_defaults.model_key,
        },
    )


def _prepare_reference_asset(
    *,
    recipe_id: str,
    inputs: dict[str, Any],
    user_id: str,
    video_id: str,
    strategy: str,
) -> str | None:
    image_url = str(inputs.get('image') or '').strip()
    if not image_url:
        return None
    if strategy == 'passthrough':
        return image_url
    if strategy != 'stylize':
        raise ValueError(f'Unsupported reference strategy: {strategy}')

    recipe = get_recipe(recipe_id)
    service = ImageGenerationService(None)
    try:
        generation = service.create_image(
            user_id=user_id,
            model_key='openai_image',
            prompt=recipe.config.reference_prompt or recipe.config.seed_prompt or f'Stylize image for {recipe.id}',
            aspect_ratio='1:1',
            resolution='1024',
            reference_urls=[image_url],
            reference_mode='style',
            template_id=recipe.id,
            mode_id='recipe_reference',
            project_id=None,
        )
        return generation.image_url
    except Exception:
        logger.exception(
            'recipe_reference_generation_failed',
            extra={'video_id': video_id, 'recipe_id': recipe_id},
        )
        return image_url
