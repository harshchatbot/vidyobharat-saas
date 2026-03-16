from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.template_management import UnifiedTemplateResponse
from app.services.hero_template_registry import get_recommended_model_mode


@dataclass
class PromptAssemblyResult:
    master_prompt: str
    image_prompt: str | None = None
    video_prompt: str | None = None
    script_preview: str | None = None
    recommended_model_mode: str | None = None


class TemplatePromptAssembler:
    def assemble(self, *, template: UnifiedTemplateResponse, raw_inputs: dict[str, Any], prompt_override: str | None = None) -> PromptAssemblyResult:
        values = self._normalize_inputs(raw_inputs)
        self._validate_required(template, values)
        if prompt_override and prompt_override.strip():
            preview = prompt_override.strip()
            return PromptAssemblyResult(
                master_prompt=preview,
                image_prompt=preview if template.type == 'image' else None,
                video_prompt=preview if template.type == 'video' else None,
                script_preview=self._generic_script(template, preview, values) if template.type == 'video' else None,
                recommended_model_mode=template.default_model_mode,
            )

        assembler = getattr(self, f'_assemble_{template.prompt_assembler_key}', None)
        if callable(assembler):
            return assembler(template, values)
        prompt = self._fallback_prompt(template, values)
        return PromptAssemblyResult(
            master_prompt=prompt,
            image_prompt=prompt if template.type == 'image' else None,
            video_prompt=prompt if template.type == 'video' else None,
            script_preview=self._generic_script(template, prompt, values) if template.type == 'video' else None,
            recommended_model_mode=template.default_model_mode,
        )

    def _normalize_inputs(self, raw_inputs: dict[str, Any]) -> dict[str, str]:
        return {key: self._stringify(value) for key, value in raw_inputs.items() if value not in (None, '')}

    def _validate_required(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> None:
        missing = [field.label for field in template.inputs if field.required and not values.get(field.key)]
        if missing:
            raise ValueError(f"Missing template inputs: {', '.join(missing)}")

    def _stringify(self, value: Any) -> str:
        if isinstance(value, bool):
            return 'Yes' if value else 'No'
        return str(value).strip()

    def _base_blocks(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> dict[str, str]:
        platform = values.get('platform') or ', '.join(template.suggested_platforms[:1]) or 'short-form social'
        style = values.get('visualStyle') or values.get('style') or values.get('tone') or ', '.join(template.suggested_styles[:1]) or 'premium cinematic'
        quality = 'Use highly specific visual composition, platform-aware framing, premium lighting, and creator-first pacing.'
        safety = self._safety_block(template.safety_profile, values)
        return {
            'platform': platform,
            'style': style,
            'quality': quality,
            'safety': safety,
        }

    def _safety_block(self, profile: str | None, values: dict[str, str]) -> str:
        match profile or '':
            case 'educational_character_safe':
                return 'Keep the framing educational or neutral. Avoid glorification of harmful ideology, unsafe medical claims, or misleading authority cues.'
            case 'family_safe_social':
                return 'Keep the output family-safe, playful, and non-exploitative. Avoid sexualized styling or unsafe framing for children or animals.'
            case 'brand_safe_ad':
                return 'Keep the output commercially safe, brand-safe, and professional. Avoid unrealistic claims or manipulative misinformation.'
            case 'professional_information':
                return 'Keep the design clean, factual, and professional. Avoid deceptive claims or sensational misinformation.'
            case 'educational_safe':
                return 'Keep the framing informative, safe, and socially acceptable. Avoid medical misinformation or political propaganda cues.'
            case 'general_marketing_safe':
                return 'Keep the visual hook strong but commercially safe and non-deceptive.'
            case _:
                return 'Keep the output safe, platform-friendly, and commercially usable.'

    def _compose(self, *parts: str) -> str:
        return ' '.join(part.strip() for part in parts if part and part.strip())

    def _generic_script(self, template: UnifiedTemplateResponse, prompt: str, values: dict[str, str]) -> str:
        language = values.get('language') or template.generation_defaults.language or 'English'
        cta = values.get('cta') or 'Follow for more.'
        return (
            f'[Hook] {template.name}: stop the scroll with one clear promise.\n'
            f'Narrator ({language}): "{prompt}"\n\n'
            f'[Middle] Deliver the core insight with platform-aware scenes, cutaways, and on-screen text.\n'
            f'[Close] End with a strong CTA: {cta}'
        )

    def _scene_script(self, *sections: tuple[str, str]) -> str:
        return '\n\n'.join(f'[{title}]\n{body}' for title, body in sections if body.strip())

    def _fallback_prompt(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> str:
        prompt = template.prompt_template
        for field in template.inputs:
            prompt = prompt.replace('{' + field.key + '}', values.get(field.key) or field.placeholder or '')
        return self._compose(prompt, template.visual_prompt or '', template.script_hint or '')

    def _assemble_character_explainer_reel(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        speaker_type = values.get('speakerType', 'character')
        speaker_name = values.get('speakerName', 'the speaker')
        topic = values.get('topic', 'the topic')
        audience = values.get('audience', 'general audience')
        language = values.get('language', template.generation_defaults.language or 'English')
        tone = values.get('tone', 'credible and engaging')
        cta = values.get('cta', 'Follow for more')
        subtype_hook = {
            'historical_figure': f'{speaker_name} breaks down why {topic} still matters today.',
            'body_organ': f'{speaker_name} explains how {topic} works inside the body in simple language.',
            'mythology_character': f'{speaker_name} retells {topic} through a mythic first-person perspective.',
            'mascot': f'{speaker_name} makes {topic} fun and instantly understandable.',
        }.get(speaker_type, f'{speaker_name} explains {topic} with a strong first-person hook.')
        prompt = self._compose(
            f"Create a short-form explainer reel for {base['platform']} starring {speaker_name} as a {speaker_type}.",
            f"Topic: {topic}. Audience: {audience}.",
            f"Tone and visual style: {base['style']}. Voice style: {values.get('voiceStyle', 'clear and credible')}. Text overlays: {values.get('textOverlay', 'minimal but readable')}. CTA: {cta}.",
            'Structure the content with a powerful hook, 2-3 concise scene beats, explanatory narration, and a clean ending CTA.',
            base['quality'],
            base['safety'],
        )
        script_preview = self._scene_script(
            ('Hook', f'Narrator ({language}, {tone}): "{subtype_hook}"'),
            ('Scene 1', f'{speaker_name} appears on screen and frames the core question for {audience}. Use a simple analogy and one memorable visual cue tied to {topic}.'),
            ('Scene 2', f'{speaker_name} explains the main insight behind {topic} in one clear beat. Add tight camera movement, readable text overlay, and one supporting visual example.'),
            ('Scene 3', f'Wrap with a concise takeaway the audience can repeat or remember instantly. Keep the language native to {language} and conversational.'),
            ('Close', f'End with a clean CTA: "{cta}."'),
        )
        return PromptAssemblyResult(prompt, video_prompt=prompt, script_preview=script_preview, recommended_model_mode=template.default_model_mode)

    def _assemble_viral_dance_clip(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        subject = values.get('character') or values.get('subjectName') or values.get('subjectType') or 'a cute subject'
        dance_style = values.get('danceStyle', 'playful groove')
        scene_theme = values.get('sceneTheme') or values.get('backgroundTheme') or 'clean social dance set'
        music_mood = values.get('musicMood', 'upbeat')
        loop = values.get('loopPreference', 'seamless loop')
        prompt = self._compose(
            f"Create a loop-friendly viral dance clip for {base['platform']} featuring {subject}.",
            f"Dance style: {dance_style}. Scene theme: {scene_theme}. Music mood: {music_mood}.",
            f"End behavior: {loop}. Keep it instantly shareable and high-retention.",
            base['quality'],
            base['safety'],
        )
        script_preview = self._scene_script(
            ('Hook', f'Open on {subject} already in motion with a strong first-frame pose that matches a {music_mood} sound bed.'),
            ('Beat 1', f'Hit the first memorable move in {dance_style} style. Keep the framing vertical, social-first, and easy to loop.'),
            ('Beat 2', f'Switch to a second motion beat or reaction shot that pushes retention. Highlight scene styling from {scene_theme} without clutter.'),
            ('Loop Close', f'Return to a pose or motion that cuts back into the opening frame for a {loop}.'),
        )
        return PromptAssemblyResult(prompt, video_prompt=prompt, script_preview=script_preview, recommended_model_mode=template.default_model_mode)

    def _assemble_client_ad_reel(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        product_or_service = values.get('productOrService', 'the offer')
        audience = values.get('targetAudience', 'the right audience')
        offer = values.get('offer', 'highlight the strongest offer')
        headline = values.get('headline', 'strong first-frame hook')
        cta = values.get('cta', 'act now')
        prompt = self._compose(
            f"Create a conversion-focused client ad reel for {product_or_service} targeting {audience} on {base['platform']}.",
            f"Business type: {values.get('businessType', 'service_ad')}. Offer: {offer}. Tone: {values.get('tone', 'premium and trustworthy')}. Brand colors: {values.get('brandColors', 'use tasteful branded colors')}. Headline: {headline}. CTA: {cta}.",
            'Assemble the reel with a fast hook, product/service hero moment, trust-building proof, and a clean CTA ending.',
            base['quality'],
            base['safety'],
        )
        script_preview = self._scene_script(
            ('Hook', f'Open with the headline "{headline}" and frame the problem for {audience} in under two seconds.'),
            ('Hero moment', f'Show {product_or_service} solving the problem immediately. Make the offer explicit: {offer}.'),
            ('Proof', 'Add one trust-building beat: testimonial energy, feature proof, or visual before/after clarity. Keep the pacing ad-ready and clean.'),
            ('Close', f'Land the CTA strongly: "{cta}." End on branded composition and a clear action.'),
        )
        return PromptAssemblyResult(prompt, video_prompt=prompt, script_preview=script_preview, recommended_model_mode=template.default_model_mode)

    def _assemble_story_slides_reel(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        subtype = values.get('subtype', 'mini_story')
        topic = values.get('topic', 'the chosen topic')
        cta = values.get('cta', 'Follow for part 2')
        prompt = self._compose(
            f"Create a slide-based reel in {subtype} format for {base['platform']} about {topic}.",
            f"Audience: {values.get('audience', 'general audience')}. Tone: {values.get('tone', 'educational and energetic')}. CTA: {cta}.",
            'Build the content as a hook slide, core slide progression, bold text overlays, and a final CTA slide.',
            base['quality'],
            base['safety'],
        )
        subtype_body = {
            'top_5': (
                'Hook',
                f'Open with a rank-based hook around {topic}, then move through the list with one strong visual claim per slide.'
            ),
            'timeline': (
                'Hook',
                f'Open with the first key moment in the timeline of {topic}, then progress chronologically with clean year/event transitions.'
            ),
            'before_after': (
                'Hook',
                f'Open with a dramatic before/after contrast around {topic}, then reveal the transformation through two to three visual beats.'
            ),
            'mini_story': (
                'Hook',
                f'Open with one emotionally charged first frame about {topic}, then resolve the arc across a few slides.'
            ),
        }.get(subtype, ('Hook', f'Open with a strong hook around {topic}.'))
        script_preview = self._scene_script(
            subtype_body,
            ('Slide progression', 'Use 3 to 5 slides with one clear message per slide. Keep text punchy, visual, and social-first.'),
            ('Close', f'End with a final CTA slide: "{cta}."'),
        )
        return PromptAssemblyResult(prompt, video_prompt=prompt, script_preview=script_preview, recommended_model_mode=template.default_model_mode)

    def _assemble_linkedin_carousel_pack(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        prompt = self._compose(
            f"Create a premium LinkedIn carousel visual system for a {values.get('carouselType', 'framework')} about {values.get('topic', 'the topic')}.",
            f"Audience: {values.get('targetAudience', 'professionals')}. Brand: {values.get('brandName', 'client brand')}. Tone: {values.get('tone', 'professional')}. Color style: {values.get('colorStyle', 'clean executive palette')}. Slide count: {values.get('slideCount', '5')}. Include CTA: {values.get('includeCTA', 'Yes')}. Include logo: {values.get('includeLogo', 'Yes')}.",
            'Focus on hierarchy, clarity, whitespace, and polished presentation for social carousel performance.',
            base['quality'],
            base['safety'],
        )
        return PromptAssemblyResult(prompt, image_prompt=prompt, recommended_model_mode=template.default_model_mode)

    def _assemble_product_ad_creative(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        prompt = self._compose(
            f"Create a premium ad creative for {values.get('productName', 'the product')} using a {values.get('productType', 'luxury_product')} framing.",
            f"Hero angle: {values.get('heroAngle', 'show the strongest hero angle')}. Mood: {values.get('mood', 'premium')}. Platform: {values.get('platform', 'Instagram')}. Palette: {values.get('colorPalette', 'brand-cohesive colors')}. Headline: {values.get('headline', 'clear conversion headline')}. Logo: {values.get('logo', 'brand mark if appropriate')}. Reference direction: {values.get('referenceImage', 'commercial studio reference')}.",
            'Use strong composition, premium lighting, clean product hierarchy, and ad-ready polish.',
            base['quality'],
            base['safety'],
        )
        return PromptAssemblyResult(prompt, image_prompt=prompt, recommended_model_mode=template.default_model_mode)

    def _assemble_quote_infographic_post(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        prompt = self._compose(
            f"Create a shareable social post visual in {values.get('postType', 'educational_card')} format about {values.get('topic', 'the topic')}.",
            f"Headline: {values.get('headline', 'strong curiosity-led hook')}. Tone: {values.get('tone', 'educational')}. Platform: {values.get('platform', 'Instagram')}. Color style: {values.get('colorStyle', 'clean editorial palette')}.",
            'Design for instant readability, a single strong message, and high save/share potential.',
            base['quality'],
            base['safety'],
        )
        return PromptAssemblyResult(prompt, image_prompt=prompt, recommended_model_mode=template.default_model_mode)

    def _assemble_thumbnail_cover_art(self, template: UnifiedTemplateResponse, values: dict[str, str]) -> PromptAssemblyResult:
        base = self._base_blocks(template, values)
        prompt = self._compose(
            f"Create premium cover art in {values.get('coverType', 'youtube_thumbnail')} format about {values.get('topic', 'the topic')}.",
            f"Headline: {values.get('headline', 'high-contrast headline zone')}. Tone: {values.get('tone', 'dramatic')}. Platform: {values.get('platform', 'YouTube')}. Color style: {values.get('colorStyle', 'high-contrast brand palette')}.",
            'Use a strong focal area, clean negative space for text, and high CTR visual hierarchy.',
            base['quality'],
            base['safety'],
        )
        return PromptAssemblyResult(prompt, image_prompt=prompt, recommended_model_mode=template.default_model_mode)


def get_recommended_model_display(mode: str | None) -> dict[str, str] | None:
    return get_recommended_model_mode(mode)
