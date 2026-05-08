from __future__ import annotations

from dataclasses import asdict, dataclass, field
import re
from typing import Any
import random
from pydantic import BaseModel, Field


@dataclass(frozen=True)
class RecipeInputConfig:
    image: bool = False
    text: bool = False


@dataclass(frozen=True)
class RecipeContentConfig:
    style: str
    tone: str
    structure: tuple[str, ...]
    music: str | None = None
    reference_prompt: str | None = None
    scene_guidance: str | None = None
    seed_prompt: str | None = None


@dataclass(frozen=True)
class RecipeGenerationDefaults:
    model_key: str
    aspect_ratio: str
    resolution: str
    quality: str = 'standard'
    captions_enabled: bool = False
    narration_enabled: bool = False
    voice: str = 'Shubh'
    language: str = 'English'
    caption_style: str = 'classic'


@dataclass(frozen=True)
class RenderSceneConfig:
    scene_id: str
    beat_names: tuple[str, ...]
    duration_seconds: int


@dataclass(frozen=True)
class RecipeSceneStrategy:
    render_scenes: tuple[RenderSceneConfig, ...]


@dataclass(frozen=True)
class RecipeComposerFragment:
    type: str
    value: str | None = None
    slot_id: str | None = None


@dataclass(frozen=True)
class RecipeComposerSlot:
    id: str
    kind: str
    label: str
    placeholder: str
    required: bool = False
    options: tuple[str, ...] = ()
    sample_label: str | None = None
    sample_preview_url: str | None = None
    submit_target: str | None = None


@dataclass(frozen=True)
class RecipeComposerConfig:
    recipe_label: str
    mode: str
    fragments: tuple[RecipeComposerFragment, ...]
    slots: tuple[RecipeComposerSlot, ...]
    starter_copy: str | None = None


@dataclass(frozen=True)
class RecipeCatalogConfig:
    title: str
    slug: str
    description: str
    short_label: str
    preview_video_url: str
    preview_image_url: str
    active: bool = True
    featured: bool = False
    trending: bool = False
    order: int = 0
    tags: tuple[str, ...] = ()
    composer: RecipeComposerConfig | None = None


@dataclass(frozen=True)
class RecipeConfig:
    id: str
    type: str
    duration_seconds: int
    input: RecipeInputConfig
    config: RecipeContentConfig
    generation_defaults: RecipeGenerationDefaults
    scene_strategy: RecipeSceneStrategy
    catalog: RecipeCatalogConfig
    reference_strategy: str = 'passthrough'
    metadata: dict[str, Any] = field(default_factory=dict)


def _sample_video(path: str) -> str:
    return f'/videos/samples/{path}'


def _random_sample_video(*filenames: str) -> str:
    return _sample_video(random.choice(filenames))


def _story_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(scene_id='scene_1', beat_names=('hook', 'setup'), duration_seconds=5),
            RenderSceneConfig(scene_id='scene_2', beat_names=('payoff', 'ending'), duration_seconds=5),
        )
    )



def _explainer_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(
                scene_id='scene_1_hook',
                beat_names=('hook', 'setup'),
                duration_seconds=4,
            ),
            RenderSceneConfig(
                scene_id='scene_2_consequence',
                beat_names=('immediate_effect', 'world_impact'),
                duration_seconds=4,
            ),
            RenderSceneConfig(
                scene_id='scene_3_takeaway',
                beat_names=('takeaway', 'ending'),
                duration_seconds=4,
            ),
        )
    )


def _long_explainer_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(scene_id='scene_1_hook', beat_names=('hook',), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_2_concept_intro', beat_names=('core_idea', 'setup'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_3_mechanism', beat_names=('mechanism', 'how_it_works'), duration_seconds=8),
            RenderSceneConfig(scene_id='scene_4_example', beat_names=('example', 'real_world_context'), duration_seconds=8),
            RenderSceneConfig(scene_id='scene_5_implication', beat_names=('impact', 'why_it_matters'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_6_takeaway', beat_names=('takeaway', 'ending'), duration_seconds=8),
        )
    )


def _ugc_ad_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(scene_id='scene_1_hook', beat_names=('hook', 'pattern_interrupt'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_2_problem', beat_names=('problem', 'desire'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_3_intro', beat_names=('product_intro', 'positioning'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_4_proof', beat_names=('demo', 'proof'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_5_benefit', beat_names=('benefit', 'result'), duration_seconds=4),
            RenderSceneConfig(scene_id='scene_6_cta', beat_names=('cta', 'ending'), duration_seconds=4),
        )
    )



def _avatar_product_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(
                scene_id='scene_1_single_shot',
                beat_names=('hook', 'product_showcase', 'benefit', 'cta'),
                duration_seconds=5,
            ),
        )
    )


def _motion_control_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(
                scene_id='scene_1_motion_transfer',
                beat_names=('reference_transfer', 'dance_motion', 'ending'),
                duration_seconds=10,
            ),
        )
    )


def _ltx_cinematic_montage_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(scene_id='scene_1_establish', beat_names=('establish', 'subject_intro'), duration_seconds=8),
            RenderSceneConfig(scene_id='scene_2_hero_detail_main_proof', beat_names=('detail_texture', 'motion_variation'), duration_seconds=8),
            RenderSceneConfig(scene_id='scene_3_closing_payoff', beat_names=('closing_payoff',), duration_seconds=10),
        )
    )


def _ltx_freeform_scene_strategy() -> RecipeSceneStrategy:
    return RecipeSceneStrategy(
        render_scenes=(
            RenderSceneConfig(scene_id='scene_1_opening', beat_names=('opening',), duration_seconds=8),
            RenderSceneConfig(scene_id='scene_2_main', beat_names=('main',), duration_seconds=8),
            RenderSceneConfig(scene_id='scene_3_closing', beat_names=('closing',), duration_seconds=8),
        )
    )


PIXVERSE_ANIME_MOTION_MAP: dict[str, tuple[str, ...]] = {
    'ride': (
        'rides a skateboard downhill',
        'skates forward downhill with smooth control',
        'glides downhill on a skateboard with confident motion',
    ),
    'walk': (
        'walks slowly forward',
        'walks ahead with a gentle steady pace',
        'moves forward on foot with calm measured steps',
    ),
    'run': (
        'runs forward with dynamic motion',
        'sprints ahead with strong forward momentum',
        'runs through the scene with energetic motion',
    ),
    'fly': (
        'flies smoothly through the air',
        'glides forward through open air with graceful motion',
        'soars through the air with smooth controlled movement',
    ),
    'stand': (
        'stands calmly with subtle motion',
        'holds a calm standing pose with restrained movement',
        'stands in place with subtle natural motion',
    ),
}

PIXVERSE_ANIME_SCENE_MAP: dict[str, dict[str, str]] = {
    'ride': {
        'coastal': 'a coastal road with ocean waves, seaside houses, electric poles, and palm trees',
        'mountains': 'a mountain road with hills, trees, mist, and winding paths',
        'city': 'an urban street with buildings, traffic lights, and passing cars',
        'grassland': 'a narrow path through open grass fields under a wide sky',
        'fantasy': 'a glowing fantasy pathway with magical elements and a surreal atmosphere',
    },
    'walk': {
        'coastal': 'a seaside promenade with ocean breeze, calm waves, and coastal houses',
        'mountains': 'a quiet mountain path with hills, trees, mist, and scenic bends',
        'city': 'a calm urban street with storefronts, traffic lights, and passing city motion',
        'grassland': 'open grass fields with a wide sky and gentle natural depth',
        'fantasy': 'a dreamy fantasy landscape with glowing details and magical ambience',
    },
    'run': {
        'coastal': 'a fast-moving seaside path with ocean spray, palm trees, and coastal depth',
        'mountains': 'a winding mountain trail with hills, trees, mist, and layered terrain',
        'city': 'a lively urban street with buildings, traffic lights, and dynamic city energy',
        'grassland': 'expansive grass fields with open terrain and strong forward depth',
        'fantasy': 'a vivid fantasy world with glowing structures and magical motion trails',
    },
    'fly': {
        'coastal': 'the open coastal air above the shoreline, rolling waves, rooftops below, electric poles, and palm trees',
        'mountains': 'high mountain air above layered ridgelines, drifting mist, tall pines, and distant peaks',
        'city': 'the open city skyline above rooftops, distant streets below, lights, and vertical urban depth',
        'grassland': 'the broad open sky above vast grass fields, distant terrain below, and a wide horizon line',
        'fantasy': 'an elevated magical sky with floating glow, suspended fantasy elements, and surreal open-air depth',
    },
    'stand': {
        'coastal': 'a coastal overlook with ocean, waves, seaside houses, and palm trees',
        'mountains': 'a mountain viewpoint with hills, trees, mist, and scenic depth',
        'city': 'an urban spot with buildings, traffic lights, and subtle city movement',
        'grassland': 'open grass fields with a wide sky and peaceful natural atmosphere',
        'fantasy': 'a glowing fantasy setting with magical details and ambient motion',
    },
}

PIXVERSE_ANIME_VIBE_MAP: dict[str, tuple[str, ...]] = {
    'lofi': (
        'warm sunlight, soft clouds, lofi calm vibe, hand-painted anime style',
        'golden light, airy clouds, mellow lofi energy, hand-painted anime style',
        'gentle daylight, soft cloud texture, calm lofi atmosphere, hand-painted anime style',
    ),
    'cinematic': (
        'dramatic lighting, cinematic depth, high contrast',
        'rich contrast, dramatic light shaping, cinematic visual depth',
        'bold lighting separation, premium cinematic depth, confident contrast',
    ),
    'dreamy': (
        'soft glow, pastel tones, dreamy atmosphere',
        'pastel light, gentle bloom, and a dreamy floating atmosphere',
        'soft radiant glow, airy pastel color, dreamy visual mood',
    ),
}

PIXVERSE_ANIME_CAMERA_MAP: dict[str, tuple[str, ...]] = {
    'ride': (
        'Camera follows from behind with a slightly elevated angle, tracking with smooth forward momentum.',
        'Camera tracks from a rear three-quarter angle with steady travel motion and controlled downhill flow.',
        'Camera follows from behind with a premium gliding track that keeps the skateboard motion readable.',
    ),
    'walk': (
        'Camera follows gently from behind at a relaxed elevated angle, drifting smoothly with the character.',
        'Camera tracks at a soft rear angle with calm movement and gentle forward continuity.',
        'Camera follows with a light elevated drift, keeping the walking pace natural and composed.',
    ),
    'run': (
        'Camera tracks closely from behind with energetic forward motion and stronger speed emphasis.',
        'Camera follows from behind with tighter framing and dynamic forward tracking.',
        'Camera tracks with confident pace from the rear, emphasizing speed while keeping the subject clear.',
    ),
    'fly': (
        'Camera glides behind and slightly below, tracking smoothly through open air with gentle aerial motion and visible altitude.',
        'Camera follows through the air from a soft rear angle, holding a graceful airborne trajectory above the environment below.',
        'Camera drifts behind the character in open sky, maintaining elegant aerial tracking, clear lift, and strong horizon separation.',
    ),
    'stand': (
        'Camera holds a stable cinematic frame with subtle drift and soft environmental parallax.',
        'Camera stays mostly locked with a restrained cinematic float and light parallax.',
        'Camera keeps a composed hero frame with only subtle ambient drift in the scene.',
    ),
}

PIXVERSE_ANIME_INTERACTION_MAP: dict[str, tuple[str, ...]] = {
    'ride': (
        'Stable body posture, clear contact with the board, and natural interaction with the path.',
        'Keep the stance balanced, the skateboard readable, and the path interaction believable.',
        'Maintain strong posture, clean board control, and natural response to the downhill route.',
    ),
    'walk': (
        'Stable body posture, natural foot placement, and clear interaction with the environment.',
        'Keep the gait natural, posture steady, and contact with the ground believable.',
        'Maintain calm balance, readable steps, and grounded interaction with the surroundings.',
    ),
    'run': (
        'Stable body posture, clear forward energy, and natural interaction with the terrain.',
        'Keep the sprint posture readable, momentum strong, and ground interaction believable.',
        'Maintain energetic running form with clean forward drive and stable anatomy.',
    ),
    'fly': (
        'Stable body posture, balanced airborne movement, clear separation from the environment below, and no implied ground contact.',
        'Maintain controlled airborne balance, clean silhouette, obvious lift away from the ground, and believable suspended posture.',
        'Keep the flying posture graceful, stable, clearly suspended in open space, and fully detached from the terrain beneath.',
    ),
    'stand': (
        'Stable body posture, subtle motion in hair and clothing, and clear environmental presence.',
        'Keep the pose composed and grounded while the environment carries gentle ambient movement.',
        'Maintain a calm hero stance with small natural motion in hair, fabric, and atmosphere.',
    ),
}

PIXVERSE_QUALITY_TO_RESOLUTION: dict[str, str] = {
    'standard': '360p',
    'high': '540p',
    'premium': '720p',
}

PIXVERSE_ALLOWED_DURATIONS = {'5', '10'}
PIXVERSE_ALLOWED_QUALITIES = frozenset(PIXVERSE_QUALITY_TO_RESOLUTION.keys())
PIXVERSE_ALLOWED_AUDIO_MODES = {'silent', 'auto_scene_sound'}
PIXVERSE_ALLOWED_SCENES = frozenset(next(iter(PIXVERSE_ANIME_SCENE_MAP.values())).keys())
MOTION_CONTROL_DANCE_STYLE_OPTIONS = {
    'bollywood': 'Bollywood',
    'hip-hop': 'Hip-Hop',
    'hip hop': 'Hip-Hop',
    'funny': 'Funny',
    'anime': 'Anime',
    'cinematic': 'Cinematic',
    'cute': 'Cute',
    'chaotic': 'Chaotic',
}
MOTION_CONTROL_CHARACTER_ENERGY_OPTIONS = {
    'playful': 'Playful',
    'cute': 'Cute',
    'epic': 'Epic',
    'funny': 'Funny',
    'aggressive': 'Aggressive',
    'elegant': 'Elegant',
    'goofy': 'Goofy',
}
MOTION_CONTROL_VISUAL_STYLE_OPTIONS = {
    'realistic': 'Realistic',
    'anime': 'Anime',
    '3d cartoon': '3D Cartoon',
    '3d_cartoon': '3D Cartoon',
    'cinematic': 'Cinematic',
    'meme style': 'Meme Style',
    'meme_style': 'Meme Style',
}
MOTION_CONTROL_FIDELITY_OPTIONS = {
    'strict': 'Strict',
    'balanced': 'Balanced',
    'stylized': 'Stylized',
}
MOTION_CONTROL_ORIENTATION_OPTIONS = frozenset({'video', 'image'})
MOTION_CONTROL_ALLOWED_ASPECT_RATIOS = frozenset({'9:16', '16:9', '1:1'})
AVATAR_PRODUCT_MODEL_TO_RESOLUTION: dict[str, str] = {
    'fal_ltx23_i2v': '1080p',
    'seedance_v1_lite_reference': '720p',
    'kling_o3_reference': '720p',
    'kling_o3_standard_reference': '720p',
    'kling_o3_pro_reference': '720p',
    'kling_o3_4k_reference': '1080p',
    'kling_v16_standard_elements': '720p',
    'kling_v16_pro_elements': '720p',
}


class AnimeLofiQwenExpansion(BaseModel):
    environment_flavor: str = Field(default='', max_length=180)
    atmosphere_flavor: str = Field(default='', max_length=180)
    camera_texture: str = Field(default='', max_length=180)


@dataclass(frozen=True)
class AnimeLofiPromptPackage:
    prompt: str
    metadata: dict[str, Any]


PIXVERSE_ANIME_SCENE_DETAIL_VARIANTS: dict[str, tuple[str, ...]] = {
    'coastal': (
        'sunlit reflections across the water and soft motion in the palm trees',
        'a breezy shoreline mood with layered depth from rooftops to the sea',
        'clean coastal openness with distant waves and bright airy spacing',
    ),
    'mountains': (
        'misty depth between the ridgelines with soft layered distance',
        'cool mountain air, scenic elevation, and gentle haze across the hills',
        'clear terrain separation with atmospheric depth through the landscape',
    ),
    'city': (
        'subtle urban glow, layered street depth, and believable background motion',
        'clean city perspective with signs, lights, and soft movement around the subject',
        'structured urban depth with readable buildings and grounded visual rhythm',
    ),
    'grassland': (
        'open airy space with natural depth and soft movement across the field',
        'broad horizon lines with gentle wind and layered environmental openness',
        'peaceful natural spacing with clean foreground-to-background separation',
    ),
    'fantasy': (
        'luminous magical particles and soft surreal depth in the environment',
        'glowing fantasy accents with layered mystical atmosphere',
        'dreamlike environmental depth with subtle magical motion in the background',
    ),
}

PIXVERSE_ANIME_CAMERA_TEXTURE_VARIANTS: dict[str, tuple[str, ...]] = {
    'ride': (
        'Keep the motion readable and cinematic without shaking the frame.',
        'Maintain smooth travel energy with clean tracking and no abrupt camera swings.',
    ),
    'walk': (
        'Keep the pacing gentle and visually readable with calm camera movement.',
        'Let the frame breathe with smooth motion and soft, natural continuity.',
    ),
    'run': (
        'Keep the speed energetic but readable, with strong forward momentum and clean framing.',
        'Emphasize motion intensity without breaking the silhouette or environment clarity.',
    ),
    'fly': (
        'Preserve a floating, weightless feeling with elegant aerial continuity and clean altitude drift.',
        'Keep the airborne motion graceful and stable with clear open-space separation and visible lift above the scene.',
    ),
    'stand': (
        'Let the image feel alive through subtle ambient motion rather than travel.',
        'Keep the frame composed and premium with very restrained movement.',
    ),
}

PIXVERSE_ANIME_FLY_SCENE_DETAIL_VARIANTS: dict[str, tuple[str, ...]] = {
    'coastal': (
        'wide shoreline spacing, sea breeze, and layered depth from bright water to rooftops below',
        'open air above the coast with gentle altitude, distant surf, and soft palm movement beneath',
        'clean airborne coastal depth with sunlight on the sea and visible separation above the shoreline',
    ),
    'mountains': (
        'mist layers drifting between ridgelines with strong altitude and deep sky separation',
        'open alpine air, distant peaks, and visible height above the mountain landscape below',
        'broad mountain sky depth with soft haze, elevated perspective, and clear spacing above the terrain',
    ),
    'city': (
        'layered rooftop depth, distant streets below, and clean skyline spacing around the character',
        'open urban air above the city grid with visible height and soft light across the rooftops',
        'clear skyline separation with vertical city depth and the ground kept far below the subject',
    ),
    'grassland': (
        'broad horizon depth, open wind, and strong separation above the fields below',
        'wide sky openness with distant terrain beneath and clean elevated spacing around the character',
        'airy natural depth with visible altitude above the grassland and a long horizon line',
    ),
    'fantasy': (
        'floating magical depth with suspended glow, airy currents, and layered open sky',
        'elevated fantasy atmosphere with drifting luminous particles and clear airborne spacing',
        'surreal sky depth with magical air currents and a visibly suspended environment below',
    ),
}


def _clean_anime_lofi_expansion_text(value: str) -> str:
    return re.sub(r'\s+', ' ', str(value or '').strip()).strip(' .')


def _compose_sentence_parts(*parts: str) -> str:
    normalized = [_clean_anime_lofi_expansion_text(part) for part in parts if _clean_anime_lofi_expansion_text(part)]
    if not normalized:
        return ''
    return ', '.join(normalized)


def build_pixverse_anime_lofi_prompt_package(
    *,
    motion: str,
    scene: str,
    vibe: str,
    expansion: AnimeLofiQwenExpansion | None = None,
    randomizer: random.Random | None = None,
) -> AnimeLofiPromptPackage:
    chooser = randomizer or random
    motion_phrase = chooser.choice(PIXVERSE_ANIME_MOTION_MAP[motion])
    scene_phrase = PIXVERSE_ANIME_SCENE_MAP[motion][scene]
    camera_phrase = chooser.choice(PIXVERSE_ANIME_CAMERA_MAP[motion])
    interaction_phrase = chooser.choice(PIXVERSE_ANIME_INTERACTION_MAP[motion])
    scene_detail_variants = (
        PIXVERSE_ANIME_FLY_SCENE_DETAIL_VARIANTS[scene]
        if motion == 'fly'
        else PIXVERSE_ANIME_SCENE_DETAIL_VARIANTS[scene]
    )
    scene_detail_phrase = chooser.choice(scene_detail_variants)
    camera_texture_phrase = chooser.choice(PIXVERSE_ANIME_CAMERA_TEXTURE_VARIANTS[motion])
    vibe_phrase = chooser.choice(PIXVERSE_ANIME_VIBE_MAP[vibe])

    qwen_environment_flavor = _clean_anime_lofi_expansion_text(expansion.environment_flavor) if expansion else ''
    qwen_atmosphere_flavor = _clean_anime_lofi_expansion_text(expansion.atmosphere_flavor) if expansion else ''
    qwen_camera_texture = _clean_anime_lofi_expansion_text(expansion.camera_texture) if expansion else ''

    environment_sentence = _compose_sentence_parts(
        scene_detail_phrase,
        qwen_environment_flavor,
        qwen_atmosphere_flavor,
    )
    camera_texture_sentence = _compose_sentence_parts(
        camera_texture_phrase,
        qwen_camera_texture,
    )

    prompt_parts = [
        f'@character {motion_phrase} through {scene_phrase}.',
        camera_phrase,
        interaction_phrase,
    ]
    if environment_sentence:
        prompt_parts.append(f'{environment_sentence}.')
    if camera_texture_sentence:
        prompt_parts.append(f'{camera_texture_sentence}.')
    prompt_parts.append(f'{vibe_phrase}.')
    prompt_parts.append('Maintain exact character identity, no distortion.')

    return AnimeLofiPromptPackage(
        prompt=' '.join(part.strip() for part in prompt_parts if part.strip()),
        metadata={
            'motion': motion,
            'scene': scene,
            'vibe': vibe,
            'selected_motion_phrase': motion_phrase,
            'selected_scene_phrase': scene_phrase,
            'selected_camera_phrase': camera_phrase,
            'selected_interaction_phrase': interaction_phrase,
            'selected_scene_detail_phrase': scene_detail_phrase,
            'selected_camera_texture_phrase': camera_texture_phrase,
            'selected_vibe_phrase': vibe_phrase,
            'qwen_expansion_used': bool(expansion and any([
                qwen_environment_flavor,
                qwen_atmosphere_flavor,
                qwen_camera_texture,
            ])),
            'qwen_environment_flavor': qwen_environment_flavor,
            'qwen_atmosphere_flavor': qwen_atmosphere_flavor,
            'qwen_camera_texture': qwen_camera_texture,
        },
    )


def build_pixverse_anime_lofi_prompt(*, motion: str, scene: str, vibe: str) -> str:
    return build_pixverse_anime_lofi_prompt_package(
        motion=motion,
        scene=scene,
        vibe=vibe,
        randomizer=random.Random(0),
    ).prompt


def _normalize_pixverse_audio_mode(value: Any) -> str:
    normalized = str(value or '').strip().lower() or 'silent'
    if normalized not in PIXVERSE_ALLOWED_AUDIO_MODES:
        raise ValueError('PixVerse audio mode must be silent or auto_scene_sound')
    return normalized


def _extract_prompt_refs(prompt: str) -> set[str]:
    return {match.group(1).strip().lower() for match in re.finditer(r'@([a-zA-Z0-9_]+)', prompt or '') if match.group(1).strip()}


def _build_pixverse_image_references(*, subject_image: str, background_image: str | None = None) -> list[dict[str, str]]:
    references = [
        {
            'ref_name': 'subject',
            'type': 'subject',
            'image_url': subject_image,
        }
    ]
    if background_image:
        references.append(
            {
                'ref_name': 'background',
                'type': 'background',
                'image_url': background_image,
            }
        )
    return references

RECIPES: dict[str, RecipeConfig] = {
    'spongebob_challenge': RecipeConfig(
        id='spongebob_challenge',
        type='video',
        duration_seconds=10,
        input=RecipeInputConfig(image=True),
        config=RecipeContentConfig(
            style='playful_underwater_cartoon_pet',
            tone='fun_lighthearted_recognisable',
            music='playful',
            structure=('intro', 'playful_motion', 'funny_action', 'ending'),
            reference_prompt=(
                'Use the uploaded pet image as the inspiration for the main animated character. '
                'Create a cute, highly stylized cartoon version of the same pet while keeping it recognisably based on the uploaded animal. '
                'Preserve the pet’s core identity cues such as fur colour family, ear shape, face feel, overall species, and friendly personality. '
                'It is okay to exaggerate proportions, add cute costume styling, and make the subject dance or perform in a playful challenge scene. '
                'Do not replace the pet with an unrelated mascot, different species, human-like hero, or random cartoon figure.'
            ),
            scene_guidance=(
                'Create a fun, highly stylized cartoon pet performance with smooth motion and strong character consistency. '
                'The animated character should feel clearly inspired by the uploaded pet across all scenes. '
                'Use a smooth intro, playful middle action, and a clean natural outro. '
                'Avoid abrupt cuts, identity drift, warped anatomy, or switching into an unrelated character.'
            ),
            seed_prompt='Create a 10 second playful underwater cartoon pet video using the provided pet image.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=RecipeSceneStrategy(
            render_scenes=(
                RenderSceneConfig(
                    scene_id='scene_intro_transformation',
                    beat_names=('intro', 'transformation'),
                    duration_seconds=5,
                ),
                RenderSceneConfig(
                    scene_id='scene_funny_action_ending',
                    beat_names=('funny_action', 'ending'),
                    duration_seconds=5,
                ),
            )
        ),
        catalog=RecipeCatalogConfig(
            title='Spongebob Challenge',
            slug='spongebob-challenge',
            description='Upload a pet and turn it into a bright, meme-ready challenge clip with playful cartoon motion.',
            short_label='Fun',
            preview_video_url=_sample_video('creator111.mp4'),
            preview_image_url=_sample_video('creator-launch.png'),
            active=False,
            featured=False,
            trending=False,
            order=10,
            tags=('all', 'trending', 'entertainment', 'character'),
            composer=RecipeComposerConfig(
                recipe_label='Spongebob Challenge',
                mode='video',
                starter_copy='Drop in a pet image and we will do the rest.',
                fragments=(
                    RecipeComposerFragment(type='slot', slot_id='upload_pet_image'),
                    RecipeComposerFragment(type='text', value=' get a Spongebob challenge video.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='upload_pet_image',
                        kind='upload',
                        label='Upload a pet image',
                        placeholder='Upload a pet image',
                        required=True,
                        sample_label='Sample pet image',
                        sample_preview_url=_sample_video('creator-launch.png'),
                        submit_target='image',
                    ),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={'starter_badge': 'Pet challenge', 'version': 2},
    ),
    'time_echo_explainer': RecipeConfig(
        id='time_echo_explainer',
        type='video',
        duration_seconds=12,
        input=RecipeInputConfig(image=False, text=True),
        config=RecipeContentConfig(
            style='cinematic_social_explainer',
            tone='clear_engaging_social_first',
            music='soft_documentary_underscore',
            structure=('hook', 'setup', 'immediate_effect', 'escalation', 'world_impact', 'human_impact', 'takeaway', 'ending'),
            reference_prompt=(
                'Turn the user topic into a meaningful short explainer reel for social media. '
                'Focus on one clear cause-and-effect progression. '
                'The visuals should help viewers understand the topic, not just admire cinematic atmosphere.'
            ),
            scene_guidance=(
                'Create a narrated explainer with clear scene-by-scene progression. '
                'Each scene must support the explanation directly, use smooth transitions, and avoid repeating generic filler visuals. '
                'Prioritize clarity, consequence, progression, and social-media retention.'
            ),
            seed_prompt='Create a 12 second narrated Time Echo explainer reel based on the provided topic.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_explainer_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Time Echo Explainer',
            slug='time-echo-explainer',
            description='Turn any topic into a social-ready narrated explainer reel with strong hook, consequences, and takeaway.',
            short_label='Explainer',
            preview_video_url=_sample_video('time-echo-explainer.mp4'),
            preview_image_url=_sample_video('earth.png'),
            active=True,
            featured=True,
            trending=True,
            order=21,
            tags=('all', 'trending', 'explainer', 'voiceover', 'education'),
            composer=RecipeComposerConfig(
                recipe_label='Time Echo Explainer',
                mode='video',
                starter_copy='Add a topic or question. The recipe turns it into a short social explainer with hook, impact, and takeaway.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Explain '),
                    RecipeComposerFragment(type='slot', slot_id='text'),
                    RecipeComposerFragment(type='text', value=' as a short social-ready narrated reel.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='text',
                        kind='text',
                        label='Topic or concept',
                        placeholder='What if Earth stopped spinning for 5 seconds?',
                        required=True,
                    ),
                ),
            ),
        ),
        reference_strategy='none',
        metadata={'starter_badge': 'Narrated', 'version': 2},
    ),
    'deep_dive_explainer': RecipeConfig(
        id='deep_dive_explainer',
        type='video',
        duration_seconds=36,
        input=RecipeInputConfig(image=False, text=True),
        config=RecipeContentConfig(
            style='cinematic_social_explainer',
            tone='clear_patient_visual_teaching',
            music='soft_documentary_underscore',
            structure=('hook', 'concept_intro', 'mechanism', 'example', 'implication', 'takeaway', 'ending'),
            reference_prompt=(
                'Turn the topic into a longer visual explainer for short-form platforms. '
                'Make each scene teach one clear part of the idea, with concrete visual metaphors and understandable progression.'
            ),
            scene_guidance=(
                'Create a longer narrated explainer with visual teaching clarity. '
                'Each scene should introduce a clear concept, then connect it to the next scene naturally. '
                'Avoid abstract filler, unrelated gadgets, or generic cinematic inserts that do not help explain the topic.'
            ),
            seed_prompt='Create a 36 second narrated explainer reel based on the provided topic.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_long_explainer_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Deep Dive Explainer',
            slug='deep-dive-explainer',
            description='Explain bigger topics with a longer Sora-based visual narrative, more scenes, and clearer teaching.',
            short_label='Deep dive',
            preview_video_url=_sample_video('explain-gravity-simply.mp4'),
            preview_image_url=_sample_video('earth.png'),
            active=True,
            featured=True,
            trending=False,
            order=22,
            tags=('all', 'explainer', 'education', 'voiceover', 'deep_dive'),
            composer=RecipeComposerConfig(
                recipe_label='Deep Dive Explainer',
                mode='video',
                starter_copy='Use this for topics that need more time, more scenes, and a clearer step-by-step explanation.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Explain '),
                    RecipeComposerFragment(type='slot', slot_id='text'),
                    RecipeComposerFragment(type='text', value=' as a longer visual explainer video.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='text',
                        kind='text',
                        label='Topic or concept',
                        placeholder='Explain the human brain like I am 12 years old',
                        required=True,
                    ),
                ),
            ),
        ),
        reference_strategy='none',
        metadata={
            'starter_badge': 'Longer explainers',
            'version': 2,
            'default_explainer_style': 'educational',
            'supported_explainer_styles': (
                'educational',
                'cinematic_educational',
                'simple_for_kids',
                'science_documentary',
            ),
        },
    ),
    'ugc_ad': RecipeConfig(
        id='ugc_ad',
        type='video',
        duration_seconds=24,
        input=RecipeInputConfig(image=False, text=True),
        config=RecipeContentConfig(
            style='creator_native_ugc_ad',
            tone='conversational_mobile_first_conversion_oriented',
            music='light_modern_creator_bed',
            structure=('hook', 'problem', 'product_intro', 'proof', 'benefit', 'cta', 'ending'),
            reference_prompt=(
                'Turn the user prompt into a native-feeling vertical UGC ad. '
                'Prioritize quick clarity, visible product/service value, creator-style realism, and a strong close.'
            ),
            scene_guidance=(
                'Create a vertical mobile-first UGC ad with clear hook, fast product visibility, believable proof, and a calm CTA close. '
                'Avoid polished TV-commercial framing, fake stock-footage drift, or product reveal happening too late.'
            ),
            seed_prompt='Create a 24 second vertical UGC product ad based on the provided product or service brief.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_ugc_ad_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='UGC Ad',
            slug='ugc-ad',
            description='Generate a mobile-first creator-style product or service ad with hook, proof, benefits, and CTA.',
            short_label='UGC ad',
            preview_video_url=_sample_video('time-echo-explainer.mp4'),
            preview_image_url=_sample_video('creator-launch.png'),
            active=False,
            featured=False,
            trending=False,
            order=23,
            tags=('all', 'ads', 'ugc', 'performance', 'creator', 'vertical'),
            composer=RecipeComposerConfig(
                recipe_label='UGC Ad',
                mode='video',
                starter_copy='Describe the product, service, audience, and main promise. The recipe will turn it into a creator-style ad.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Create a UGC ad for '),
                    RecipeComposerFragment(type='slot', slot_id='text'),
                    RecipeComposerFragment(type='text', value=' optimized for short-form mobile placements.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='text',
                        kind='text',
                        label='Product or service brief',
                        placeholder='a protein-rich instant breakfast for busy college students',
                        required=True,
                    ),
                ),
            ),
        ),
        reference_strategy='none',
        metadata={
            'starter_badge': 'Agency-ready',
            'version': 1,
            'default_ugc_style': 'creator_casual',
            'supported_ugc_styles': (
                'creator_casual',
                'premium_ugc',
                'testimonial',
                'documentary_social',
                'offer_heavy_performance_ad',
            ),
            'supported_client_brief_categories': (
                'dental clinic',
                'salon / beauty studio',
                'skincare product',
                'gym / fitness studio',
                'restaurant / cafe',
                'local repair service',
                'local clinic',
                'coaching / education center',
                'app/software service',
                'e-commerce product',
            ),
        },
    ),
    'avatar_product': RecipeConfig(
        id='avatar_product',
        type='video',
        duration_seconds=5,
        input=RecipeInputConfig(image=True, text=True),
        config=RecipeContentConfig(
            style='avatar_led_product_ugc',
            tone='conversational_creator_style_product_promo',
            music='light_modern_creator_bed',
            structure=('single_shot_hook', 'product_reveal', 'benefit', 'cta'),
            reference_prompt=(
                'Use the uploaded product image as the primary product reference. '
                'Create a vertical avatar-led product ad where the product remains recognisable and naturally visible. '
                'Preserve the product’s key appearance cues such as shape, color family, packaging feel, and core identity. '
                'Do not replace the product with a different unrelated object.'
            ),
            scene_guidance=(
                'Create one continuous vertical mobile-first avatar product ad, not a multi-scene montage. '
                'Keep the same spokesperson identity and the exact uploaded product visible in one continuous shot. '
                'The creator should naturally present the product, complete one clear hero reveal, and close with a soft recommendation. '
                'Avoid cuts, b-roll, scene changes, stock-footage drift, delayed product reveal, or TV-commercial polish.'
            ),
            seed_prompt='Create a 5 to 10 second single-shot avatar-led product ad using the uploaded product image and product brief.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='seedance_v1_lite_reference',
            aspect_ratio='9:16',
            resolution='720p',
            quality='affordable',
            captions_enabled=False,
            narration_enabled=True,
            voice='Kore',
            language='Hindi (India)',
            caption_style='classic',
        ),
        scene_strategy=_avatar_product_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Product Ad with AI Creator',
            slug='product-ad-creator',
            description='Indian AI creator promotes your product',
            short_label='Creator ad',
            preview_video_url=_random_sample_video(
                'ugc_ad_preview.mp4',
                'ugc_avtaar_product_ad.mp4',
            ),
            preview_image_url=_sample_video('ugc_avtaar_product_ad.mp4'),
            active=True,
            featured=True,
            trending=True,
            order=24,
            tags=('all', 'ads', 'ugc', 'avatar', 'product', 'vertical'),
            composer=RecipeComposerConfig(
                recipe_label='Avatar Product',
                mode='video',
                starter_copy='Upload the product image and add a short product brief. The recipe turns it into an avatar-led product ad.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Create an avatar product ad for '),
                    RecipeComposerFragment(type='slot', slot_id='text'),
                    RecipeComposerFragment(type='text', value=' using '),
                    RecipeComposerFragment(type='slot', slot_id='image'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='text',
                        kind='text',
                        label='Product brief',
                        placeholder='a lightweight glow serum for busy working women',
                        required=True,
                    ),
                    RecipeComposerSlot(
                        id='image',
                        kind='upload',
                        label='Upload product image',
                        placeholder='Upload product image',
                        required=True,
                        sample_label='Sample product image',
                        sample_preview_url=_sample_video('creator-launch.png'),
                        submit_target='image',
                    ),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={
            'starter_badge': 'Avatar-led',
            'version': 1,
            'default_avatar_style': 'creator_casual',
            'supports_product_image': True,
        },
    ),
    'make_anything_dance': RecipeConfig(
        id='make_anything_dance',
        type='video',
        duration_seconds=10,
        input=RecipeInputConfig(image=False, text=False),
        config=RecipeContentConfig(
            style='reference_driven_motion_control_dance',
            tone='playful_social_first_viral',
            structure=('character_image', 'dance_video', 'keep_original_sound'),
            scene_guidance=(
                'Reference-driven motion transfer. The uploaded dance video controls choreography, rhythm, timing, and pacing. '
                'The system should primarily preserve character identity, body structure, choreography timing, and smooth full-body readability.'
            ),
            seed_prompt='Turn the uploaded character into a viral dance reel using the uploaded dance video as the choreography source.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='kling_v26_standard_motion_control',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=False,
            narration_enabled=False,
            voice='Kore',
            language='English (India)',
            caption_style='classic',
        ),
        scene_strategy=_motion_control_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Make Anything Dance',
            slug='make-anything-dance',
            description='Upload a character image and a dance video. Your character performs the same moves.',
            short_label='Dance',
            preview_video_url=_sample_video('panda_dancing.mp4'),
            preview_image_url=_sample_video('panda_dancing.mp4'),
            active=True,
            featured=True,
            trending=True,
            order=25,
            tags=('all', 'trending', 'dance', 'motion_control', 'viral', 'reference', 'fun'),
            composer=RecipeComposerConfig(
                recipe_label='Make Anything Dance',
                mode='video',
                starter_copy='Best results: Use a clear character image and a dance video with one clearly visible dancer. Full-body dance videos work best.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Make '),
                    RecipeComposerFragment(type='slot', slot_id='character_image'),
                    RecipeComposerFragment(type='text', value=' dance using '),
                    RecipeComposerFragment(type='slot', slot_id='dance_video'),
                    RecipeComposerFragment(type='text', value=' and keep original audio '),
                    RecipeComposerFragment(type='slot', slot_id='keep_original_sound'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='character_image',
                        kind='reference-image',
                        label='Upload character image',
                        placeholder='Upload character image',
                        required=True,
                        submit_target='image',
                    ),
                    RecipeComposerSlot(
                        id='dance_video',
                        kind='upload',
                        label='Upload dance video',
                        placeholder='Upload dance video',
                        required=True,
                        submit_target='video',
                    ),
                    RecipeComposerSlot(id='keep_original_sound', kind='select', label='Keep original audio', placeholder='Keep original audio?', required=True, options=('on', 'off')),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={
            'starter_badge': 'Viral',
            'version': 1,
            'recipe_family': 'motion_control_dance',
            'recipe_version': 'v1',
            'generation_mode': 'reference_driven',
            'max_duration_seconds': 40,
        },
    ),
    'anime_lofi_reel': RecipeConfig(
        id='anime_lofi_reel',
        type='video',
        duration_seconds=5,
        input=RecipeInputConfig(image=False, text=False),
        config=RecipeContentConfig(
            style='anime_lofi_reference_reel',
            tone='guided_anime_motion_prompt_builder',
            structure=('character', 'motion', 'scene', 'vibe'),
            scene_guidance='Guided anime reference-to-video reel using a character image and structured motion/scene/vibe controls.',
            seed_prompt='Create a cinematic anime-style reel from the supplied character image.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='pixverse_c1_reference',
            aspect_ratio='9:16',
            resolution='360p',
            quality='standard',
            captions_enabled=False,
            narration_enabled=False,
            voice='Kore',
            language='English (India)',
            caption_style='classic',
        ),
        scene_strategy=_story_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Anime Lofi Reel',
            slug='anime-lofi-reel',
            description='Create cinematic anime-style reels from your character image.',
            short_label='Anime',
            preview_video_url=_sample_video('anime_lofi_reel.mp4'),
            preview_image_url=_sample_video('anime_lofi_reel.mp4'),
            active=True,
            featured=True,
            trending=False,
            order=26,
            tags=('all', 'ads', 'anime', 'reference', 'pixverse'),
            composer=RecipeComposerConfig(
                recipe_label='Anime Lofi Reel',
                mode='video',
                starter_copy='Upload one character image, then choose the motion, scene, vibe, duration, and quality. Prompting stays fully guided here.',
                fragments=(
                    RecipeComposerFragment(type='slot', slot_id='character_image'),
                    RecipeComposerFragment(type='text', value=' in a '),
                    RecipeComposerFragment(type='slot', slot_id='vibe'),
                    RecipeComposerFragment(type='text', value=' anime reel where the character '),
                    RecipeComposerFragment(type='slot', slot_id='motion'),
                    RecipeComposerFragment(type='text', value=' through a '),
                    RecipeComposerFragment(type='slot', slot_id='scene'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='character_image',
                        kind='reference-image',
                        label='Upload character image',
                        placeholder='Upload character image',
                        required=True,
                        submit_target='image',
                    ),
                    RecipeComposerSlot(id='motion', kind='select', label='Motion', placeholder='Choose motion', required=True, options=('ride', 'walk', 'run', 'fly', 'stand')),
                    RecipeComposerSlot(id='scene', kind='select', label='Scene', placeholder='Choose scene', required=True, options=('coastal', 'mountains', 'city', 'grassland', 'fantasy')),
                    RecipeComposerSlot(id='vibe', kind='select', label='Vibe', placeholder='Choose vibe', required=True, options=('lofi', 'cinematic', 'dreamy')),
                    RecipeComposerSlot(id='duration_seconds', kind='select', label='Duration', placeholder='Choose duration', required=True, options=('5', '10')),
                    RecipeComposerSlot(id='quality_profile', kind='select', label='Quality', placeholder='Choose quality', required=True, options=('standard', 'high', 'premium')),
                ),
            ),
        ),
        reference_strategy='pixverse_character',
        metadata={
            'starter_badge': 'Anime',
            'version': 1,
            'pixverse_mode': 'recipe',
        },
    ),
    'reference_video_generator_advanced': RecipeConfig(
        id='reference_video_generator_advanced',
        type='video',
        duration_seconds=5,
        input=RecipeInputConfig(image=False, text=False),
        config=RecipeContentConfig(
            style='pixverse_reference_advanced',
            tone='advanced_reference_video_control',
            structure=('references', 'custom_prompt', 'duration', 'quality'),
            scene_guidance='Advanced reference-to-video flow with up to two references and direct prompt control.',
            seed_prompt='Generate a PixVerse reference video from the supplied references and custom prompt.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='pixverse_c1_reference',
            aspect_ratio='9:16',
            resolution='360p',
            quality='standard',
            captions_enabled=False,
            narration_enabled=False,
            voice='Kore',
            language='English (India)',
            caption_style='classic',
        ),
        scene_strategy=_story_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Reference Video Generator (Advanced)',
            slug='reference-video-generator-advanced',
            description='Use 1–2 reference images with your own prompt for controlled PixVerse reference video generation.',
            short_label='Advanced',
            preview_video_url=_sample_video('hindi-festival-9x16.mp4'),
            preview_image_url=_sample_video('earth.png'),
            active=True,
            featured=False,
            trending=False,
            order=27,
            tags=('all', 'ads', 'reference', 'advanced', 'pixverse'),
            composer=RecipeComposerConfig(
                recipe_label='Reference Video Generator (Advanced)',
                mode='video',
                starter_copy='Use @subject in your prompt, and @background only if you upload a second reference. Best results come from 1–2 references and simple motion.',
                fragments=(
                    RecipeComposerFragment(type='slot', slot_id='subject_image'),
                    RecipeComposerFragment(type='text', value=' with optional '),
                    RecipeComposerFragment(type='slot', slot_id='background_image'),
                    RecipeComposerFragment(type='text', value=' to create '),
                    RecipeComposerFragment(type='slot', slot_id='custom_prompt'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(
                        id='subject_image',
                        kind='reference-image',
                        label='Upload subject reference',
                        placeholder='Upload subject reference',
                        required=True,
                        submit_target='image',
                    ),
                    RecipeComposerSlot(
                        id='background_image',
                        kind='reference-image',
                        label='Optional background reference',
                        placeholder='Upload background reference',
                        required=False,
                        submit_target='image',
                    ),
                    RecipeComposerSlot(
                        id='custom_prompt',
                        kind='text',
                        label='Custom prompt',
                        placeholder='Example: @subject walks through a neon alley while @background anchors the environment.',
                        required=True,
                    ),
                    RecipeComposerSlot(id='duration_seconds', kind='select', label='Duration', placeholder='Choose duration', required=True, options=('5', '10')),
                    RecipeComposerSlot(id='quality_profile', kind='select', label='Quality', placeholder='Choose quality', required=True, options=('standard', 'high', 'premium')),
                ),
            ),
        ),
        reference_strategy='pixverse_advanced',
        metadata={
            'starter_badge': 'Advanced',
            'version': 1,
            'pixverse_mode': 'advanced',
            'warning': 'Best results with 1–2 references and simple motion.',
        },
    ),
    'ltx_cinematic_montage_v1': RecipeConfig(
        id='ltx_cinematic_montage_v1',
        type='video',
        duration_seconds=26,
        input=RecipeInputConfig(image=False, text=False),
        config=RecipeContentConfig(
            style='cinematic_realistic_stitched_montage',
            tone='calm_reflective_continuity_first',
            music=None,
            structure=('establish', 'hero_detail_main_proof', 'closing_payoff'),
            reference_prompt=(
                'Build one continuous-feeling cinematic moment across three separately rendered scenes. '
                'Keep the same woman, same wardrobe, same rainy modern cafe, and same late-afternoon lighting throughout.'
            ),
            scene_guidance=(
                'Maintain high continuity across all stitched scenes. '
                'Keep motion subtle, action complexity low, and the final frame of each shot stitch-safe. '
                'Do not introduce lip sync, crowd choreography, or abrupt pose changes.'
            ),
            seed_prompt='Create an internal three-scene LTX cinematic montage benchmark in a rainy modern cafe.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='ltx',
            aspect_ratio='16:9',
            resolution='720p',
            quality='standard',
            captions_enabled=False,
            narration_enabled=False,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_ltx_cinematic_montage_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='LTX Cinematic Montage Benchmark',
            slug='ltx-cinematic-montage-v1',
            description='Internal stitched-scene benchmark for self-hosted LTX continuity testing.',
            short_label='Internal',
            preview_video_url=_sample_video('hindi-festival-9x16.mp4'),
            preview_image_url=_sample_video('creator-launch.png'),
            active=False,
            featured=False,
            trending=False,
            order=999,
            tags=('internal', 'benchmark', 'ltx', 'scene_stitch'),
            composer=None,
        ),
        reference_strategy='none',
        metadata={
            'internal_only': True,
            'benchmark_family': 'ltx_cinematic_montage',
            'benchmark_version': 1,
            'render_mode': 'scene_stitch',
        },
    ),
    'ltx_storyboard_v1': RecipeConfig(
        id='ltx_storyboard_v1',
        type='video',
        duration_seconds=24,
        input=RecipeInputConfig(image=False, text=True),
        config=RecipeContentConfig(
            style='ltx_storyboard_scene_stitch',
            tone='continuity_first_cinematic_productized',
            music=None,
            structure=('opening', 'main', 'closing'),
            reference_prompt=(
                'Build one continuous-feeling 3-scene stitched LTX video from the user prompt. '
                'Preserve subject, environment, wardrobe, emotional tone, and visual continuity across all scenes.'
            ),
            scene_guidance=(
                'Use only three scenes, keep motion smooth and controlled, avoid abrupt cuts or action spikes, '
                'and end each scene in a stitch-safe way.'
            ),
            seed_prompt='Create a stitched 3-scene LTX video from the provided prompt.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='ltx',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=False,
            narration_enabled=False,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_ltx_freeform_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='LTX Storyboard',
            slug='ltx-storyboard-v1',
            description='Internal 3-scene stitched LTX flow for composer-driven videos.',
            short_label='Internal',
            preview_video_url=_sample_video('english-startup-16x9.mp4'),
            preview_image_url=_sample_video('creator-launch.png'),
            active=False,
            featured=False,
            trending=False,
            order=1000,
            tags=('internal', 'ltx', 'scene_stitch', 'storyboard'),
            composer=None,
        ),
        reference_strategy='none',
        metadata={
            'internal_only': True,
            'ltx_mode': 'freeform_storyboard',
            'render_mode': 'scene_stitch',
        },
    ),
    'viral_dance_clip': RecipeConfig(
        id='viral_dance_clip',
        type='video',
        duration_seconds=10,
        input=RecipeInputConfig(text=True),
        config=RecipeContentConfig(
            style='viral_dance_clip',
            tone='cute_high_energy',
            music='playful',
            structure=('hook', 'groove', 'hero_move', 'ending'),
            scene_guidance='Keep it adorable, rhythmic, and instantly shareable with loop-friendly movement.',
            seed_prompt='Create a viral dance clip using the given subject and dance style.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_story_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Viral Dance Clip',
            slug='viral-dance-clip',
            description='Turn a simple character idea into a short-form dance clip built for retention and reposts.',
            short_label='Fun',
            preview_video_url=_sample_video('lip-sync.mp4'),
            preview_image_url=_sample_video('creator-launch.png'),
            active=True,
            featured=True,
            trending=True,
            order=30,
            tags=('all', 'trending', 'entertainment', 'character'),
            composer=RecipeComposerConfig(
                recipe_label='Viral Dance Clip',
                mode='video',
                starter_copy='Add the subject and dance vibe. The recipe shapes the rhythm and payoff.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Turn '),
                    RecipeComposerFragment(type='slot', slot_id='subject'),
                    RecipeComposerFragment(type='text', value=' into a viral dance clip with '),
                    RecipeComposerFragment(type='slot', slot_id='dance_style'),
                    RecipeComposerFragment(type='text', value=' energy.'),
                ),
                slots=(
                    RecipeComposerSlot(id='subject', kind='text', label='Subject', placeholder='golden retriever, panda mascot, baby dancer', required=True),
                    RecipeComposerSlot(id='dance_style', kind='text', label='Dance style', placeholder='bhangra, freestyle groove, playful shuffle', required=True),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={'starter_badge': 'Viral', 'version': 1},
    ),
    'story_slides_reel': RecipeConfig(
        id='story_slides_reel',
        type='video',
        duration_seconds=10,
        input=RecipeInputConfig(text=True),
        config=RecipeContentConfig(
            style='story_slides_reel',
            tone='scroll_stopping',
            music='playful',
            structure=('hook', 'context', 'reveal', 'ending'),
            scene_guidance='Make the pacing crisp, social-first, and built around strong on-screen slide moments.',
            seed_prompt='Create a story slides reel from the provided topic.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_story_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Story Slides Reel',
            slug='story-slides-reel',
            description='Take a topic and turn it into a clean, high-retention slide-led story reel.',
            short_label='Story',
            preview_video_url=_sample_video('hindi-festival-9x16.mp4'),
            preview_image_url=_sample_video('cr-launch.png'),
            active=True,
            featured=True,
            trending=False,
            order=40,
            tags=('all', 'story', 'explainer'),
            composer=RecipeComposerConfig(
                recipe_label='Story Slides Reel',
                mode='video',
                starter_copy='Keep it short and sharp. The recipe turns your topic into a slide-first story.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Create a story slides reel about '),
                    RecipeComposerFragment(type='slot', slot_id='topic'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(id='topic', kind='text', label='Topic', placeholder='top 5 creator habits, a founder journey, before vs after', required=True),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={'starter_badge': 'Slides', 'version': 1},
    ),
    'character_explainer_reel': RecipeConfig(
        id='character_explainer_reel',
        type='video',
        duration_seconds=10,
        input=RecipeInputConfig(text=True),
        config=RecipeContentConfig(
            style='character_explainer_reel',
            tone='educational_personality_led',
            music='playful',
            structure=('hook', 'setup', 'explain', 'ending'),
            scene_guidance='Keep it social-first, expressive, and easy to understand with a clean final takeaway.',
            seed_prompt='Create a character explainer reel from the supplied topic.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_story_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Character Explainer Reel',
            slug='character-explainer-reel',
            description='Give a topic to a memorable character voice and turn it into a high-retention explainer reel.',
            short_label='Explainer',
            preview_video_url=_sample_video('tamil-education-9x16.mp4'),
            preview_image_url=_sample_video('earth.png'),
            active=True,
            featured=True,
            trending=False,
            order=50,
            tags=('all', 'explainer', 'character'),
            composer=RecipeComposerConfig(
                recipe_label='Character Explainer Reel',
                mode='video',
                starter_copy='Name the character and topic. The recipe shapes the script beats and reveal.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Make a character explainer reel where '),
                    RecipeComposerFragment(type='slot', slot_id='speaker'),
                    RecipeComposerFragment(type='text', value=' explains '),
                    RecipeComposerFragment(type='slot', slot_id='topic'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(id='speaker', kind='text', label='Speaker', placeholder='Hanuman, heart, mascot, Ashoka', required=True),
                    RecipeComposerSlot(id='topic', kind='text', label='Topic', placeholder='how the heart pumps blood, why creators burn out', required=True),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={'starter_badge': 'Explainer', 'version': 1},
    ),
    'client_ad_reel': RecipeConfig(
        id='client_ad_reel',
        type='video',
        duration_seconds=10,
        input=RecipeInputConfig(text=True),
        config=RecipeContentConfig(
            style='client_ad_reel',
            tone='conversion_focused_premium',
            music='playful',
            structure=('hook', 'offer', 'proof', 'cta'),
            scene_guidance='Keep it premium, commercial, and built around a strong hook plus clear call to action.',
            seed_prompt='Create a client ad reel from the supplied brief.',
        ),
        generation_defaults=RecipeGenerationDefaults(
            model_key='sora2',
            aspect_ratio='9:16',
            resolution='720p',
            quality='standard',
            captions_enabled=True,
            narration_enabled=True,
            voice='Shubh',
            language='English',
            caption_style='classic',
        ),
        scene_strategy=_story_scene_strategy(),
        catalog=RecipeCatalogConfig(
            title='Client Ad Reel',
            slug='client-ad-reel',
            description='Turn a product or service brief into a polished short-form promo with hook, offer, and CTA.',
            short_label='Ads',
            preview_video_url=_sample_video('advertisement.mp4'),
            preview_image_url=_sample_video('creator-launch.png'),
            active=True,
            featured=True,
            trending=False,
            order=60,
            tags=('all', 'ads', 'real_estate'),
            composer=RecipeComposerConfig(
                recipe_label='Client Ad Reel',
                mode='video',
                starter_copy='Add the offer and audience. The recipe builds the hook, proof, and close.',
                fragments=(
                    RecipeComposerFragment(type='text', value='Create a client ad reel for '),
                    RecipeComposerFragment(type='slot', slot_id='offer'),
                    RecipeComposerFragment(type='text', value=' targeting '),
                    RecipeComposerFragment(type='slot', slot_id='audience'),
                    RecipeComposerFragment(type='text', value='.'),
                ),
                slots=(
                    RecipeComposerSlot(id='offer', kind='text', label='Offer', placeholder='a glow serum launch, a property walkthrough, a founder-led SaaS demo', required=True),
                    RecipeComposerSlot(id='audience', kind='text', label='Audience', placeholder='young professionals, families, small business owners', required=True),
                ),
            ),
        ),
        reference_strategy='passthrough',
        metadata={'starter_badge': 'Ads', 'version': 1},
    ),
}

SURFACE_RECIPE_IDS = frozenset({'deep_dive_explainer', 'ugc_ad', 'avatar_product', 'make_anything_dance', 'anime_lofi_reel', 'reference_video_generator_advanced'})
EXPLAINER_RECIPE_IDS = frozenset({'time_echo_explainer', 'deep_dive_explainer'})
UGC_AD_RECIPE_IDS = frozenset({'ugc_ad', 'avatar_product'})
LTX_BENCHMARK_RECIPE_IDS = frozenset({'ltx_cinematic_montage_v1'})
LTX_FREEFORM_RECIPE_IDS = frozenset({'ltx_storyboard_v1'})
LTX_RECIPE_IDS = frozenset({*LTX_BENCHMARK_RECIPE_IDS, *LTX_FREEFORM_RECIPE_IDS})
STITCHED_VIDEO_RECIPE_IDS = frozenset({*EXPLAINER_RECIPE_IDS, *UGC_AD_RECIPE_IDS, *LTX_RECIPE_IDS})

EXPLAINER_INTENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r'\bexplain\b', re.IGNORECASE),
    re.compile(r'\bwhat if\b', re.IGNORECASE),
    re.compile(r'\btell me about\b', re.IGNORECASE),
    re.compile(r'\bhow does\b', re.IGNORECASE),
    re.compile(r'\bwhy does\b', re.IGNORECASE),
    re.compile(r'\beducational\b', re.IGNORECASE),
    re.compile(r'\bnarrated reel\b', re.IGNORECASE),
    re.compile(r'\bfact reel\b', re.IGNORECASE),
    re.compile(r'\bscience of\b', re.IGNORECASE),
    re.compile(r'\bhistory of\b', re.IGNORECASE),
)
STRUCTURED_SCRIPT_MARKERS: tuple[str, ...] = (
    'opening shot',
    'closing shot',
    'scene 1',
    'scene 2',
    'narrator:',
    'visual cue:',
    'camera cue:',
    'mood cue:',
)


def detect_video_intent_from_payload(payload_or_normalized: dict[str, Any] | None) -> str:
    payload = dict(payload_or_normalized or {})
    haystack = ' '.join(
        str(payload.get(key) or '')
        for key in ('template', 'templateId', 'script', 'topic', 'topicHint', 'prompt', 'title')
    ).strip()
    if any(pattern.search(haystack) for pattern in EXPLAINER_INTENT_PATTERNS):
        return 'explainer'
    return 'generic'


def _looks_like_structured_script(value: str) -> bool:
    normalized = str(value or '').lower()
    return any(marker in normalized for marker in STRUCTURED_SCRIPT_MARKERS)


def maybe_should_use_explainer_recipe(payload_or_normalized: dict[str, Any] | None) -> bool:
    payload = dict(payload_or_normalized or {})
    if payload.get('recipeId') or payload.get('recipe_id'):
        return False
    if detect_video_intent_from_payload(payload) != 'explainer':
        return False

    script = str(payload.get('script') or '').strip()
    if not script:
        return False

    # Safe to reroute only when we still have a prompt-like request instead of a fully expanded scene script.
    return not _looks_like_structured_script(script)


def normalize_explainer_video_request(payload_or_normalized: dict[str, Any] | None) -> dict[str, Any]:
    payload = dict(payload_or_normalized or {})
    normalized = dict(payload)
    normalized['voice'] = 'Shubh'
    normalized['captionsEnabled'] = True
    normalized['narrationEnabled'] = True
    normalized['durationMode'] = 'custom'
    normalized['durationSeconds'] = max(12, int(normalized.get('durationSeconds') or 0))
    return normalized


def pick_explainer_recipe_id(prompt_text: str) -> str:
    return 'deep_dive_explainer'


def build_explainer_recipe_request(prompt_text: str) -> tuple[RecipeConfig, dict[str, Any], dict[str, Any], dict[str, Any]]:
    recipe = get_recipe(pick_explainer_recipe_id(prompt_text))
    normalized_inputs = validate_recipe_inputs(recipe, {'text': str(prompt_text or '').strip()})
    normalized_payload = build_normalized_video_payload(recipe, normalized_inputs)
    normalized_payload['voice'] = 'Shubh'
    normalized_payload['captionsEnabled'] = True
    normalized_payload['narrationEnabled'] = True
    normalized_payload['durationSeconds'] = recipe.duration_seconds
    normalized_payload['durationMode'] = 'custom'
    pipeline_metadata = recipe_pipeline_metadata(recipe, normalized_inputs)
    return recipe, normalized_inputs, normalized_payload, pipeline_metadata


def should_use_ltx_storyboard_recipe(payload_or_normalized: dict[str, Any] | None) -> bool:
    payload = dict(payload_or_normalized or {})
    if payload.get('recipeId') or payload.get('recipe_id'):
        return False
    return str(payload.get('modelKey') or payload.get('model_key') or '').strip() == 'ltx'


def build_ltx_recipe_request(prompt_text: str) -> tuple[RecipeConfig, dict[str, Any], dict[str, Any], dict[str, Any]]:
    recipe = get_recipe('ltx_storyboard_v1')
    normalized_inputs = validate_recipe_inputs(recipe, {'text': str(prompt_text or '').strip()})
    normalized_payload = build_normalized_video_payload(recipe, normalized_inputs)
    normalized_payload['durationSeconds'] = recipe.duration_seconds
    normalized_payload['durationMode'] = 'custom'
    pipeline_metadata = recipe_pipeline_metadata(recipe, normalized_inputs)
    return recipe, normalized_inputs, normalized_payload, pipeline_metadata


def get_recipe(recipe_id: str) -> RecipeConfig:
    recipe = RECIPES.get(str(recipe_id or '').strip())
    if not recipe:
        raise ValueError('Unsupported recipeId')
    return recipe


def list_recipes(
    *,
    type: str | None = None,
    active: bool | None = True,
    featured: bool | None = None,
) -> list[dict[str, Any]]:
    normalized_type = (type or '').strip().lower() or None
    items: list[dict[str, Any]] = []
    for recipe in RECIPES.values():
        if recipe.id not in SURFACE_RECIPE_IDS:
            continue
        if normalized_type and recipe.type != normalized_type:
            continue
        if active is not None and recipe.catalog.active != active:
            continue
        if featured is not None and recipe.catalog.featured != featured:
            continue
        items.append(recipe_catalog_item(recipe))
    items.sort(key=lambda item: (-int(item['featured']), -int(item['trending']), int(item['order']), str(item['title']).lower()))
    return items


def recipe_catalog_item(recipe: RecipeConfig) -> dict[str, Any]:
    return {
        'id': recipe.id,
        'type': recipe.type,
        'title': recipe.catalog.title,
        'slug': recipe.catalog.slug,
        'description': recipe.catalog.description,
        'short_label': recipe.catalog.short_label,
        'preview_video_url': recipe.catalog.preview_video_url,
        'preview_image_url': recipe.catalog.preview_image_url,
        'active': recipe.catalog.active,
        'featured': recipe.catalog.featured,
        'trending': recipe.catalog.trending,
        'order': recipe.catalog.order,
        'tags': list(recipe.catalog.tags),
        'duration_seconds': recipe.duration_seconds,
        'input': asdict(recipe.input),
        'generation_defaults': asdict(recipe.generation_defaults),
        'composer': asdict(recipe.catalog.composer) if recipe.catalog.composer else None,
    }


def _normalize_motion_control_choice(value: Any, allowed: dict[str, str], *, field_name: str) -> str:
    normalized = str(value or '').strip()
    key = normalized.lower()
    if key not in allowed:
        raise ValueError(
            f"make_anything_dance {field_name} must be one of: {', '.join(sorted(set(allowed.values())))}"
        )
    return allowed[key]


def _normalize_bool_input(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or '').strip().lower()
    if not normalized:
        return default
    return normalized in {'1', 'true', 'yes', 'on', 'keep', 'enabled'}


def validate_recipe_inputs(recipe: RecipeConfig, inputs: dict[str, Any] | None) -> dict[str, Any]:
    normalized = dict(inputs or {})
    if recipe.id == 'make_anything_dance':
        character_image = str(normalized.get('character_image') or '').strip()
        dance_video = str(normalized.get('dance_video') or '').strip()
        keep_original_sound = _normalize_bool_input(normalized.get('keep_original_sound'), default=True)
        aspect_ratio = '9:16'
        duration_seconds_raw = normalized.get('duration_seconds') or normalized.get('durationSeconds') or recipe.duration_seconds
        duration_seconds = int(float(duration_seconds_raw or recipe.duration_seconds))
        has_audio = _normalize_bool_input(normalized.get('has_audio'), default=False)
        character_description = str(normalized.get('character_description') or '').strip()
        user_prompt = str(normalized.get('user_prompt') or recipe.config.seed_prompt or '').strip()

        if not character_image:
            raise ValueError('make_anything_dance requires inputs.character_image')
        if not dance_video:
            raise ValueError('make_anything_dance requires inputs.dance_video')
        if duration_seconds <= 0:
            raise ValueError('make_anything_dance duration_seconds must be greater than 0')
        if duration_seconds > 40:
            raise ValueError('Dance videos longer than 40 seconds are not supported yet.')

        normalized.update(
            {
                'character_image': character_image,
                'dance_video': dance_video,
                'dance_style': 'Funny',
                'character_energy': 'Playful',
                'visual_style': 'Realistic',
                'motion_fidelity': 'Strict',
                'character_orientation': 'video',
                'keep_original_sound': keep_original_sound,
                'aspect_ratio': aspect_ratio,
                'duration_seconds': duration_seconds,
                'has_audio': has_audio,
                'character_description': character_description,
                'user_prompt': user_prompt,
            }
        )
        return normalized

    if recipe.id == 'anime_lofi_reel':
        character_image = str(normalized.get('character_image') or '').strip()
        motion = str(normalized.get('motion') or '').strip().lower()
        scene = str(normalized.get('scene') or '').strip().lower()
        vibe = str(normalized.get('vibe') or '').strip().lower()
        duration_seconds = str(normalized.get('duration_seconds') or '').strip()
        quality_profile = str(normalized.get('quality_profile') or '').strip().lower() or 'standard'
        audio_mode = _normalize_pixverse_audio_mode(normalized.get('audio_mode'))

        if not character_image:
            raise ValueError('anime_lofi_reel requires inputs.character_image')
        if motion not in PIXVERSE_ANIME_MOTION_MAP:
            raise ValueError('anime_lofi_reel motion must be one of: ride, walk, run, fly, stand')
        if scene not in PIXVERSE_ALLOWED_SCENES:
            raise ValueError('anime_lofi_reel scene must be one of: coastal, mountains, city, grassland, fantasy')
        if vibe not in PIXVERSE_ANIME_VIBE_MAP:
            raise ValueError('anime_lofi_reel vibe must be one of: lofi, cinematic, dreamy')
        if duration_seconds not in PIXVERSE_ALLOWED_DURATIONS:
            raise ValueError('anime_lofi_reel duration_seconds must be 5 or 10')
        if quality_profile not in PIXVERSE_ALLOWED_QUALITIES:
            raise ValueError('anime_lofi_reel quality_profile must be standard, high, or premium')

        normalized.update(
            {
                'character_image': character_image,
                'motion': motion,
                'scene': scene,
                'vibe': vibe,
                'duration_seconds': duration_seconds,
                'quality_profile': quality_profile,
                'audio_mode': audio_mode,
            }
        )
        return normalized

    if recipe.id == 'reference_video_generator_advanced':
        subject_image = str(normalized.get('subject_image') or '').strip()
        background_image = str(normalized.get('background_image') or '').strip()
        custom_prompt = str(normalized.get('custom_prompt') or '').strip()
        duration_seconds = str(normalized.get('duration_seconds') or '').strip()
        quality_profile = str(normalized.get('quality_profile') or '').strip().lower() or 'standard'
        audio_mode = _normalize_pixverse_audio_mode(normalized.get('audio_mode'))

        if not subject_image:
            raise ValueError('reference_video_generator_advanced requires inputs.subject_image')
        if not custom_prompt:
            raise ValueError('reference_video_generator_advanced requires inputs.custom_prompt')
        if duration_seconds not in PIXVERSE_ALLOWED_DURATIONS:
            raise ValueError('reference_video_generator_advanced duration_seconds must be 5 or 10')
        if quality_profile not in PIXVERSE_ALLOWED_QUALITIES:
            raise ValueError('reference_video_generator_advanced quality_profile must be standard, high, or premium')

        image_references = _build_pixverse_image_references(
            subject_image=subject_image,
            background_image=background_image or None,
        )
        prompt_refs = _extract_prompt_refs(custom_prompt)
        expected_refs = {item['ref_name'] for item in image_references}
        if 'subject' not in prompt_refs:
            raise ValueError('reference_video_generator_advanced custom_prompt must include @subject')
        if not prompt_refs.issubset(expected_refs):
            raise ValueError('reference_video_generator_advanced custom_prompt contains @ref_name values that do not match uploaded references')
        if not expected_refs.issubset(prompt_refs):
            missing = ', '.join(f'@{value}' for value in sorted(expected_refs - prompt_refs))
            raise ValueError(f'reference_video_generator_advanced custom_prompt must include {missing}')

        normalized.update(
            {
                'subject_image': subject_image,
                'background_image': background_image,
                'custom_prompt': custom_prompt,
                'duration_seconds': duration_seconds,
                'quality_profile': quality_profile,
                'audio_mode': audio_mode,
            }
        )
        return normalized

    if recipe.input.image:
        image_value = normalized.get('image')
        if isinstance(image_value, list):
            image_value = next((str(item).strip() for item in image_value if str(item).strip()), '')
        if not isinstance(image_value, str) or not image_value.strip():
            raise ValueError(f'{recipe.id} requires inputs.image')
        normalized['image'] = image_value.strip()
    if recipe.input.text:
        text_value = str(normalized.get('text') or '').strip()
        if not text_value:
            raise ValueError(f'{recipe.id} requires inputs.text')
        normalized['text'] = text_value
    return normalized


def build_normalized_video_payload(
    recipe: RecipeConfig,
    inputs: dict[str, Any] | None,
    *,
    anime_prompt_package: AnimeLofiPromptPackage | None = None,
) -> dict[str, Any]:
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
    defaults = recipe.generation_defaults

    if recipe.id == 'make_anything_dance':
        duration_seconds = int(normalized_inputs.get('duration_seconds') or recipe.duration_seconds or 10)
        keep_original_sound = bool(normalized_inputs.get('keep_original_sound'))
        has_audio = bool(normalized_inputs.get('has_audio'))
        return {
            'template': recipe.catalog.title,
            'templateId': recipe.id,
            'script': str(normalized_inputs.get('user_prompt') or recipe.config.seed_prompt or 'Make the uploaded character perform the uploaded dance video.').strip(),
            'tags': [recipe.id, *list(recipe.catalog.tags)],
            'modelKey': 'kling_v26_standard_motion_control',
            'modelFamily': 'motion_control',
            'generationMode': 'image_to_video',
            'modeId': None,
            'projectId': None,
            'language': defaults.language,
            'aspectRatio': '9:16',
            'resolution': defaults.resolution,
            'quality': defaults.quality,
            'durationMode': 'custom',
            'durationSeconds': duration_seconds,
            'voice': defaults.voice,
            'imageUrls': [str(normalized_inputs['character_image']).strip()],
            'music': {'type': 'none', 'url': None},
            'audioSettings': {
                'volume': 20,
                'ducking': True,
                'sampleRateHz': 48000,
                'nativeAudioEnabled': keep_original_sound and has_audio,
            },
            'audioMode': 'auto_scene_sound' if keep_original_sound and has_audio else 'silent',
            'captionsEnabled': False,
            'captionStyle': defaults.caption_style,
            'narrationEnabled': False,
        }

    if recipe.id == 'anime_lofi_reel':
        quality_profile = str(normalized_inputs['quality_profile'])
        duration_seconds = int(str(normalized_inputs['duration_seconds']))
        prompt_package = anime_prompt_package or build_pixverse_anime_lofi_prompt_package(
            motion=str(normalized_inputs['motion']),
            scene=str(normalized_inputs['scene']),
            vibe=str(normalized_inputs['vibe']),
        )
        resolution = PIXVERSE_QUALITY_TO_RESOLUTION[quality_profile]
        character_image = str(normalized_inputs['character_image']).strip()
        image_references = [
            {
                'ref_name': 'character',
                'type': 'subject',
                'image_url': character_image,
            }
        ]
        audio_mode = str(normalized_inputs.get('audio_mode') or 'silent')
        return {
            'template': recipe.catalog.title,
            'templateId': recipe.id,
            'script': prompt_package.prompt,
            'tags': [recipe.id, *list(recipe.catalog.tags)],
            'modelKey': 'pixverse_c1_reference',
            'modeId': None,
            'projectId': None,
            'language': defaults.language,
            'aspectRatio': '9:16',
            'resolution': resolution,
            'quality': quality_profile,
            'durationMode': 'fixed',
            'durationSeconds': duration_seconds,
            'voice': defaults.voice,
            'imageUrls': [character_image],
            'imageReferences': image_references,
            'music': {'type': 'none', 'url': None},
            'audioSettings': {
                'volume': 20,
                'ducking': True,
                'sampleRateHz': 48000,
                'nativeAudioEnabled': audio_mode == 'auto_scene_sound',
            },
            'audioMode': audio_mode,
            'captionsEnabled': False,
            'captionStyle': defaults.caption_style,
            'narrationEnabled': False,
        }

    if recipe.id == 'reference_video_generator_advanced':
        quality_profile = str(normalized_inputs['quality_profile'])
        duration_seconds = int(str(normalized_inputs['duration_seconds']))
        resolution = PIXVERSE_QUALITY_TO_RESOLUTION[quality_profile]
        subject_image = str(normalized_inputs['subject_image']).strip()
        background_image = str(normalized_inputs.get('background_image') or '').strip()
        custom_prompt = str(normalized_inputs['custom_prompt']).strip()
        audio_mode = str(normalized_inputs.get('audio_mode') or 'silent')
        image_references = _build_pixverse_image_references(
            subject_image=subject_image,
            background_image=background_image or None,
        )
        return {
            'template': recipe.catalog.title,
            'templateId': recipe.id,
            'script': custom_prompt,
            'tags': [recipe.id, *list(recipe.catalog.tags)],
            'modelKey': 'pixverse_c1_reference',
            'modeId': None,
            'projectId': None,
            'language': defaults.language,
            'aspectRatio': '9:16',
            'resolution': resolution,
            'quality': quality_profile,
            'durationMode': 'fixed',
            'durationSeconds': duration_seconds,
            'voice': defaults.voice,
            'imageUrls': [item['image_url'] for item in image_references],
            'imageReferences': image_references,
            'music': {'type': 'none', 'url': None},
            'audioSettings': {
                'volume': 20,
                'ducking': True,
                'sampleRateHz': 48000,
                'nativeAudioEnabled': audio_mode == 'auto_scene_sound',
            },
            'audioMode': audio_mode,
            'captionsEnabled': False,
            'captionStyle': defaults.caption_style,
            'narrationEnabled': False,
        }

    requested_model_key = str(
        normalized_inputs.get('video_model_key')
        or normalized_inputs.get('model_key')
        or normalized_inputs.get('modelKey')
        or ''
    ).strip()
    resolved_model_key = requested_model_key or defaults.model_key

    requested_duration = str(normalized_inputs.get('duration_seconds') or '').strip()
    duration_seconds = int(requested_duration) if requested_duration.isdigit() else recipe.duration_seconds

    if recipe.id == 'avatar_product' and duration_seconds not in {5, 10}:
        duration_seconds = 5

    resolved_quality = str(
        normalized_inputs.get('quality_profile')
        or normalized_inputs.get('quality')
        or defaults.quality
    ).strip() or defaults.quality
    image_urls: list[str] = []
    if recipe.input.image and normalized_inputs.get('image'):
        image_urls.append(str(normalized_inputs['image']))

    script = str(normalized_inputs.get('text') or recipe.config.seed_prompt or f'Run the {recipe.id} recipe pipeline.').strip()
    resolved_resolution = defaults.resolution
    if recipe.id == 'avatar_product':
        resolved_resolution = AVATAR_PRODUCT_MODEL_TO_RESOLUTION.get(resolved_model_key, resolved_resolution)

    return {
        'template': recipe.catalog.title,
        'templateId': recipe.id,
        'script': script,
        'tags': [recipe.id, *list(recipe.catalog.tags)],
        'modelKey': resolved_model_key,
        'modeId': None,
        'projectId': None,
        'language': defaults.language,
        'aspectRatio': defaults.aspect_ratio,
        'resolution': resolved_resolution,
        'quality': resolved_quality,
        'durationMode': 'custom',
        'durationSeconds': duration_seconds,
        'voice': defaults.voice,
        'imageUrls': image_urls,
        'music': {
            'type': 'none',
            'url': None,
        },
        'audioSettings': {
            'volume': 20,
            'ducking': True,
            'sampleRateHz': 48000,
        },
        'captionsEnabled': defaults.captions_enabled,
        'captionStyle': defaults.caption_style,
        'narrationEnabled': defaults.narration_enabled,
    }


def recipe_pipeline_metadata(
    recipe: RecipeConfig,
    inputs: dict[str, Any] | None,
    *,
    anime_prompt_package: AnimeLofiPromptPackage | None = None,
) -> dict[str, Any]:
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
    if recipe.id == 'make_anything_dance':
        duration_seconds = int(normalized_inputs.get('duration_seconds') or recipe.duration_seconds or 10)
        return {
            'recipe_id': recipe.id,
            'recipe_type': recipe.type,
            'duration_seconds': duration_seconds,
            'reference_strategy': recipe.reference_strategy,
            'config': asdict(recipe.config),
            'generation_defaults': asdict(recipe.generation_defaults),
            'catalog': recipe_catalog_item(recipe),
            'inputs': normalized_inputs,
            'metadata': {
                **dict(recipe.metadata or {}),
                'recipe_family': 'motion_control_dance',
                'recipe_version': 'v1',
                'generation_mode': 'reference_driven',
                'keep_original_sound': bool(normalized_inputs.get('keep_original_sound')),
                'motion_reference_video_duration': duration_seconds,
                'detected_audio': bool(normalized_inputs.get('has_audio')),
                'aspect_ratio': str(normalized_inputs.get('aspect_ratio') or recipe.generation_defaults.aspect_ratio),
            },
        }
    if recipe.id in {'anime_lofi_reel', 'reference_video_generator_advanced'}:
        pixverse_metadata = {
            **dict(recipe.metadata or {}),
            'pixverse_mode': 'advanced' if recipe.id == 'reference_video_generator_advanced' else 'recipe',
            'quality_profile': str(normalized_inputs.get('quality_profile') or 'standard'),
            'resolution': PIXVERSE_QUALITY_TO_RESOLUTION[str(normalized_inputs.get('quality_profile') or 'standard')],
            'audio_mode': str(normalized_inputs.get('audio_mode') or 'silent'),
            'max_retries': 2,
        }
        if recipe.id == 'anime_lofi_reel' and anime_prompt_package:
            pixverse_metadata['anime_prompt_package'] = dict(anime_prompt_package.metadata)
        return {
            'recipe_id': recipe.id,
            'recipe_type': recipe.type,
            'duration_seconds': int(str(normalized_inputs.get('duration_seconds') or recipe.duration_seconds)),
            'reference_strategy': recipe.reference_strategy,
            'config': asdict(recipe.config),
            'generation_defaults': asdict(recipe.generation_defaults),
            'catalog': recipe_catalog_item(recipe),
            'inputs': normalized_inputs,
            'metadata': pixverse_metadata,
        }
    return {
        'recipe_id': recipe.id,
        'recipe_type': recipe.type,
        'duration_seconds': recipe.duration_seconds,
        'reference_strategy': recipe.reference_strategy,
        'scene_strategy': [
            {
                'scene_id': scene.scene_id,
                'beat_names': list(scene.beat_names),
                'duration_seconds': scene.duration_seconds,
            }
            for scene in recipe.scene_strategy.render_scenes
        ],
        'config': asdict(recipe.config),
        'generation_defaults': asdict(recipe.generation_defaults),
        'catalog': recipe_catalog_item(recipe),
        'inputs': normalized_inputs,
        'metadata': dict(recipe.metadata or {}),
    }
