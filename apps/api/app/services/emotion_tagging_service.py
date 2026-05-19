"""
Emotion tagging service.

Applies emotion tags and TTS style instructions to scripts for nuanced voice delivery.
Separates display_script (clean) from tts_script (emotion-tagged) for flexibility.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.recipes.storyboard_video import AdCategory, EMOTION_TEMPLATES

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TaggedScript:
    """Script with emotional and TTS directives."""

    display_script: str  # Clean, original script for display
    tts_script: str  # Emotion-tagged version for voice generation
    emotion_tag: str  # Selected emotion (e.g., "professional", "casual")
    tts_instructions: str  # Style instructions for TTS provider


class EmotionTaggingService:
    """
    Applies emotional context tags to scripts for more nuanced TTS voice delivery.

    Separates display_script (what the user sees) from tts_script (what gets sent to voice provider).
    This allows for emotionally intelligent voice generation without modifying the original script.
    """

    def __init__(self) -> None:
        pass

    def tag_script(
        self,
        clean_script: str,
        ad_category: str | AdCategory,
        language: str = "en",
        tone: str = "casual",
        user_emotion_preference: str | None = None,
    ) -> TaggedScript:
        """
        Apply emotion tags and TTS instructions to a clean script.

        Args:
            clean_script: The original, clean script text
            ad_category: One of 7 categories (e.g., "ugc_testimonial")
            language: Script language (default: "en")
            tone: Overall tone of the ad (default: "casual")
            user_emotion_preference: Optional user-selected emotion override

        Returns:
            TaggedScript with display_script, tts_script, emotion_tag, and tts_instructions
        """
        if isinstance(ad_category, AdCategory):
            category_str = ad_category.value
        else:
            category_str = str(ad_category).lower()

        # Select emotion tag based on category and tone
        emotion_tag = self._select_emotion_tag(
            ad_category=category_str,
            tone=tone,
            user_preference=user_emotion_preference,
        )

        # Get emotion template for TTS instructions
        emotion_template = self._get_emotion_template(category_str, emotion_tag)

        # Build TTS script with emotion instructions
        tts_script = self._build_tts_script(
            clean_script=clean_script,
            emotion_template=emotion_template,
            language=language,
        )

        logger.info(
            "emotion_tagging_applied",
            extra={
                "ad_category": category_str,
                "emotion_tag": emotion_tag,
                "language": language,
                "script_length": len(clean_script),
            },
        )

        return TaggedScript(
            display_script=clean_script,
            tts_script=tts_script,
            emotion_tag=emotion_tag,
            tts_instructions=emotion_template,
        )

    def _select_emotion_tag(
        self,
        ad_category: str,
        tone: str,
        user_preference: str | None = None,
    ) -> str:
        """Select the best emotion tag for the category and tone."""
        if user_preference:
            return user_preference

        # Map tone to emotion tag
        tone_to_emotion = {
            "casual": "friendly",
            "professional": "professional",
            "energetic": "energetic",
            "emotional": "emotional",
            "inspiring": "inspiring",
            "playful": "playful",
            "intimate": "intimate",
            "authoritative": "authoritative",
        }

        # Category-specific default emotions
        category_defaults = {
            "ugc_testimonial": "authentic",
            "founder_talking_head": "authoritative",
            "problem_solution": "empathetic",
            "product_demo_lifestyle": "aspirational",
            "inner_monologue": "relatable",
            "cinematic_narration": "cinematic",
            "cinematic_broll": "ambient",
        }

        # Try tone mapping first
        emotion = tone_to_emotion.get(tone.lower())
        if emotion:
            return emotion

        # Fall back to category default
        return category_defaults.get(ad_category, "natural")

    def _get_emotion_template(self, ad_category: str, emotion_tag: str) -> str:
        """Get emotion template for TTS instructions."""
        if ad_category in EMOTION_TEMPLATES:
            emotions = EMOTION_TEMPLATES[ad_category]
            return emotions.get(emotion_tag, list(emotions.values())[0])

        # Fallback generic template
        generic_templates = {
            "professional": "Professional, clear, confident voice with steady pacing",
            "casual": "Friendly, conversational, natural-sounding voice",
            "energetic": "Enthusiastic, energetic, upbeat delivery",
            "emotional": "Warm, emotionally engaging, heartfelt delivery",
            "inspiring": "Motivational, inspiring voice with conviction",
            "playful": "Fun, playful, light-hearted delivery",
            "intimate": "Close, personal, intimate tone like talking to a friend",
            "authoritative": "Authoritative, knowledgeable, commanding presence",
            "empathetic": "Empathetic, understanding, compassionate voice",
            "aspirational": "Aspirational, uplifting, hopeful delivery",
            "relatable": "Relatable, authentic, genuine voice",
            "authentic": "Authentic, genuine, real-sounding voice",
            "cinematic": "Cinematic, epic, commanding narrator voice",
            "ambient": "Ambient, minimalist approach letting visuals speak",
            "natural": "Natural, neutral, clear voice for information delivery",
        }

        return generic_templates.get(emotion_tag, generic_templates["natural"])

    def _build_tts_script(
        self,
        clean_script: str,
        emotion_template: str,
        language: str = "en",
    ) -> str:
        """
        Build TTS script with emotion-tagged instructions.

        Format:
        [Emotional Context: emotion_template]
        [Language: language_code]

        clean_script_text
        """
        tts_script = f"""[Emotional Context: {emotion_template}]
[Language: {language}]
[Delivery: Natural pacing, clear pronunciation, conversational flow]

{clean_script}
"""
        return tts_script.strip()

    def apply_emotion_to_scene(
        self,
        scene_spoken_line: str,
        emotion_tag: str,
        language: str = "en",
    ) -> str:
        """
        Apply emotion tagging to a single scene's spoken line.

        Useful for per-scene emotion variation within a single ad.
        """
        if not scene_spoken_line.strip():
            return scene_spoken_line

        emotion_instruction = f"[{emotion_tag.capitalize()}] {scene_spoken_line}"
        return emotion_instruction
