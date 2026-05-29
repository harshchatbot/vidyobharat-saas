"""
Script generation service using Gemini API.
"""

import logging
import json
from typing import Optional, Dict, Any
from app.providers.gemini import get_gemini_client

logger = logging.getLogger(__name__)


def detect_product_category(business_brief: str) -> str:
    """Detect product category from business brief text."""
    brief_lower = business_brief.lower()

    category_keywords = {
        'skincare': ['serum', 'cream', 'moisturizer', 'sunscreen', 'face wash',
                     'toner', 'spf', 'vitamin c', 'retinol', 'glow', 'skin',
                     'acne', 'dark spots', 'anti-aging', 'dermatologist'],
        'apparel_ethnic': ['saree', 'kurti', 'lehenga', 'salwar', 'dupatta',
                           'kurta', 'ethnic', 'traditional', 'indian wear',
                           'anarkali', 'palazzo', 'churidar'],
        'apparel_western': ['dress', 'jeans', 'top', 'jacket', 't-shirt',
                            'western', 'casual wear', 'formal wear', 'shirt',
                            'trouser', 'skirt', 'blouse'],
        'footwear': ['shoes', 'heels', 'sneakers', 'sandals', 'boots',
                     'footwear', 'chappal', 'slippers', 'running shoes',
                     'formal shoes', 'sports shoes'],
        'food_confectionery': ['chocolate', 'candy', 'sweet', 'snack', 'biscuit',
                               'cookie', 'cake', 'mithai', 'dessert', 'wafer',
                               'dairy milk', 'kitkat', 'chips'],
        'food_beverage': ['juice', 'drink', 'beverage', 'tea', 'coffee',
                          'smoothie', 'water', 'milk', 'lassi', 'sharbat',
                          'energy drink', 'protein shake'],
        'food_grocery': ['masala', 'spice', 'oil', 'ghee', 'pickle', 'sauce',
                         'atta', 'dal', 'rice', 'grocery', 'cooking'],
        'supplement_health': ['protein', 'vitamin', 'supplement', 'capsule',
                              'tablet', 'health', 'immunity', 'weight loss',
                              'muscle', 'fitness', 'omega', 'calcium'],
        'jewelry': ['necklace', 'earrings', 'ring', 'bracelet', 'bangles',
                    'jewelry', 'jewellery', 'gold', 'silver', 'diamond',
                    'pendant', 'chain', 'anklet'],
        'electronics': ['phone', 'laptop', 'headphones', 'watch', 'gadget',
                        'speaker', 'charger', 'smartwatch', 'earbuds', 'tablet'],
        'home_decor': ['furniture', 'decor', 'lamp', 'cushion', 'curtain',
                       'bedsheet', 'carpet', 'vase', 'frame', 'candle'],
        'app_digital': ['app', 'software', 'platform', 'service', 'subscription',
                        'online', 'digital', 'saas', 'tool', 'website'],
        'personal_care': ['shampoo', 'conditioner', 'hair', 'body wash',
                          'deodorant', 'perfume', 'soap', 'toothpaste',
                          'face wash', 'lip balm'],
    }

    scores = {}
    for category, keywords in category_keywords.items():
        score = sum(1 for kw in keywords if kw in brief_lower)
        if score > 0:
            scores[category] = score

    if scores:
        return max(scores, key=scores.get)
    return 'general'


STORY_ARC_TEMPLATES = {
    'skincare': {
        10: {
            'arc_name': 'Problem-Solution-Glow',
            'beats': ['hook_problem', 'product_discovery', 'result_cta'],
            'story': 'Relatable skin concern → This product changed everything → Look at this glow',
        },
        15: {
            'arc_name': 'Transformation Journey',
            'beats': ['hook_problem', 'discovery', 'application', 'result', 'cta'],
            'story': 'Dull skin struggle → Found this serum → Watch the magic → 7 days later',
        },
        30: {
            'arc_name': 'Expert Testimonial',
            'beats': ['hook', 'problem_deep', 'discovery', 'ingredients', 'application', 'result', 'social_proof', 'cta'],
            'story': 'I tried everything → Nothing worked → Then I found this → Here is why it works → My skin now',
        },
    },
    'apparel_ethnic': {
        10: {
            'arc_name': 'Wear-Twirl-Wow',
            'beats': ['outfit_reveal', 'movement_beauty', 'cta'],
            'story': 'The outfit you have been waiting for → Feel the fabric → Own every room',
        },
        15: {
            'arc_name': 'Occasion Story',
            'beats': ['getting_ready', 'outfit_reveal', 'fabric_detail', 'lifestyle_moment', 'cta'],
            'story': 'Getting ready for something special → Perfect outfit found → Look at this fabric → Every occasion deserves this',
        },
    },
    'food_confectionery': {
        10: {
            'arc_name': 'Craving-Unwrap-Bliss',
            'beats': ['sensory_hook', 'unwrap_ritual', 'taste_bliss'],
            'story': 'That irresistible craving → The ritual of unwrapping → Pure bliss',
        },
        15: {
            'arc_name': 'Moment of Indulgence',
            'beats': ['stress_hook', 'product_appears', 'unwrap_asmr', 'taste_emotion', 'share_moment', 'brand'],
            'story': 'Tough day → Chocolate appears → That unwrapping sound → First bite bliss → Share the joy',
        },
    },
    'footwear': {
        10: {
            'arc_name': 'Walk-Detail-Confidence',
            'beats': ['movement_hook', 'shoe_detail', 'confidence_walk'],
            'story': 'Every step tells a story → Built for this → Walk with confidence',
        },
        15: {
            'arc_name': 'Performance-Style Story',
            'beats': ['activity_hook', 'shoe_reveal', 'in_action', 'detail_closeup', 'lifestyle_confidence', 'cta'],
            'story': 'Made for the way you move → Every detail designed → From gym to street → Your next step starts here',
        },
    },
    'supplement_health': {
        10: {
            'arc_name': 'Problem-Product-Energy',
            'beats': ['pain_hook', 'product_hero', 'energy_result'],
            'story': 'Feeling drained every day → This changed everything → Feel the difference',
        },
        15: {
            'arc_name': 'Transformation Story',
            'beats': ['before_pain', 'discovery', 'product_detail', 'how_it_works', 'after_result', 'cta'],
            'story': 'I was always tired → Found this supplement → Here is what is inside → 30 days later',
        },
    },
    'jewelry': {
        10: {
            'arc_name': 'Detail-Wear-Glow',
            'beats': ['jewelry_macro', 'wearing_reveal', 'confidence_portrait'],
            'story': 'Crafted for moments that matter → Wear it with pride → You deserve this',
        },
    },
    'general': {
        10: {
            'arc_name': 'Hook-Benefit-CTA',
            'beats': ['attention_hook', 'core_benefit', 'call_to_action'],
            'story': 'Get attention → Show value → Drive action',
        },
        15: {
            'arc_name': 'Problem-Solution-Proof',
            'beats': ['hook', 'problem', 'solution', 'proof', 'cta'],
            'story': 'Relatable problem → Here is the solution → Proof it works → Try it now',
        },
    },
}


AVATAR_ACTIONS_BY_CATEGORY = {
    'skincare': {
        'application': 'Avatar using dropper, applying 2-3 drops to cheek with fingertips, gentle upward circular massage motion, eyes half-closed, peaceful expression',
        'hold_product': 'Avatar holding serum bottle label-forward at chest height, both hands, slight tilt to show product, confident warm smile',
    },
    'apparel_ethnic': {
        'full_body_reveal': 'Avatar standing straight, arms slightly away from body showing outfit fully, confident posture, warm smile toward camera',
        'twirl': 'Avatar doing slow 180-degree twirl, one hand slightly lifted, dupatta/saree fabric flowing with movement, looking over shoulder at camera mid-twirl',
    },
    'food_confectionery': {
        'unwrap': 'Hands only in frame, fingers slowly peeling back wrapper from one corner, deliberate unhurried motion, chocolate surface revealing',
        'first_bite': 'Avatar bringing chocolate piece to lips, pause for beat, slow gentle bite, eyes closing naturally, slight smile spreading',
    },
    'footwear': {
        'walk_toward': 'Avatar walking toward camera at normal pace, camera at ground level, shoes prominent in lower frame, confident stride',
    },
    'supplement_health': {
        'hold_product': 'Avatar holding supplement bottle/box at chest height, label clearly visible, one hand pointing to key claim on label',
    },
    'jewelry': {
        'wear_necklace': 'Avatar clasping necklace behind neck, then facing camera, necklace prominent on chest',
    },
    'general': {
        'hold_product': 'Avatar holding product label-forward at chest height, confident warm smile, making eye contact with camera',
    },
}


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
        target_duration_seconds: int = 15,
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
            target_duration_seconds: Target video duration in seconds (default 15)

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
                target_duration_seconds=target_duration_seconds,
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
        target_duration_seconds: int = 15,
    ) -> str:
        """Build prompt for Gemini script generation."""
        word_target = self._get_word_target_for_platform(platform)

        # Detect product category for enhanced storytelling
        product_category = detect_product_category(business_brief)

        # Get story arc for this category + duration
        arc_data = STORY_ARC_TEMPLATES.get(product_category, STORY_ARC_TEMPLATES['general'])
        duration_key = min(arc_data.keys(), key=lambda x: abs(x - target_duration_seconds))
        story_arc = arc_data[duration_key]

        category_guidelines = {
            'ugc_testimonial': 'Authentic personal experience as a real user/customer. First person, conversational, genuine emotion.',
            'founder_talking_head': 'Brand founder speaking with authority and passion. Expert credibility, personal mission, direct address.',
            'problem_solution': 'Opens with relatable pain point, builds tension, reveals product as hero solution, shows proof.',
            'product_demo_lifestyle': 'Product in natural use within aspirational lifestyle context. Show not tell.',
            'inner_monologue': 'Internal thoughts spoken aloud. Intimate, vulnerable, relatable internal dialogue.',
            'cinematic_narration': 'Beautiful visual storytelling with poetic voiceover. Evocative language, sensory details.',
            'cinematic_broll': 'Minimal dialogue, let visuals carry emotion. Only essential lines, mostly ambient.',
        }

        tone_guidelines = {
            'casual': 'conversational, friendly, like talking to a friend, use simple everyday words',
            'professional': 'polished, confident, credible, clear benefits, authoritative but approachable',
            'emotional': 'warm, heartfelt, connect with feelings, use sensory and emotional language',
            'energetic': 'exciting, dynamic, punchy, short sentences, high energy, motivating',
        }

        # Build story beats instruction
        beats_instruction = '\n'.join([
            f"Beat {i+1} — {beat.upper().replace('_', ' ')}"
            for i, beat in enumerate(story_arc['beats'])
        ])

        category_rules = self._get_category_script_rules(product_category)

        prompt = f"""You are an expert Indian ad copywriter creating a {target_duration_seconds}-second social media ad script.

PRODUCT/BRIEF: {business_brief}
PRODUCT CATEGORY: {product_category}
AD FORMAT: {category_guidelines.get(ad_category, 'engaging product advertisement')}
PLATFORM: {platform}
TONE: {tone_guidelines.get(tone, tone)}
TARGET WORDS: approximately {word_target} words (±15% flexibility)

STORY ARC: {story_arc['arc_name']}
{story_arc['story']}

REQUIRED STORY BEATS (write in this exact order):
{beats_instruction}

PRODUCT CATEGORY RULES for {product_category}:
{category_rules}

UNIVERSAL RULES:
- First sentence MUST be a scroll-stopping hook (question, surprising fact, or emotional statement)
- Product name must appear naturally within first 40% of script
- End with ONE clear call-to-action
- Write in {language} language
- NO generic filler phrases like "amazing product" or "you won't believe"
- Make it feel REAL, not like an ad
- Every line must serve the story — no wasted words

OUTPUT: Plain script text only. No formatting, labels, timing marks, or directions.
"""
        return prompt

    def _get_category_script_rules(self, product_category: str) -> str:
        """Get category-specific rules for script generation."""
        rules = {
            'skincare': '- Must mention specific skin benefit (glow/dark spots/hydration)\n- Include "before" feeling and "after" result\n- Use sensory language (smooth, soft, melts in)\n- Mention timeframe for results if applicable',
            'apparel_ethnic': '- Evoke occasion or emotion (wedding, festival, family gathering)\n- Describe how wearing it FEELS, not just looks\n- Use fabric sensory words (flowing, soft, lightweight)\n- Connect to cultural pride or personal identity',
            'food_confectionery': '- Lead with sensory experience (taste, texture, smell, sound)\n- Minimal product features — maximum emotion\n- Use indulgence language (melt, rich, smooth, irresistible)\n- Include sharing or moment context',
            'food_beverage': '- Open with thirst/craving or refreshment need\n- Describe taste journey (first sip to aftertaste)\n- Mention occasion (morning, post-workout, hot day)\n- Sensory language throughout',
            'footwear': '- Start with activity or movement\n- Connect shoes to confidence or performance\n- Mention specific occasion or use case\n- Use motion and energy language',
            'supplement_health': '- Open with specific pain/problem (fatigue, weakness, deficiency)\n- Mention key ingredient or mechanism simply\n- Show transformation with timeframe\n- Include credibility signal (tested/certified/doctor)',
            'jewelry': '- Connect to occasion or emotion (gift, milestone, self-love)\n- Describe craftsmanship with sensory detail\n- Evoke the feeling of wearing it\n- Include gifting or self-treat angle',
            'general': '- Open with problem or desire your audience feels\n- Connect product to their life improvement\n- Include one specific proof point or result\n- End with urgency or clear next step',
        }
        return rules.get(product_category, rules['general'])

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
