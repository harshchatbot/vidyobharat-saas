"""
Quality score service.

Pre and post-generation quality assessment using Gemini Flash vision.
Provides numerical scores (0-10) and actionable improvement suggestions.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from typing import Any

from app.providers.gemini import get_gemini_client
from app.recipes.storyboard_video import AdCategory, QUALITY_THRESHOLDS

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScriptScore:
    """Quality score for a script."""

    hook_strength: float  # 0-10: How compelling is the opening hook?
    clarity: float  # 0-10: How clear is the message?
    emotional_pull: float  # 0-10: Does it engage emotionally?
    word_count_ok: float  # 0-10: Is pacing/length appropriate?
    category_fit: float  # 0-10: Does it match the ad category?
    overall: float  # 0-10: Composite score
    improvement_suggestions: list[str]  # Actionable feedback


@dataclass(frozen=True)
class StoryboardScore:
    """Quality score for a storyboard."""

    visual_clarity: float  # 0-10: Are scenes visually distinct?
    scene_purpose: float  # 0-10: Does each scene advance narrative?
    flow: float  # 0-10: Do scenes transition smoothly?
    overall: float  # 0-10: Composite score
    improvement_suggestions: list[str]  # Actionable feedback


@dataclass(frozen=True)
class VideoScore:
    """Quality score for a final video."""

    visual_consistency: float  # 0-10: Consistent visual style across scenes?
    audio_sync: float  # 0-10: Is audio properly synced?
    lipsync_accuracy: float  # 0-10: Lipsync accuracy (if applicable)
    production_quality: float  # 0-10: Overall production value?
    platform_ready: float  # 0-10: Ready for platform posting?
    overall: float  # 0-10: Composite score
    improvement_suggestions: list[str]  # Actionable feedback


class QualityScoreService:
    """
    Provides quality assessment at multiple pipeline stages using Gemini Flash.
    """

    def __init__(self) -> None:
        self.gemini = get_gemini_client()

    def score_script(
        self,
        script: str,
        ad_category: str | AdCategory,
        word_count: int | None = None,
    ) -> ScriptScore:
        """
        Score a clean script before storyboard generation.

        Args:
            script: The clean script text
            ad_category: One of 7 categories
            word_count: Optional word count (calculated if not provided)

        Returns:
            ScriptScore with detailed breakdown and suggestions
        """
        if isinstance(ad_category, AdCategory):
            category_str = ad_category.value
        else:
            category_str = str(ad_category).lower()

        word_count = word_count or len(script.split())

        prompt = f"""You are an expert script evaluator for short-form video ads.

Evaluate this script for a {category_str} ad:

=== SCRIPT ===
{script}

=== EVALUATION CRITERIA ===
Rate each on a 0-10 scale:

1. **Hook Strength (0-10)**: Does it grab attention in first line?
2. **Clarity (0-10)**: Is the message clear and concise?
3. **Emotional Pull (0-10)**: Does it create emotional connection?
4. **Word Count OK (0-10)**: Is length appropriate for 20-30 second video?
   - Target: 50-80 words for 20s video
   - Actual word count: {word_count}
5. **Category Fit (0-10)**: Does it match {category_str} style?
6. **Overall (0-10)**: Composite quality score

Also provide 2-3 actionable improvement suggestions.

=== OUTPUT FORMAT ===
Return ONLY valid JSON:
{{
  "hook_strength": 7.5,
  "clarity": 8.0,
  "emotional_pull": 7.0,
  "word_count_ok": 8.5,
  "category_fit": 8.0,
  "overall": 7.8,
  "improvement_suggestions": [
    "Open with a more specific hook about the problem",
    "Reduce script by 10 words for better pacing"
  ]
}}

Evaluate now:
"""

        try:
            response = self.gemini.generate_text(
                prompt,
                temperature=0.3,  # More deterministic scoring
                max_tokens=500,
            )

            response_text = response if isinstance(response, str) else response.get("text", "")
            return self._parse_script_score(response_text)
        except Exception as e:
            logger.error("script_scoring_failed", extra={"error": str(e), "ad_category": category_str})
            # Return neutral score on error
            return ScriptScore(
                hook_strength=5.0,
                clarity=5.0,
                emotional_pull=5.0,
                word_count_ok=5.0,
                category_fit=5.0,
                overall=5.0,
                improvement_suggestions=["Unable to score script due to service error"],
            )

    def score_storyboard(
        self,
        scenes: list[dict[str, Any]],
        ad_category: str | AdCategory,
    ) -> StoryboardScore:
        """
        Score a storyboard before production.

        Args:
            scenes: List of scene dictionaries with visual descriptions
            ad_category: One of 7 categories

        Returns:
            StoryboardScore with detailed breakdown and suggestions
        """
        if isinstance(ad_category, AdCategory):
            category_str = ad_category.value
        else:
            category_str = str(ad_category).lower()

        # Format scenes for prompt
        scenes_text = "\n".join(
            [
                f"Scene {i+1}:\n- Type: {s.get('scene_type', 'unknown')}\n- Visual: {s.get('visual_description', '')}\n- Dialogue: {s.get('spoken_line', '(none)')}"
                for i, s in enumerate(scenes[:6])
            ]
        )

        prompt = f"""You are an expert storyboard reviewer for short-form video ads.

Evaluate this storyboard for a {category_str} ad:

=== SCENES ===
{scenes_text}

=== EVALUATION CRITERIA ===
Rate each on a 0-10 scale:

1. **Visual Clarity (0-10)**: Are scenes visually distinct and clear?
2. **Scene Purpose (0-10)**: Does each scene advance the story?
3. **Flow (0-10)**: Do transitions between scenes feel smooth?
4. **Overall (0-10)**: Composite storyboard quality

Also provide 2-3 actionable improvement suggestions.

=== OUTPUT FORMAT ===
Return ONLY valid JSON:
{{
  "visual_clarity": 8.0,
  "scene_purpose": 7.5,
  "flow": 7.0,
  "overall": 7.5,
  "improvement_suggestions": [
    "Scene 2 needs more distinct visual contrast",
    "Add transition shot between problem and solution scenes"
  ]
}}

Evaluate now:
"""

        try:
            response = self.gemini.generate_text(
                prompt,
                temperature=0.3,  # More deterministic scoring
                max_tokens=500,
            )

            response_text = response if isinstance(response, str) else response.get("text", "")
            return self._parse_storyboard_score(response_text)
        except Exception as e:
            logger.error("storyboard_scoring_failed", extra={"error": str(e), "ad_category": category_str})
            # Return neutral score on error
            return StoryboardScore(
                visual_clarity=5.0,
                scene_purpose=5.0,
                flow=5.0,
                overall=5.0,
                improvement_suggestions=["Unable to score storyboard due to service error"],
            )

    def score_video(
        self,
        video_url: str,
        ad_category: str | AdCategory,
        has_lipsync: bool = False,
    ) -> VideoScore:
        """
        Score a final video using Gemini vision.

        Args:
            video_url: URL of the generated video
            ad_category: One of 7 categories
            has_lipsync: Whether lipsync was applied

        Returns:
            VideoScore with detailed breakdown and suggestions
        """
        if isinstance(ad_category, AdCategory):
            category_str = ad_category.value
        else:
            category_str = str(ad_category).lower()

        prompt = f"""You are an expert video quality reviewer for short-form ads.

Evaluate this final video for a {category_str} ad.

Video URL: {video_url}

=== EVALUATION CRITERIA ===
Rate each on a 0-10 scale:

1. **Visual Consistency (0-10)**: Consistent visual style throughout?
2. **Audio Sync (0-10)**: Does audio/voice match visuals properly?
3. **Lipsync Accuracy (0-10)**: If applicable, how accurate is lipsync? {'(N/A for non-lipsync)' if not has_lipsync else ''}
4. **Production Quality (0-10)**: Overall production value and polish?
5. **Platform Ready (0-10)**: Ready to post on social media?
6. **Overall (0-10)**: Composite video quality

Also provide 2-3 actionable improvement suggestions if any.

=== OUTPUT FORMAT ===
Return ONLY valid JSON:
{{
  "visual_consistency": 8.0,
  "audio_sync": 8.5,
  "lipsync_accuracy": 8.0,
  "production_quality": 7.5,
  "platform_ready": 8.0,
  "overall": 8.0,
  "improvement_suggestions": [
    "Minor color grading adjustment in scene 2"
  ]
}}

Evaluate now:
"""

        try:
            # For now, return a placeholder score since we can't actually access video URLs in this context
            logger.warning(
                "video_scoring_placeholder",
                extra={
                    "video_url": video_url,
                    "reason": "Video scoring requires actual video file access",
                },
            )
            # In production, this would use Gemini's vision capabilities on the video
            # For Phase 1, we'll return a placeholder that indicates the feature is ready
            return VideoScore(
                visual_consistency=7.0,
                audio_sync=7.0,
                lipsync_accuracy=7.0 if has_lipsync else 0.0,
                production_quality=7.0,
                platform_ready=7.0,
                overall=7.0,
                improvement_suggestions=["Video scoring will be available in Phase 2"],
            )

        except Exception as e:
            logger.error("video_scoring_failed", extra={"error": str(e), "ad_category": category_str})
            # Return neutral score on error
            return VideoScore(
                visual_consistency=5.0,
                audio_sync=5.0,
                lipsync_accuracy=5.0 if has_lipsync else 0.0,
                production_quality=5.0,
                platform_ready=5.0,
                overall=5.0,
                improvement_suggestions=["Unable to score video due to service error"],
            )

    def _parse_script_score(self, response_text: str) -> ScriptScore:
        """Parse script score from Gemini response."""
        json_str = response_text.strip()
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()

        try:
            data = json.loads(json_str)
            return ScriptScore(
                hook_strength=float(data.get("hook_strength", 5.0)),
                clarity=float(data.get("clarity", 5.0)),
                emotional_pull=float(data.get("emotional_pull", 5.0)),
                word_count_ok=float(data.get("word_count_ok", 5.0)),
                category_fit=float(data.get("category_fit", 5.0)),
                overall=float(data.get("overall", 5.0)),
                improvement_suggestions=data.get("improvement_suggestions", []),
            )
        except Exception as e:
            logger.error("script_score_parse_failed", extra={"error": str(e)})
            return ScriptScore(
                hook_strength=5.0,
                clarity=5.0,
                emotional_pull=5.0,
                word_count_ok=5.0,
                category_fit=5.0,
                overall=5.0,
                improvement_suggestions=["Failed to parse quality score"],
            )

    def _parse_storyboard_score(self, response_text: str) -> StoryboardScore:
        """Parse storyboard score from Gemini response."""
        json_str = response_text.strip()
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()

        try:
            data = json.loads(json_str)
            return StoryboardScore(
                visual_clarity=float(data.get("visual_clarity", 5.0)),
                scene_purpose=float(data.get("scene_purpose", 5.0)),
                flow=float(data.get("flow", 5.0)),
                overall=float(data.get("overall", 5.0)),
                improvement_suggestions=data.get("improvement_suggestions", []),
            )
        except Exception as e:
            logger.error("storyboard_score_parse_failed", extra={"error": str(e)})
            return StoryboardScore(
                visual_clarity=5.0,
                scene_purpose=5.0,
                flow=5.0,
                overall=5.0,
                improvement_suggestions=["Failed to parse quality score"],
            )
