from __future__ import annotations

from typing import Any
from urllib.parse import urlparse


IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm', '.m4v', '.mkv'}
URL_HINT_KEYS = {
    'image',
    'image_url',
    'image_urls',
    'reference_image',
    'reference_images',
    'video',
    'video_url',
    'video_urls',
    'reference_video',
    'reference_videos',
    'asset',
    'assets',
    'url',
    'urls',
}
LOCAL_PATH_PREFIXES = ('/', './', '../', '~/', 'file://')


def normalize_structured_video_prompt(raw_prompt: Any) -> dict[str, Any]:
    shape, shots_source = _coerce_structured_prompt_shape(raw_prompt)
    normalized_shots = [_normalize_shot(entry) for entry in shots_source]
    meaningful_shots = [entry for entry in normalized_shots if _shot_has_meaning(entry)]
    if not meaningful_shots:
        raise ValueError('Structured JSON did not contain any usable shot or scene details.')

    assets = _collect_assets(raw_prompt)
    extracted = _extract_distinct_prompt_details(meaningful_shots)
    summary = _build_structured_prompt_summary(meaningful_shots)
    provider_safe_prompt = _build_provider_safe_prompt(meaningful_shots)

    return {
        'shape': shape,
        'shot_count': len(meaningful_shots),
        'shots': meaningful_shots,
        'summary': summary,
        'provider_safe_prompt': provider_safe_prompt,
        'assets': assets,
        'reference_image_urls': [asset['url'] for asset in assets if asset.get('kind') == 'image'],
        'extracted': extracted,
    }


def _coerce_structured_prompt_shape(raw_prompt: Any) -> tuple[str, list[dict[str, Any]]]:
    if isinstance(raw_prompt, list):
        if not raw_prompt:
            raise ValueError('JSON shot array cannot be empty.')
        if not all(isinstance(item, dict) for item in raw_prompt):
            raise ValueError('JSON shot arrays must contain only objects.')
        return 'array', [dict(item) for item in raw_prompt]

    if isinstance(raw_prompt, dict):
        nested_shots = raw_prompt.get('shots')
        if isinstance(nested_shots, list) and nested_shots:
            if not all(isinstance(item, dict) for item in nested_shots):
                raise ValueError('The "shots" field must be an array of objects.')
            return 'object', [dict(item) for item in nested_shots]
        return 'object', [dict(raw_prompt)]

    raise ValueError('JSON mode expects either one object or an array of shot objects.')


def _normalize_shot(source: dict[str, Any]) -> dict[str, Any]:
    shot = _coerce_dict(source.get('shot'))
    subject = _coerce_dict(source.get('subject'))
    scene = _coerce_dict(source.get('scene'))
    visual_details = _coerce_dict(source.get('visual_details'))
    cinematography = _coerce_dict(source.get('cinematography'))
    audio = _coerce_dict(source.get('audio'))

    composition = _pick_text(
        shot.get('composition'),
        shot.get('shot_type'),
        source.get('composition'),
        source.get('shot_type'),
    )
    camera_movement = _pick_text(
        shot.get('camera_movement'),
        source.get('camera_movement'),
    )
    lens = _pick_text(
        shot.get('lens'),
        shot.get('lens_spec'),
        source.get('lens'),
        source.get('lens_spec'),
    )
    lighting = _pick_text(
        cinematography.get('lighting'),
        source.get('lighting'),
    )
    subject_text = _join_parts(
        _pick_text(subject.get('description'), source.get('subject_details')),
        _format_labeled_value('Wardrobe', subject.get('wardrobe')),
        _format_labeled_value('Props', subject.get('props')),
    )
    environment = _join_parts(
        _format_labeled_value('Location', scene.get('location')),
        _format_labeled_value('Time of day', scene.get('time_of_day')),
        _pick_text(scene.get('environment'), source.get('environment_details')),
    )
    action = _join_parts(
        _pick_text(visual_details.get('action'), source.get('action')),
        _format_labeled_value('Motion detail', visual_details.get('hair_clothing_motion')),
    )
    effects = _join_parts(
        _pick_text(visual_details.get('special_effects'), source.get('vfx_elements')),
        _pick_text(source.get('special_effects')),
    )
    color_palette = _pick_text(
        cinematography.get('color_palette'),
        source.get('color_palette'),
    )
    framing = _pick_text(
        cinematography.get('framing'),
        source.get('framing'),
    )
    audio_intent = _join_parts(
        _format_labeled_value('Music', audio.get('music')),
        _format_labeled_value('Ambient', audio.get('ambient')),
        _format_labeled_value('Sound effects', audio.get('sound_effects')),
        _format_labeled_value('Mix', audio.get('mix_level')),
    )
    tone = _pick_text(
        cinematography.get('tone'),
        source.get('tone'),
    )
    shutter = _pick_text(source.get('shutter_speed'))

    return {
        'composition': composition,
        'camera_movement': camera_movement,
        'lens': lens,
        'lighting': lighting,
        'subject': subject_text,
        'environment': environment,
        'action': action,
        'effects': effects,
        'color_palette': color_palette,
        'framing': framing,
        'audio_intent': audio_intent,
        'tone': tone,
        'shutter': shutter,
    }


def _collect_assets(node: Any, *, path: str = 'root') -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    if isinstance(node, dict):
        for key, value in node.items():
            next_path = f'{path}.{key}'
            key_text = str(key).strip().lower()
            if isinstance(value, str):
                asset = _coerce_asset(value=value, path=next_path, key_hint=key_text)
                if asset:
                    found.append(asset)
            else:
                found.extend(_collect_assets(value, path=next_path))
        return found

    if isinstance(node, list):
        for index, item in enumerate(node):
            if isinstance(item, str):
                path_hint = path.rsplit('.', 1)[-1].split('[', 1)[0].strip().lower()
                asset = _coerce_asset(value=item, path=f'{path}[{index}]', key_hint=path_hint)
                if asset:
                    found.append(asset)
                continue
            found.extend(_collect_assets(item, path=f'{path}[{index}]'))
        return found

    return found


def _coerce_asset(*, value: str, path: str, key_hint: str) -> dict[str, str] | None:
    text = value.strip()
    if not text:
        return None

    if '://' in text:
        if not text.startswith('https://'):
            raise ValueError(f'Only public https URLs are allowed in JSON mode. Invalid asset at {path}.')
        parsed = urlparse(text)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f'Invalid asset URL at {path}.')
        return {
            'url': text,
            'kind': _classify_asset_kind(text, key_hint),
            'path': path,
        }

    lowered = text.lower()
    if text.startswith(LOCAL_PATH_PREFIXES) or lowered.startswith('gs://') or lowered.startswith('file://'):
        raise ValueError(f'Local or private storage paths are not allowed in JSON mode. Invalid asset at {path}.')

    if key_hint in URL_HINT_KEYS:
        raise ValueError(f'Asset URLs in JSON mode must be public https links. Invalid asset at {path}.')

    return None


def _classify_asset_kind(url: str, key_hint: str) -> str:
    parsed = urlparse(url)
    lowered_path = parsed.path.lower()
    for extension in IMAGE_EXTENSIONS:
        if lowered_path.endswith(extension):
            return 'image'
    for extension in VIDEO_EXTENSIONS:
        if lowered_path.endswith(extension):
            return 'video'
    if 'video' in key_hint:
        return 'video'
    if 'image' in key_hint:
        return 'image'
    return 'unknown'


def _extract_distinct_prompt_details(shots: list[dict[str, Any]]) -> dict[str, list[str]]:
    def values_for(key: str) -> list[str]:
        values: list[str] = []
        for shot in shots:
            value = str(shot.get(key) or '').strip()
            if value and value not in values:
                values.append(value)
        return values

    return {
        'camera_movements': values_for('camera_movement')[:6],
        'lenses': values_for('lens')[:6],
        'effects': values_for('effects')[:6],
        'audio_intents': values_for('audio_intent')[:6],
    }


def _build_structured_prompt_summary(shots: list[dict[str, Any]]) -> str:
    shape_label = 'shot' if len(shots) == 1 else 'shots'
    highlights = []
    extracted = _extract_distinct_prompt_details(shots)
    if extracted['camera_movements']:
        highlights.append(f"Camera movement: {extracted['camera_movements'][0]}")
    if extracted['lenses']:
        highlights.append(f"Lens: {extracted['lenses'][0]}")
    if extracted['effects']:
        highlights.append(f"Effects: {extracted['effects'][0]}")
    if extracted['audio_intents']:
        highlights.append(f"Audio: {extracted['audio_intents'][0]}")
    suffix = f" {' | '.join(highlights)}" if highlights else ''
    return f"Structured JSON prompt with {len(shots)} {shape_label}.{suffix}".strip()


def _build_provider_safe_prompt(shots: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for index, shot in enumerate(shots, start=1):
        lines = [f'Shot {index}:']
        if shot.get('composition'):
            lines.append(f"Composition: {shot['composition']}.")
        if shot.get('camera_movement'):
            lines.append(f"Camera movement: {shot['camera_movement']}.")
        if shot.get('lens'):
            lines.append(f"Lens: {shot['lens']}.")
        if shot.get('lighting'):
            lines.append(f"Lighting: {shot['lighting']}.")
        if shot.get('subject'):
            lines.append(f"Subject: {shot['subject']}.")
        if shot.get('environment'):
            lines.append(f"Environment: {shot['environment']}.")
        if shot.get('action'):
            lines.append(f"Action: {shot['action']}.")
        if shot.get('effects'):
            lines.append(f"Effects: {shot['effects']}.")
        if shot.get('color_palette'):
            lines.append(f"Color palette: {shot['color_palette']}.")
        if shot.get('framing'):
            lines.append(f"Framing: {shot['framing']}.")
        if shot.get('tone'):
            lines.append(f"Tone: {shot['tone']}.")
        if shot.get('shutter'):
            lines.append(f"Shutter: {shot['shutter']}.")
        if shot.get('audio_intent'):
            lines.append(f"Audio intent: {shot['audio_intent']}.")
        blocks.append(' '.join(lines))
    return '\n\n'.join(blocks).strip()


def _coerce_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _pick_text(*values: Any) -> str:
    for value in values:
        if isinstance(value, str):
            normalized = ' '.join(value.strip().split())
            if normalized:
                return normalized
    return ''


def _format_labeled_value(label: str, value: Any) -> str:
    text = _pick_text(value)
    if not text:
        return ''
    return f'{label}: {text}'


def _join_parts(*values: str) -> str:
    return ' '.join(part.strip() for part in values if str(part).strip()).strip()


def _shot_has_meaning(shot: dict[str, Any]) -> bool:
    return any(str(shot.get(key) or '').strip() for key in shot)
