from __future__ import annotations

from dataclasses import asdict, dataclass, field
import re
from typing import Any


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
            model_key='kling3',
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
            active=True,
            featured=True,
            trending=True,
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
            model_key='kling_v3',
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
            active=True,
            featured=True,
            trending=True,
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
            model_key='kling3',
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
            model_key='kling3',
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
            model_key='kling3',
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
            model_key='kling3',
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

SURFACE_RECIPE_IDS = frozenset({'deep_dive_explainer', 'ugc_ad'})
EXPLAINER_RECIPE_IDS = frozenset({'time_echo_explainer', 'deep_dive_explainer'})
UGC_AD_RECIPE_IDS = frozenset({'ugc_ad'})
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


def validate_recipe_inputs(recipe: RecipeConfig, inputs: dict[str, Any] | None) -> dict[str, Any]:
    normalized = dict(inputs or {})
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


def build_normalized_video_payload(recipe: RecipeConfig, inputs: dict[str, Any] | None) -> dict[str, Any]:
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
    defaults = recipe.generation_defaults
    resolved_model_key = defaults.model_key
    image_urls: list[str] = []
    if recipe.input.image and normalized_inputs.get('image'):
        image_urls.append(str(normalized_inputs['image']))

    script = str(normalized_inputs.get('text') or recipe.config.seed_prompt or f'Run the {recipe.id} recipe pipeline.').strip()

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
        'resolution': defaults.resolution,
        'quality': defaults.quality,
        'durationMode': 'custom',
        'durationSeconds': recipe.duration_seconds,
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


def recipe_pipeline_metadata(recipe: RecipeConfig, inputs: dict[str, Any] | None) -> dict[str, Any]:
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
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
