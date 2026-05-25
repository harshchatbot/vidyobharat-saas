"""
Script generation service using Gemini API.
"""

import logging
import json
from typing import Optional, Dict, Any
from app.providers.gemini import get_gemini_client

logger = logging.getLogger(__name__)


class ScriptGenerationService:
    """Service for generating ad scripts with Gemini."""

    def __init__(self, gemini_client=None):
        """Initialize with Gemini client."""
        self.gemini_client = gemini_client or get_gemini_client()

    def _get_word_target_for_platform(self, platform: str) -> int:
        """Get word count target for a specific platform."""
        targets = {
            'instagram_reels': 80,
            'facebook_feed': 80,
            'youtube_shorts': 80,
            'tiktok': 60,
            'linkedin': 150,
        }
        return targets.get(platform, 80)

    def generate(
        self,
        business_brief: str,
        ad_category: str,
        platform: str,
        language: str = 'en',
        tone: str = 'casual',
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Generate ad script using Gemini.

        Args:
            business_brief: Description of the product/business
            ad_category: Type of ad (e.g., 'ugc_testimonial')
            platform: Target platform (e.g., 'instagram_reels')
            language: Language code (e.g., 'en', 'hi')
            tone: Tone of voice (e.g., 'casual', 'professional')

        Returns:
            Dict with 'script', 'word_count', 'duration_estimate'
        """
        try:
            # Build prompt for Gemini
            prompt = self._build_script_prompt(
                business_brief=business_brief,
                ad_category=ad_category,
                platform=platform,
                language=language,
                tone=tone,
            )

            # Call Gemini
            response = self.gemini_client.generate_text(
                prompt=prompt,
                temperature=0.7,
                max_tokens=2048,
            )

            if response.get('status') != 'success':
                raise Exception(f"Gemini API error: {response}")

            raw_script = response.get('text', '').strip()
            word_target = self._get_word_target_for_platform(platform)
            script = self._clean_script_response(raw_script, word_target=word_target)

            # Calculate metrics
            word_count = len(script.split())
            duration_estimate = (word_count / 150) * 60  # 150 words per minute

            logger.info(
                'script_generation_success',
                extra={
                    'word_count': word_count,
                    'duration_estimate': duration_estimate,
                    'ad_category': ad_category,
                    'is_mock': response.get('is_mock', False),
                },
            )

            return {
                'script': script,
                'word_count': word_count,
                'duration_estimate': duration_estimate,
            }

        except Exception as e:
            logger.error(
                'script_generation_failed',
                extra={'error': str(e), 'ad_category': ad_category},
            )
            raise

    def _build_script_prompt(
        self,
        business_brief: str,
        ad_category: str,
        platform: str,
        language: str,
        tone: str,
    ) -> str:
        """Build prompt for Gemini script generation."""

        category_guidelines = {
            'ugc_testimonial': 'User-generated testimonial with authentic personal experience',
            'founder_talking_head': 'Founder or expert speaking directly to camera',
            'problem_solution': 'Showcase problem then reveal solution',
            'product_demo_lifestyle': 'Product in action with lifestyle context',
            'inner_monologue': 'Person thinking aloud about the product',
            'cinematic_narration': 'High-quality cinematic style with voiceover',
            'cinematic_broll': 'Beautiful footage with minimal dialogue',
        }

        platform_specs = {
            'instagram_reels': '30 seconds target (max 60), vertical video (9:16), captions helpful, hook in first 3 seconds',
            'facebook_feed': '30 seconds target (max 60), square or vertical, engaging from start',
            'youtube_shorts': '30 seconds target (max 60), vertical video, strong hook',
            'linkedin': '45-60 seconds, professional tone, highlight value proposition clearly',
            'tiktok': '20-30 seconds target, trendy, engaging, hook in first 2 seconds, mobile-first',
        }

        tone_guidelines = {
            'casual': 'Friendly, conversational, relatable tone',
            'professional': 'Formal, authoritative, trustworthy tone',
            'emotional': 'Evocative, inspiring, heartfelt tone',
            'energetic': 'Upbeat, exciting, dynamic tone',
        }

        platform_duration = {
            'instagram_reels': 'max 30 seconds (aim for 20-25 seconds)',
            'facebook_feed': 'max 30 seconds (aim for 20-25 seconds)',
            'youtube_shorts': 'max 30 seconds (aim for 20-25 seconds)',
            'tiktok': 'max 20 seconds (aim for 15-18 seconds)',
            'linkedin': 'max 60 seconds (aim for 45-50 seconds)',
        }
        duration_target = platform_duration.get(platform, 'max 30 seconds (aim for 20-25 seconds)')
        word_target = self._get_word_target_for_platform(platform)

        prompt = f"""Write approximately {word_target} words of testimonial voiceover for a {duration_target} ad.

Product/Service: {business_brief}
Type: {category_guidelines.get(ad_category, ad_category)}
Platform: {platform}
Tone: {tone}

GUIDELINES:
- Aim for roughly {word_target} words (flexibility of ±15% is fine, but don't go much longer)
- Speak naturally and conversationally, like someone telling a friend
- Start with an immediate hook (first sentence must grab attention)
- End with a direct call-to-action
- Include 3-4 sentences about the benefit or impact
- Add 1-2 personal, authentic statements
- Use natural filler words (like, seriously, so, right?) but not excessively
- Keep sentences punchy and varied in length

STRUCTURE:
1. Hook - Establish the problem or emotion in 1-2 sentences
2. Discovery - Introduce the solution in 1 sentence
3. Impact - Show the benefit/results in 2-3 sentences
4. Personal endorsement - Why you genuinely love it in 1-2 sentences
5. Call-to-action - Tell them what to do (1 sentence)

FORMAT: Plain text only. No formatting, no asterisks, no brackets, no speaker labels, no timing markers, no scene directions. Just natural dialogue as someone would speak it.

OUTPUT: Only the script text. Nothing else.
"""
        return prompt

    def _clean_script_response(self, raw_script: str, word_target: int = 80) -> str:
        """
        Extract only dialogue from Gemini response, removing scene descriptions,
        formatting, captions, visual notes, and other metadata.

        Then truncate to enforce word count limit if necessary.

        Args:
            raw_script: Raw response from Gemini
            word_target: Maximum word count to enforce

        Returns:
            Clean dialogue-only script, truncated to word_target words if necessary
        """
        lines = raw_script.split('\n')
        dialogue_lines = []
        in_dialogue_section = False

        for line in lines:
            # Skip empty lines
            if not line.strip():
                continue

            # Skip section headers and metadata (lines starting with ** or containing: CAPTION, VISUAL, SCENE, NOTE, WHY)
            if any(marker in line for marker in ['**', '===', 'CAPTION', 'VISUAL', 'NOTE', 'WHY', 'CTA:', 'Hook:', 'Ending:']):
                in_dialogue_section = True  # Flag that we've hit a section header
                continue

            # Skip lines in parentheses (video descriptions, timing notes)
            if line.strip().startswith('(') and line.strip().endswith(')'):
                continue

            # Skip timestamps like (0-3 seconds) at the start of lines
            if line.strip().startswith('(') and 'second' in line.lower():
                # Extract text after the timestamp
                closing_paren = line.find(')')
                if closing_paren != -1:
                    remaining = line[closing_paren + 1:].strip()
                    # Remove speaker label like "Chloe:" or "Person:"
                    if ':' in remaining:
                        dialogue = remaining.split(':', 1)[1].strip()
                    else:
                        dialogue = remaining
                    if dialogue:
                        dialogue_lines.append(dialogue)
                continue

            # Extract dialogue from lines like "**Chloe:** [dialogue]" or "Person: [dialogue]"
            if ':' in line:
                # Check if this looks like speaker label
                parts = line.split(':', 1)
                if len(parts) == 2:
                    potential_label = parts[0].strip()
                    dialogue = parts[1].strip()
                    # Accept if label looks like a name/speaker (no numbers, not too long)
                    if dialogue and len(potential_label) < 30 and not any(c.isdigit() for c in potential_label[:5]):
                        # Clean up any remaining markdown
                        dialogue = dialogue.replace('**', '').strip()
                        dialogue_lines.append(dialogue)
                        continue

            # Include plain text lines that aren't metadata
            cleaned = line.replace('**', '').strip()
            if cleaned and not cleaned.startswith('[') and not cleaned.startswith('('):
                dialogue_lines.append(cleaned)

        # Join dialogue and clean up excessive whitespace
        result = '\n'.join(dialogue_lines).strip()

        # If we got almost nothing, return the original (fallback)
        if not result or len(result.split()) < 10:
            logger.warning(
                'script_cleaning_produced_empty_result',
                extra={'original_length': len(raw_script), 'cleaned_length': len(result)},
            )
            return raw_script

        # Enforce word count limit by truncating if necessary
        words = result.split()
        if len(words) > word_target:
            # Truncate to word_target, but try to end at a sentence boundary
            truncated_words = words[:word_target]
            truncated = ' '.join(truncated_words)

            # Try to end at the last period, question mark, or exclamation point
            # Search within the last 25% of the truncated text to find a natural break
            search_start = max(0, len(truncated) - int(len(truncated) * 0.25))
            for punct in ['.', '!', '?']:
                last_punct = truncated.rfind(punct, search_start)
                if last_punct > search_start - 1:
                    result = truncated[:last_punct + 1]
                    logger.info(
                        'script_truncated_at_punctuation',
                        extra={
                            'original_words': len(words),
                            'target_words': word_target,
                            'truncated_words': len(result.split()),
                            'last_punct': punct,
                        },
                    )
                    return result

            # No good sentence boundary found in last 25%, just truncate
            result = truncated
            logger.info(
                'script_truncated_hard',
                extra={
                    'original_words': len(words),
                    'target_words': word_target,
                    'truncated_words': len(result.split()),
                },
            )

        return result


class ScriptGenerationError(Exception):
    """Exception raised when script generation fails."""

    pass
