from __future__ import annotations

import hashlib
import json
from pathlib import Path

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.influencer_repository import InfluencerRepository
from app.models.entities import InfluencerPersona
from app.providers.storage import build_storage_provider
from app.services.asset_tagging_service import AssetTaggingService
from app.services.image_generation_service import IMAGE_MODEL_REGISTRY, ImageGenerationService

POSE_OPTIONS = [
    {'key': 'standing_confident', 'label': 'Standing confident', 'description': 'Strong posture, direct presence, editorial energy.'},
    {'key': 'sitting_casual', 'label': 'Sitting casual', 'description': 'Relaxed seated pose with approachable body language.'},
    {'key': 'walking_urban', 'label': 'Walking urban', 'description': 'Dynamic movement through a city or street-style scene.'},
    {'key': 'speaking_on_stage', 'label': 'Speaking on stage', 'description': 'Public-speaking energy with expressive gestures.'},
    {'key': 'gym_pose', 'label': 'Gym pose', 'description': 'Athletic frame, fitness posture, active confidence.'},
    {'key': 'office_pose', 'label': 'Office pose', 'description': 'Professional creator posture in a work setting.'},
    {'key': 'custom', 'label': 'Custom', 'description': 'User-defined body position while keeping identity locked.'},
]

SCENE_PRESETS = [
    {'key': 'luxury_office', 'label': 'Luxury office', 'description': 'High-end executive office with premium warm lighting.', 'environment': 'high-end executive office with glass walls, premium desk styling, and layered depth', 'props': 'desk accessories, premium chair, subtle decor', 'lighting': 'warm cinematic office light', 'mood': 'authoritative and premium', 'negative_constraints': 'do not alter facial structure or identity'},
    {'key': 'street_style', 'label': 'Street style', 'description': 'Urban background, edgy styling, social-first energy.', 'environment': 'urban street-style environment with strong depth, textures, and editorial city backdrop', 'props': 'street signage, curb textures, fashion-forward street elements', 'lighting': 'soft urban daylight with contrast', 'mood': 'bold and social-first', 'negative_constraints': 'do not change face, hairstyle, or skin tone'},
    {'key': 'podcast_studio', 'label': 'Podcast studio', 'description': 'Studio mic setup, mood lighting, creator atmosphere.', 'environment': 'professional podcast studio with acoustic treatment and creator desk setup', 'props': 'microphones, headphones, mixer, subtle screens', 'lighting': 'controlled neon-accent studio light', 'mood': 'creator-focused and intimate', 'negative_constraints': 'keep character identity fixed'},
    {'key': 'beach_sunset', 'label': 'Beach sunset', 'description': 'Golden hour seaside mood with cinematic depth.', 'environment': 'beachfront setting at sunset with layered horizon and premium vacation feel', 'props': 'subtle shoreline detail and soft wind movement cues', 'lighting': 'golden hour sunset glow', 'mood': 'aspirational and serene', 'negative_constraints': 'identity must remain unchanged'},
    {'key': 'gym', 'label': 'Gym', 'description': 'Modern training environment with fitness-focused energy.', 'environment': 'premium modern gym interior with depth and athletic atmosphere', 'props': 'machines, weights, reflective surfaces', 'lighting': 'clean directional fitness lighting', 'mood': 'disciplined and energetic', 'negative_constraints': 'do not distort face or body identity'},
    {'key': 'tech_conference', 'label': 'Tech conference', 'description': 'Stage lighting, screens, and startup-event polish.', 'environment': 'technology event stage with large screens and audience-facing space', 'props': 'presentation screens, subtle stage monitors, event branding cues', 'lighting': 'conference stage light with premium contrast', 'mood': 'visionary and high-status', 'negative_constraints': 'keep identity markers fixed'},
    {'key': 'luxury_penthouse', 'label': 'Luxury penthouse', 'description': 'Skyline-facing penthouse with premium interior styling.', 'environment': 'luxury penthouse interior overlooking a city skyline', 'props': 'designer furniture, glass, marble details', 'lighting': 'soft premium interior light with skyline glow', 'mood': 'elite and aspirational', 'negative_constraints': 'do not alter the face or hairstyle'},
    {'key': 'rooftop_night', 'label': 'Rooftop night', 'description': 'Night skyline, city lights, and cinematic evening contrast.', 'environment': 'rooftop setting with panoramic city skyline at night', 'props': 'architectural ledges, skyline bokeh, subtle nightlife cues', 'lighting': 'night city glow with cinematic contrast', 'mood': 'confident and editorial', 'negative_constraints': 'maintain facial identity exactly'},
    {'key': 'creator_desk', 'label': 'Creator desk', 'description': 'Modern creator setup with screens, notebooks, and soft studio glow.', 'environment': 'modern creator desk scene with premium productivity setup', 'props': 'screen, notebook, camera gear, coffee mug', 'lighting': 'soft studio desk light', 'mood': 'focused and thoughtful', 'negative_constraints': 'keep identity consistent'},
    {'key': 'fashion_studio', 'label': 'Fashion studio', 'description': 'Editorial photo studio with clean backdrops and polished lighting.', 'environment': 'editorial fashion studio with clean premium backdrop', 'props': 'minimal set pieces only', 'lighting': 'high-end editorial studio lighting', 'mood': 'fashion-forward and sharp', 'negative_constraints': 'face and identity cannot drift'},
    {'key': 'cafe_meeting', 'label': 'Cafe meeting', 'description': 'Premium cafe atmosphere with warm natural light and lifestyle energy.', 'environment': 'premium cafe environment with layered depth and lifestyle textures', 'props': 'coffee cup, table setting, soft background activity', 'lighting': 'warm natural afternoon light', 'mood': 'approachable and aspirational', 'negative_constraints': 'do not change face or identity'},
    {'key': 'co_working_space', 'label': 'Co-working space', 'description': 'Collaborative startup environment with glass walls and active work mood.', 'environment': 'modern co-working office with startup energy and team atmosphere', 'props': 'laptops, glass walls, collaborative desks', 'lighting': 'bright modern office light', 'mood': 'ambitious and active', 'negative_constraints': 'keep identity locked'},
    {'key': 'newsroom_set', 'label': 'Newsroom set', 'description': 'Broadcast-style set with screens, anchor lighting, and authority.', 'environment': 'broadcast newsroom or media set with authority-driven composition', 'props': 'news screens, desk, broadcast accents', 'lighting': 'controlled anchor-style light', 'mood': 'credible and commanding', 'negative_constraints': 'do not alter facial structure'},
    {'key': 'private_jet', 'label': 'Private jet', 'description': 'High-status travel backdrop with luxury seating and aspirational mood.', 'environment': 'private jet cabin with luxury travel styling', 'props': 'premium seating, windows, subtle travel accessories', 'lighting': 'soft luxury interior light', 'mood': 'high-status and aspirational', 'negative_constraints': 'identity must remain fixed'},
    {'key': 'wellness_retreat', 'label': 'Wellness retreat', 'description': 'Calm resort environment with organic textures and restorative light.', 'environment': 'luxury wellness retreat with natural textures and calm surroundings', 'props': 'minimal organic decor, soft nature details', 'lighting': 'restorative soft daylight', 'mood': 'peaceful and premium', 'negative_constraints': 'keep facial features unchanged'},
]


class InfluencerService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = InfluencerRepository(db)
        self.settings = get_settings()
        self.storage = build_storage_provider(self.settings)
        self.image_service = ImageGenerationService(db)
        self.tagging = AssetTaggingService(db)

    def list_personas(self, user_id: str) -> list[InfluencerPersona]:
        return self.repo.list_by_user(user_id)

    def get_persona(self, persona_id: str, user_id: str) -> InfluencerPersona:
        persona = self.repo.get_for_user(persona_id, user_id)
        if not persona:
            raise LookupError('Influencer persona not found')
        return persona

    def create_persona(self, user_id: str, **fields) -> InfluencerPersona:
        personality_traits = fields.get('personality_traits') or []
        system_prompt = self._build_system_prompt_template(
            name=fields['name'],
            tone=fields.get('tone'),
            traits=personality_traits,
            visual_description=fields.get('visual_description', ''),
            catchphrase=fields.get('catchphrase'),
            backstory=fields.get('backstory'),
            gender_identity=fields.get('gender_identity'),
            niche=fields.get('niche'),
        )
        embedding = self._make_style_embedding_vector(
            fields['name'],
            fields.get('visual_description', ''),
            personality_traits,
            fields.get('tone') or '',
        )
        return self.repo.create(
            user_id=user_id,
            name=fields['name'],
            gender_identity=fields.get('gender_identity'),
            niche=fields.get('niche'),
            tone=fields.get('tone'),
            catchphrase=fields.get('catchphrase'),
            personality_traits=json.dumps(personality_traits),
            backstory=fields.get('backstory'),
            visual_description=fields.get('visual_description', ''),
            reference_image_url=None,
            reference_image_path=None,
            reference_embedding_vector=None,
            style_embedding_vector=json.dumps(embedding),
            system_prompt_template=system_prompt,
            character_locked=fields.get('character_locked', True),
        )

    def update_persona(self, persona_id: str, user_id: str, **fields) -> InfluencerPersona:
        persona = self.get_persona(persona_id, user_id)
        personality_traits = fields.get('personality_traits') or []
        updated = self.repo.update(
            persona,
            name=fields['name'],
            gender_identity=fields.get('gender_identity'),
            niche=fields.get('niche'),
            tone=fields.get('tone'),
            catchphrase=fields.get('catchphrase'),
            personality_traits=json.dumps(personality_traits),
            backstory=fields.get('backstory'),
            visual_description=fields.get('visual_description', ''),
            system_prompt_template=self._build_system_prompt_template(
                name=fields['name'],
                tone=fields.get('tone'),
                traits=personality_traits,
                visual_description=fields.get('visual_description', ''),
                catchphrase=fields.get('catchphrase'),
                backstory=fields.get('backstory'),
                gender_identity=fields.get('gender_identity'),
                niche=fields.get('niche'),
            ),
            style_embedding_vector=json.dumps(
                self._make_style_embedding_vector(
                    fields['name'],
                    fields.get('visual_description', ''),
                    personality_traits,
                    fields.get('tone') or '',
                )
            ),
            character_locked=fields.get('character_locked', True),
        )
        return updated

    def upload_reference_image(
        self,
        persona_id: str,
        user_id: str,
        *,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> InfluencerPersona:
        persona = self.get_persona(persona_id, user_id)
        uploaded = self.storage.upload_bytes(
            filename,
            content,
            content_type=content_type,
            kind='influencer-references',
        )
        embedding = self._make_reference_embedding(content, uploaded.public_url)
        return self.repo.update(
            persona,
            reference_image_url=uploaded.public_url,
            reference_image_path=uploaded.storage_path,
            reference_embedding_vector=json.dumps(embedding),
        )

    def lock_reference(self, persona_id: str, user_id: str) -> InfluencerPersona:
        persona = self.get_persona(persona_id, user_id)
        if not persona.reference_image_url:
            raise ValueError('Upload a reference image before locking identity')
        if not persona.reference_embedding_vector:
            embedding = self._make_reference_embedding(b'', persona.reference_image_url)
            persona = self.repo.update(persona, reference_embedding_vector=json.dumps(embedding))
        return self.repo.update(persona, character_locked=True)

    def generate_content(self, persona_id: str, user_id: str, *, intent: str, platform: str) -> dict:
        persona = self.get_persona(persona_id, user_id)
        system_prompt = persona.system_prompt_template or self._build_system_prompt_template(
            name=persona.name,
            tone=persona.tone,
            traits=self._decode_list(persona.personality_traits),
            visual_description=persona.visual_description,
            catchphrase=persona.catchphrase,
            backstory=persona.backstory,
            gender_identity=persona.gender_identity,
            niche=persona.niche,
        )
        tags = self._extract_tags(intent, persona)
        if self.settings.openai_api_key:
            try:
                client = OpenAI(api_key=self.settings.openai_api_key)
                response = client.chat.completions.create(
                    model=self.settings.openai_model,
                    temperature=0.7,
                    response_format={'type': 'json_object'},
                    messages=[
                        {'role': 'system', 'content': system_prompt},
                        {
                            'role': 'user',
                            'content': (
                                'Create structured influencer content JSON with keys: '
                                'title, intro, content_blocks, motivational_close, cta.\n'
                                f'Platform: {platform}\n'
                                f'Intent: {intent}'
                            ),
                        },
                    ],
                )
                raw = response.choices[0].message.content or '{}'
                parsed = json.loads(raw)
                return {
                    'title': str(parsed.get('title', '')).strip() or f'{persona.name}: {platform.title()} Drop',
                    'intro': str(parsed.get('intro', '')).strip() or f'{persona.name} enters with a fresh take on {intent}.',
                    'content_blocks': [str(item).strip() for item in parsed.get('content_blocks', []) if str(item).strip()],
                    'motivational_close': str(parsed.get('motivational_close', '')).strip() or f'{persona.name} leaves the audience energised.',
                    'cta': str(parsed.get('cta', '')).strip() or 'Follow for the next chapter.',
                    'tags': tags,
                }
            except Exception:
                pass

        return {
            'title': f'{persona.name} on {platform.title()}',
            'intro': f'{persona.name} frames a compelling take on {intent}.',
            'content_blocks': [
                f'Lead with the {persona.tone or "signature"} energy that defines the persona.',
                f'Anchor the message in {persona.niche or "the chosen niche"} with a concrete point of view.',
                f'Keep the phrasing aligned to {", ".join(self._decode_list(persona.personality_traits)[:3]) or "the stored personality traits"}.',
            ],
            'motivational_close': f'{persona.name} closes with clarity, confidence, and emotional pull.',
            'cta': persona.catchphrase or 'Stay tuned for the next post.',
            'tags': tags,
        }

    def generate_consistent_image(
        self,
        persona_id: str,
        user_id: str,
        *,
        pose: str,
        scene: str,
        custom_pose: str | None,
        model_key: str,
        aspect_ratio: str,
        resolution: str,
    ):
        persona = self.get_persona(persona_id, user_id)
        if not persona.reference_image_url:
            raise ValueError('Upload a reference image before generating persona images')

        pose_text = custom_pose.strip() if pose == 'custom' and custom_pose else pose.replace('_', ' ')
        scene_data = self._resolve_scene(scene, user_id=user_id, persona_id=persona_id)
        prompt = self._build_image_prompt(persona, pose_text, scene_data)
        generation = self.image_service.create_image(
            user_id=user_id,
            model_key=model_key,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_urls=[persona.reference_image_url],
        )
        self.tagging.repo.add_tags(
            asset_id=generation.id,
            asset_type='image',
            tags=self._extract_tags(f'{pose_text} {scene_data.get("label") or scene}', persona),
            source='auto',
        )
        return generation

    def list_pose_options(self) -> list[dict[str, str]]:
        return POSE_OPTIONS

    def list_scene_presets(self) -> list[dict[str, str]]:
        return SCENE_PRESETS

    def list_scene_library(self, user_id: str, persona_id: str | None = None) -> list[dict[str, str | bool | None]]:
        custom_scenes = self.repo.list_scene_presets(user_id, persona_id)
        system_items = [
            {
                'id': None,
                'key': item['key'],
                'label': item['label'],
                'description': item['description'],
                'environment': item.get('environment'),
                'props': item.get('props'),
                'lighting': item.get('lighting'),
                'mood': item.get('mood'),
                'negative_constraints': item.get('negative_constraints'),
                'is_system': True,
            }
            for item in SCENE_PRESETS
        ]
        custom_items = [
            {
                'id': item.id,
                'key': item.key,
                'label': item.label,
                'description': item.description,
                'environment': item.environment,
                'props': item.props,
                'lighting': item.lighting,
                'mood': item.mood,
                'negative_constraints': item.negative_constraints,
                'is_system': item.is_system,
            }
            for item in custom_scenes
        ]
        return [*custom_items, *system_items]

    def create_scene_preset(
        self,
        user_id: str,
        *,
        persona_id: str | None,
        label: str,
        description: str,
        environment: str,
        props: str | None,
        lighting: str | None,
        mood: str | None,
        negative_constraints: str | None,
    ) -> dict[str, str | bool | None]:
        key_source = f'{label}-{environment}'
        key = hashlib.sha256(key_source.encode('utf-8')).hexdigest()[:16]
        created = self.repo.create_scene_preset(
            user_id=user_id,
            persona_id=persona_id,
            key=f'custom_{key}',
            label=label,
            description=description,
            environment=environment,
            props=props,
            lighting=lighting,
            mood=mood,
            negative_constraints=negative_constraints,
            is_system=False,
        )
        return {
            'id': created.id,
            'key': created.key,
            'label': created.label,
            'description': created.description,
            'environment': created.environment,
            'props': created.props,
            'lighting': created.lighting,
            'mood': created.mood,
            'negative_constraints': created.negative_constraints,
            'is_system': created.is_system,
        }

    def _build_image_prompt(self, persona: InfluencerPersona, pose: str, scene: dict[str, str | None]) -> str:
        lock_clause = (
            'Never change facial structure, hairstyle, skin tone, or identity markers. '
            if persona.character_locked
            else ''
        )
        scene_block = (
            f"Scene environment: {scene.get('environment') or scene.get('label')}. "
            f"Scene props: {scene.get('props') or 'keep props minimal and supportive'}. "
            f"Lighting: {scene.get('lighting') or 'cinematic premium light'}. "
            f"Mood: {scene.get('mood') or 'confident and polished'}. "
        )
        negative_constraints = scene.get('negative_constraints') or 'Do not alter face, hairstyle, or core identity.'
        return (
            f'{persona.system_prompt_template or ""}\n'
            f'Create a consistent influencer image of {persona.name}. '
            f'Pose: {pose}. '
            f'{scene_block}'
            'Change only pose, body language, background, lighting, and scene mood as required. '
            f'{lock_clause}'
            f'{negative_constraints} '
            'Keep clothing style consistent unless scene requires a believable variation.'
        ).strip()

    def _resolve_scene(self, scene: str, *, user_id: str, persona_id: str) -> dict[str, str | None]:
        for item in self.list_scene_library(user_id, persona_id):
            label = item.get('label')
            if item.get('key') == scene or (isinstance(label, str) and label.lower() == scene.lower()):
                return {
                    'label': str(label),
                    'environment': item.get('environment') if isinstance(item.get('environment'), (str, type(None))) else None,
                    'props': item.get('props') if isinstance(item.get('props'), (str, type(None))) else None,
                    'lighting': item.get('lighting') if isinstance(item.get('lighting'), (str, type(None))) else None,
                    'mood': item.get('mood') if isinstance(item.get('mood'), (str, type(None))) else None,
                    'negative_constraints': item.get('negative_constraints') if isinstance(item.get('negative_constraints'), (str, type(None))) else None,
                }
        return {
            'label': scene,
            'environment': scene,
            'props': None,
            'lighting': None,
            'mood': None,
            'negative_constraints': None,
        }

    def _build_system_prompt_template(
        self,
        *,
        name: str,
        tone: str | None,
        traits: list[str],
        visual_description: str,
        catchphrase: str | None,
        backstory: str | None,
        gender_identity: str | None,
        niche: str | None,
    ) -> str:
        bullets = [
            f'You are {name}.',
            f'You always speak with {tone or "a confident creator tone"}.',
            f'Maintain personality: {", ".join(traits) or "consistent, memorable, creator-first"}',
            f'Visual appearance: {visual_description}',
            'Never change facial structure.',
            'Keep clothing style consistent unless scene requires variation.',
        ]
        if niche:
            bullets.append(f'Niche: {niche}')
        if gender_identity:
            bullets.append(f'Identity: {gender_identity}')
        if catchphrase:
            bullets.append(f'Catchphrase: {catchphrase}')
        if backstory:
            bullets.append(f'Backstory: {backstory}')
        return '\n'.join(f'- {item}' for item in bullets)

    def _make_style_embedding_vector(self, name: str, visual_description: str, traits: list[str], tone: str) -> list[float]:
        seed = f'{name}|{visual_description}|{"|".join(traits)}|{tone}'
        digest = hashlib.sha256(seed.encode('utf-8')).digest()
        return [round((byte / 255.0), 4) for byte in digest[:16]]

    def _make_reference_embedding(self, content: bytes, image_url: str) -> list[float]:
        seed = content if content else image_url.encode('utf-8')
        digest = hashlib.sha256(seed).digest()
        return [round((byte / 255.0), 4) for byte in digest[:16]]

    def _decode_list(self, raw: str | None) -> list[str]:
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return [str(item).strip() for item in data if str(item).strip()]

    def _extract_tags(self, text: str, persona: InfluencerPersona) -> list[str]:
        tokens = [
            persona.name.lower(),
            *(trait.lower() for trait in self._decode_list(persona.personality_traits)),
            *(word.lower() for word in (persona.niche or '').split()),
            *(word.lower() for word in text.split()),
        ]
        clean = []
        for token in tokens:
            stripped = ''.join(char for char in token if char.isalnum() or char in {'-', '_'}).strip('-_')
            if len(stripped) >= 3:
                clean.append(stripped)
        return list(dict.fromkeys(clean))[:12]
