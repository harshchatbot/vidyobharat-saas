"""
Storyboard video recipe configuration.

Defines the 7 ad categories, duration rules, lipsync routing, and quality settings
for the storyboard-based multi-shot ad generation pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class AdCategory(str, Enum):
    """7 ad categories with automatic routing rules."""

    UGC_TESTIMONIAL = "ugc_testimonial"
    FOUNDER_TALKING_HEAD = "founder_talking_head"
    PROBLEM_SOLUTION = "problem_solution"
    PRODUCT_DEMO_LIFESTYLE = "product_demo_lifestyle"
    INNER_MONOLOGUE = "inner_monologue"
    CINEMATIC_NARRATION = "cinematic_narration"
    CINEMATIC_BROLL = "cinematic_broll"


@dataclass(frozen=True)
class DurationRules:
    """Duration constraints for storyboard generation."""

    ideal_duration_seconds: int = 20  # Target ad length
    max_duration_seconds: int = 30  # Absolute maximum
    scene_duration_seconds: int = 5  # Default per scene
    min_duration_seconds: int = 10  # Minimum ad length


@dataclass(frozen=True)
class AdCategoryConfig:
    """Configuration for each ad category."""

    id: str
    label: str
    description: str
    lipsync_required: bool
    avatar_required: bool
    max_scenes: int
    model_key: str  # Primary FAL video model for this category
    platform_recommendation: str  # e2g., "instagram_reels", "tiktok", "youtube_shorts"
    quality_focus: str  # "motion_clarity", "emotional_impact", "product_focus"


# ===== AD CATEGORY CONFIGURATIONS =====

STORYBOARD_AD_CATEGORIES = {
    AdCategory.UGC_TESTIMONIAL: AdCategoryConfig(
        id=AdCategory.UGC_TESTIMONIAL,
        label="UGC Testimonial",
        description="User shares authentic testimonial/review of product",
        lipsync_required=True,
        avatar_required=True,
        max_scenes=4,
        model_key="kling_o3_standard_reference",
        platform_recommendation="instagram_reels",
        quality_focus="emotional_impact",
    ),
    AdCategory.FOUNDER_TALKING_HEAD: AdCategoryConfig(
        id=AdCategory.FOUNDER_TALKING_HEAD,
        label="Founder Talking Head",
        description="Founder/CEO delivers pitch or product story",
        lipsync_required=True,
        avatar_required=True,
        max_scenes=4,
        model_key="kling_o3_standard_reference",
        platform_recommendation="linkedin",
        quality_focus="authority_clarity",
    ),
    AdCategory.PROBLEM_SOLUTION: AdCategoryConfig(
        id=AdCategory.PROBLEM_SOLUTION,
        label="Problem → Solution",
        description="Shows problem scenario then product solution",
        lipsync_required=False,
        avatar_required=True,
        max_scenes=5,
        model_key="kling_o3_standard_reference",
        platform_recommendation="tiktok",
        quality_focus="narrative_flow",
    ),
    AdCategory.PRODUCT_DEMO_LIFESTYLE: AdCategoryConfig(
        id=AdCategory.PRODUCT_DEMO_LIFESTYLE,
        label="Product Demo (Lifestyle)",
        description="Lifestyle shots of product being used",
        lipsync_required=False,
        avatar_required=False,
        max_scenes=5,
        model_key="seedance_v1_lite_reference",
        platform_recommendation="instagram_reels",
        quality_focus="product_focus",
    ),
    AdCategory.INNER_MONOLOGUE: AdCategoryConfig(
        id=AdCategory.INNER_MONOLOGUE,
        label="Inner Monologue",
        description="Character's inner thoughts about product",
        lipsync_required=False,
        avatar_required=True,
        max_scenes=4,
        model_key="kling_o3_standard_reference",
        platform_recommendation="youtube_shorts",
        quality_focus="emotional_impact",
    ),
    AdCategory.CINEMATIC_NARRATION: AdCategoryConfig(
        id=AdCategory.CINEMATIC_NARRATION,
        label="Cinematic Narration",
        description="Voice-over with cinematic b-roll scenes",
        lipsync_required=False,
        avatar_required=False,
        max_scenes=5,
        model_key="fal_ltx23_i2v",
        platform_recommendation="youtube",
        quality_focus="visual_storytelling",
    ),
    AdCategory.CINEMATIC_BROLL: AdCategoryConfig(
        id=AdCategory.CINEMATIC_BROLL,
        label="Cinematic B-Roll",
        description="High-production cinematic shots with music",
        lipsync_required=False,
        avatar_required=False,
        max_scenes=6,
        model_key="fal_ltx23_i2v",
        platform_recommendation="youtube",
        quality_focus="visual_beauty",
    ),
}

# ===== DURATION RULES =====

DURATION_RULES = DurationRules(
    ideal_duration_seconds=20,
    max_duration_seconds=30,
    scene_duration_seconds=5,
    min_duration_seconds=10,
)

# ===== CREDIT COSTS =====

@dataclass(frozen=True)
class CreditCosts:
    """Credit costs for each operation in the storyboard pipeline."""

    # Free operations (foundation phase)
    script_generation: int = 0
    storyboard_generation: int = 0

    # Small costs (preview operations)
    voice_preview: int = 3  # 2-line preview

    # Major costs (production phase, per scene)
    base_image_generation_fast: int = 5
    base_image_generation_pro: int = 10
    video_generation_kling_standard: int = 15
    video_generation_kling_pro: int = 25
    video_generation_seedance: int = 12
    video_generation_ltx: int = 20
    lipsync_per_scene: int = 8
    tts_full_script: int = 4  # One-time for entire project
    quality_scoring: int = 1

    # Post-generation
    final_stitching: int = 2
    final_scoring: int = 2

    def get_video_cost(self, model_key: str) -> int:
        """Get credit cost for video generation by model."""
        mapping = {
            "kling_o3_standard_reference": self.video_generation_kling_standard,
            "kling_o3_pro_reference": self.video_generation_kling_pro,
            "seedance_v1_lite_reference": self.video_generation_seedance,
            "fal_ltx23_i2v": self.video_generation_ltx,
        }
        return mapping.get(model_key, self.video_generation_kling_standard)


CREDIT_COSTS = CreditCosts()

# ===== QUALITY THRESHOLDS =====

@dataclass(frozen=True)
class QualityThresholds:
    """Quality score thresholds for different stages."""

    script_minimum_overall: float = 6.0  # Out of 10
    script_minimum_hook_strength: float = 5.0
    storyboard_minimum_overall: float = 6.5
    video_minimum_overall: float = 6.5
    video_minimum_lipsync_accuracy: float = 7.0  # If lipsync enabled


QUALITY_THRESHOLDS = QualityThresholds()

# ===== EMOTION TEMPLATES =====

EMOTION_TEMPLATES = {
    AdCategory.UGC_TESTIMONIAL: {
        "professional": "Professional, confident, trustworthy voice delivering genuine testimonial",
        "casual": "Friendly, relatable, authentic creator voice sharing personal experience",
        "energetic": "Enthusiastic, excited voice expressing genuine delight with product",
        "emotional": "Warm, heartfelt voice sharing emotional connection to product",
    },
    AdCategory.FOUNDER_TALKING_HEAD: {
        "authoritative": "Authoritative, knowledgeable founder voice establishing expertise",
        "inspiring": "Inspiring, motivational voice sharing product vision and mission",
        "technical": "Clear, technical founder voice explaining product features",
        "personal": "Personal, passionate founder voice sharing journey and story",
    },
    AdCategory.PROBLEM_SOLUTION: {
        "empathetic": "Empathetic voice acknowledging customer pain point",
        "reassuring": "Reassuring voice presenting confident solution",
        "energetic": "Energetic voice celebrating solution effectiveness",
        "narrative": "Narrative voice guiding through problem-to-solution journey",
    },
    AdCategory.PRODUCT_DEMO_LIFESTYLE: {
        "aspirational": "Aspirational voice depicting ideal lifestyle with product",
        "functional": "Clear, functional voice explaining product usage",
        "lifestyle": "Lifestyle voice emphasizing ease and comfort of use",
        "inspiring": "Inspiring voice showing product transformation potential",
    },
    AdCategory.INNER_MONOLOGUE: {
        "reflective": "Reflective, introspective voice sharing inner thoughts",
        "playful": "Playful, humorous voice with witty inner commentary",
        "emotional": "Emotional, vulnerable voice expressing genuine feelings",
        "relatable": "Relatable, conversational voice sharing universal experience",
    },
    AdCategory.CINEMATIC_NARRATION: {
        "documentary": "Documentary-style narrator voice with gravitas",
        "poetic": "Poetic, lyrical narrator voice with artistic flair",
        "cinematic": "Cinematic, epic narrator voice commanding attention",
        "intimate": "Intimate, personal narrator voice creating connection",
    },
    AdCategory.CINEMATIC_BROLL: {
        "ambient": "Ambient, minimalist approach letting visuals speak",
        "epic": "Epic, orchestral narrator voice with grand scale",
        "artistic": "Artistic, refined narrator voice emphasizing craft",
        "emotional": "Emotional narrator voice creating deep resonance",
    },
}

# ===== PLATFORM ASPECT RATIOS =====

PLATFORM_ASPECT_RATIOS = {
    "instagram_reels": "9:16",
    "tiktok": "9:16",
    "youtube_shorts": "9:16",
    "facebook_feed": "1:1",
    "facebook_stories": "9:16",
    "youtube": "16:9",
    "linkedin": "1:1",
}

# ===== MODEL ROUTING BY CATEGORY =====

MODEL_ROUTING_BY_CATEGORY = {
    AdCategory.UGC_TESTIMONIAL: "kling_o3_standard_reference",
    AdCategory.FOUNDER_TALKING_HEAD: "kling_o3_standard_reference",
    AdCategory.PROBLEM_SOLUTION: "kling_o3_standard_reference",
    AdCategory.PRODUCT_DEMO_LIFESTYLE: "seedance_v1_lite_reference",
    AdCategory.INNER_MONOLOGUE: "kling_o3_standard_reference",
    AdCategory.CINEMATIC_NARRATION: "fal_ltx23_i2v",
    AdCategory.CINEMATIC_BROLL: "fal_ltx23_i2v",
}
