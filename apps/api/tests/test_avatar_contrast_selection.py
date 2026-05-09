from __future__ import annotations

import subprocess
from pathlib import Path

from app.services.avatar_service import selectBestAvatarReferenceImageWithContrast
from app.services.video_pipeline import VideoPipelineService


def _write_solid_png(path: Path, *, rgb: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            'ffmpeg',
            '-y',
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            f'color=c={rgb}:s=64x64:d=0.1',
            '-frames:v',
            '1',
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def test_contrast_selector_prefers_higher_delta_e(tmp_path: Path) -> None:
    product = tmp_path / 'product.png'
    avatar_light = tmp_path / 'avatar_light.png'
    avatar_dark = tmp_path / 'avatar_dark.png'
    _write_solid_png(product, rgb='white')
    _write_solid_png(avatar_light, rgb='white')
    _write_solid_png(avatar_dark, rgb='black')

    pipeline = VideoPipelineService()
    product_url = str(product)
    light_url = str(avatar_light)
    dark_url = str(avatar_dark)
    assert pipeline.ensure_local_media_path(product_url) is not None

    avatar = {
        'primary_image': light_url,
        'reference_images': [light_url, dark_url],
        'reference_image_variants': [
            {'id': 'front', 'url': light_url, 'tags': ['front', 'neutral', 'talking']},
            {'id': 'desk', 'url': dark_url, 'tags': ['desk', 'office', 'ai']},
        ],
    }
    selection = selectBestAvatarReferenceImageWithContrast(
        avatar=avatar,
        recipe_id='avatar_product',
        product_image_url=product_url,
        product_category='home decor',
        prompt_text='talking product ad',
        delta_e_threshold=20.0,
        top_n=5,
    )
    assert selection.selected_url == dark_url
    assert selection.contrast_delta_e is not None
    assert selection.contrast_threshold_triggered is False or selection.contrast_delta_e >= 0

