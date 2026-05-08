from __future__ import annotations

from dataclasses import asdict, dataclass, field
import re
from typing import Any

from app.core.shared_config import load_shared_json


ALLOWED_SCRIPT_MODES = {"auto_generate", "improve_draft", "use_exact_script"}
CATEGORY_ALIASES = {
    "clothing": "fashion_footwear",
    "footwear": "fashion_footwear",
    "bags_accessories": "fashion_footwear",
    "jewellery": "fashion_footwear",
    "beauty_skincare": "skincare_beauty",
    "food_beverage": "food_snacks",
    "electronics": "electronics_gadgets",
    "home_decor": "home_kitchen",
    "fitness_wellness": "health_wellness",
    "kids_toys": "baby_kids",
    "other": "generic_ecommerce",
}


@dataclass(frozen=True)
class AvatarProductWorkflowFields:
    recipe_id: str = "avatar_product"
    product_name: str = ""
    brand_name: str = ""
    product_category: str = ""
    product_subcategory: str = ""
    campaign_objective: str = ""
    platform: str = ""
    duration_seconds: int = 15
    language: str = "English"
    target_audience: str = ""
    audience_age_range: str = ""
    audience_lifestyle: str = ""
    main_benefit: str = ""
    secondary_benefit: str = ""
    key_problem_solved: str = ""
    desired_feeling: str = ""
    brand_tone: str = ""
    avatar_id: str = ""
    avatar_style: str = ""
    voice_style: str = ""
    cta_preference: str = ""
    tagline: str = ""
    offer_text: str = ""
    product_image_uploaded: bool = False
    product_image_count: int = 0
    logo_uploaded: bool = False
    reference_ad_links: list[str] = field(default_factory=list)
    must_show_elements: list[str] = field(default_factory=list)
    must_avoid_elements: list[str] = field(default_factory=list)
    compliance_notes: str = ""
    claims_to_avoid: list[str] = field(default_factory=list)
    category_specific_details: str = ""
    script_mode: str = "auto_generate"
    provided_script: str = ""
    strict_script_lock: bool = False
    script_modified: bool = False
    original_script: str = ""
    final_script: str = ""
    music_vibe: str = ""
    category_confidence: str = "low"


@dataclass(frozen=True)
class AvatarProductWorkflowResult:
    fields: AvatarProductWorkflowFields
    can_generate: bool
    next_question: str | None
    missing_tier_1: list[str]
    missing_tier_2: list[str]
    missing_tier_3: list[str]
    advanced_controls_summary: dict[str, Any]


class AvatarProductWorkflowService:
    def __init__(self) -> None:
        self.config = load_shared_json("shared/config/avatar-product-taxonomy.json")
        self.categories = dict(self.config.get("categories") or {})
        self.default_category = str(self.config.get("default_category") or "generic_ecommerce").strip() or "generic_ecommerce"
        self.tier_1_fields = tuple(str(item).strip() for item in (self.config.get("tier_1_fields") or []) if str(item).strip())
        self.tier_2_fields = tuple(str(item).strip() for item in (self.config.get("tier_2_fields") or []) if str(item).strip())
        self.tier_3_fields = tuple(str(item).strip() for item in (self.config.get("tier_3_fields") or []) if str(item).strip())
        self.field_hints = dict(self.config.get("field_hints") or {})

    def assess(
        self,
        *,
        message: str,
        inputs: dict[str, Any] | None = None,
        image_urls: list[str] | None = None,
        avatar_id: str | None = None,
        advanced_controls: dict[str, Any] | None = None,
    ) -> AvatarProductWorkflowResult:
        normalized_inputs = dict(inputs or {})
        controls = dict(advanced_controls or {})
        merged_source = {**normalized_inputs, **controls}
        image_candidates = [str(item).strip() for item in (image_urls or []) if str(item).strip()]
        if not image_candidates and str(merged_source.get("image") or "").strip():
            image_candidates = [str(merged_source.get("image")).strip()]

        explicit_category = self._clean_text(
            merged_source.get("product_category") or merged_source.get("productCategory") or merged_source.get("category")
        )
        explicit_category = CATEGORY_ALIASES.get(explicit_category, explicit_category)
        detected_category, detected_subcategory, confidence = self.detect_category(
            message=message,
            explicit_category=explicit_category,
            explicit_subcategory=self._clean_text(
                merged_source.get("product_subcategory") or merged_source.get("productSubcategory") or merged_source.get("subcategory")
            ),
        )

        product_name = self._first_nonempty(
            merged_source.get("product_name"),
            merged_source.get("productName"),
            self._extract_product_name(message),
        )
        # 🔥 FIX: boost category detection using product_name
        if product_name and detected_category == self.default_category:
            detected_category, detected_subcategory, confidence = self.detect_category(
                message=product_name,
                explicit_category=None,
                explicit_subcategory=None,
            )
        brand_name = self._first_nonempty(
            merged_source.get("brand_name"),
            merged_source.get("brandName"),
            self._extract_brand_name(message),
        )
        platform = self._first_nonempty(
            merged_source.get("platform"),
            self._extract_platform(message),
        )
        target_audience = self._first_nonempty(
            merged_source.get("target_audience"),
            merged_source.get("targetAudience"),
            self._extract_target_audience(message),
        )
        main_benefit = self._first_nonempty(
            merged_source.get("main_benefit"),
            merged_source.get("mainBenefit"),
            self._extract_main_benefit(message, detected_category),
        )
        key_problem_solved = self._first_nonempty(
            merged_source.get("key_problem_solved"),
            merged_source.get("keyProblemSolved"),
            self._extract_problem(message),
        )
        campaign_objective = self._first_nonempty(
            merged_source.get("campaign_objective"),
            merged_source.get("campaignObjective"),
            self._extract_campaign_objective(message),
        )
        if not campaign_objective:
            campaign_objective = "drive_purchases" if detected_category != "local_service" else "drive_bookings"

        desired_feeling = self._first_nonempty(
            merged_source.get("desired_feeling"),
            merged_source.get("desiredFeeling"),
            self._extract_desired_feeling(message),
        )
        category_specific_details = self._first_nonempty(
            merged_source.get("category_specific_details"),
            merged_source.get("categorySpecificDetails"),
        )
        if not category_specific_details:
            category_specific_details = self._default_category_specific_details(detected_category, detected_subcategory, message)

        script_mode = self._normalize_script_mode(merged_source.get("script_mode") or merged_source.get("scriptMode"))
        provided_script = self._clean_text(merged_source.get("provided_script") or merged_source.get("providedScript"))
        strict_script_lock = self._coerce_bool(merged_source.get("strict_script_lock") or merged_source.get("strictScriptLock"))
        if script_mode == "use_exact_script" and provided_script:
            strict_script_lock = True

        fields = AvatarProductWorkflowFields(
            recipe_id="avatar_product",
            product_name=product_name,
            brand_name=brand_name,
            product_category=detected_category,
            product_subcategory=detected_subcategory,
            campaign_objective=campaign_objective,
            platform=platform or "Instagram Reels",
            duration_seconds=self._coerce_int(merged_source.get("duration_seconds") or merged_source.get("durationSeconds"), default=15),
            language=self._first_nonempty(merged_source.get("language"), "English"),
            target_audience=target_audience,
            audience_age_range=self._first_nonempty(merged_source.get("audience_age_range"), merged_source.get("audienceAgeRange")),
            audience_lifestyle=self._first_nonempty(
                merged_source.get("audience_lifestyle"),
                merged_source.get("audienceLifestyle"),
                self._extract_lifestyle(message),
            ),
            main_benefit=main_benefit,
            secondary_benefit=self._first_nonempty(merged_source.get("secondary_benefit"), merged_source.get("secondaryBenefit")),
            key_problem_solved=key_problem_solved,
            desired_feeling=desired_feeling,
            brand_tone=self._first_nonempty(
                merged_source.get("brand_tone"),
                merged_source.get("brandTone"),
                "creator_casual",
            ),
            avatar_id=self._clean_text(merged_source.get("avatar_id") or merged_source.get("avatarId") or avatar_id),
            avatar_style=self._first_nonempty(merged_source.get("avatar_style"), merged_source.get("avatarStyle")),
            voice_style=self._first_nonempty(merged_source.get("voice_style"), merged_source.get("voiceStyle")),
            cta_preference=self._first_nonempty(merged_source.get("cta_preference"), merged_source.get("ctaPreference")),
            tagline=self._first_nonempty(merged_source.get("tagline")),
            offer_text=self._first_nonempty(merged_source.get("offer_text"), merged_source.get("offerText")),
            product_image_uploaded=bool(image_candidates),
            product_image_count=len(image_candidates),
            logo_uploaded=self._coerce_bool(merged_source.get("logo_uploaded") or merged_source.get("logoUploaded")),
            reference_ad_links=self._coerce_list(merged_source.get("reference_ad_links") or merged_source.get("referenceAdLinks")),
            must_show_elements=self._coerce_list(merged_source.get("must_show_elements") or merged_source.get("mustShowElements")),
            must_avoid_elements=self._coerce_list(merged_source.get("must_avoid_elements") or merged_source.get("mustAvoidElements")),
            compliance_notes=self._first_nonempty(merged_source.get("compliance_notes"), merged_source.get("complianceNotes")),
            claims_to_avoid=self._coerce_list(merged_source.get("claims_to_avoid") or merged_source.get("claimsToAvoid")),
            category_specific_details=category_specific_details,
            script_mode=script_mode,
            provided_script=provided_script,
            strict_script_lock=strict_script_lock,
            script_modified=False,
            original_script=provided_script,
            final_script=provided_script,
            music_vibe=self._first_nonempty(merged_source.get("music_vibe"), merged_source.get("musicVibe")),
            category_confidence=confidence,
        )

        missing_tier_1 = self._missing_fields(fields, self.tier_1_fields)
        missing_tier_2 = self._missing_fields(fields, self.tier_2_fields)
        missing_tier_3 = self._missing_fields(fields, self.tier_3_fields, skip_script_dependent=True)
        can_generate = not missing_tier_1
        next_question = self._build_next_question(fields, missing_tier_1=missing_tier_1, missing_tier_2=missing_tier_2)
        return AvatarProductWorkflowResult(
            fields=fields,
            can_generate=can_generate,
            next_question=next_question,
            missing_tier_1=missing_tier_1,
            missing_tier_2=missing_tier_2,
            missing_tier_3=missing_tier_3,
            advanced_controls_summary=self._advanced_controls_summary(fields),
        )

    def detect_category(
        self,
        *,
        message: str,
        explicit_category: str | None = None,
        explicit_subcategory: str | None = None,
    ) -> tuple[str, str, str]:
        explicit_category = CATEGORY_ALIASES.get(explicit_category or "", explicit_category or "")
        if explicit_category and explicit_category in self.categories:
            return explicit_category, explicit_subcategory or "", "high"

        haystack = f"{message} {explicit_category or ''} {explicit_subcategory or ''}".lower()
        best_category = self.default_category
        best_subcategory = ""
        best_score = 0
        for category_key, config in self.categories.items():
            category_score = sum(1 for keyword in (config.get("keywords") or []) if str(keyword).lower() in haystack)
            subcategories = dict(config.get("subcategories") or {})
            category_subcategory = ""
            for sub_key, keywords in subcategories.items():
                sub_score = sum(2 for keyword in (keywords or []) if str(keyword).lower() in haystack)
                if sub_score > category_score:
                    category_score = sub_score
                    category_subcategory = str(sub_key)
            if category_score > best_score:
                best_score = category_score
                best_category = str(category_key)
                best_subcategory = category_subcategory

        if best_score == 0 and self._looks_like_home_decor(haystack):
            return "home_kitchen", "home_decor", "medium"
        confidence = "high" if best_score >= 2 else "low"
        if best_score == 0:
            return self.default_category, "", "low"
        return best_category, best_subcategory, confidence

    def category_rules(self, category_key: str) -> dict[str, Any]:
        return dict(self.categories.get(category_key) or self.categories.get(self.default_category) or {})

    def export_fields(self, fields: AvatarProductWorkflowFields) -> dict[str, Any]:
        return asdict(fields)

    def _missing_fields(
        self,
        fields: AvatarProductWorkflowFields,
        field_names: tuple[str, ...],
        *,
        skip_script_dependent: bool = False,
    ) -> list[str]:
        missing: list[str] = []
        for name in field_names:
            value = getattr(fields, name, None)
            if skip_script_dependent and name in {"provided_script", "strict_script_lock"} and fields.script_mode == "auto_generate":
                continue
            if name == "product_image_uploaded":
                if not fields.product_image_uploaded:
                    missing.append(name)
                continue
            if name == "avatar_id":
                if not fields.avatar_id:
                    missing.append(name)
                continue
            if isinstance(value, list):
                if not value:
                    missing.append(name)
            elif isinstance(value, bool):
                if name == "strict_script_lock":
                    if fields.script_mode == "use_exact_script" and not value:
                        missing.append(name)
                elif not value:
                    missing.append(name)
            elif isinstance(value, int):
                if value <= 0:
                    missing.append(name)
            elif not str(value or "").strip():
                missing.append(name)
        return missing

    def _build_next_question(
        self,
        fields: AvatarProductWorkflowFields,
        *,
        missing_tier_1: list[str],
        missing_tier_2: list[str],
    ) -> str | None:
        if fields.category_confidence == "low" and fields.product_category == self.default_category and fields.product_name:
            return (
                "What kind of product is this exactly? Example: soft drink, serum, running shoes, or fast-charging gadget."
            )

        if missing_tier_1:
            primary = missing_tier_1[0]
            hint = str(self.field_hints.get(primary) or "").strip()
            if hint:
                return hint

        category_questions = list(self.category_rules(fields.product_category).get("follow_up_questions") or [])
        if fields.product_category != self.default_category:
            if not fields.category_specific_details and category_questions:
                return str(category_questions[0]).strip()
            if not fields.must_show_elements and len(category_questions) > 1:
                return str(category_questions[1]).strip()

        if missing_tier_2:
            primary = missing_tier_2[0]
            hint = str(self.field_hints.get(primary) or "").strip()
            if hint:
                return hint

        return None



    def _advanced_controls_summary(self, fields: AvatarProductWorkflowFields) -> dict[str, Any]:
        return {
            "campaign_objective": fields.campaign_objective,
            "platform": fields.platform,
            "duration_seconds": fields.duration_seconds,
            "brand_tone": fields.brand_tone,
            "cta_preference": fields.cta_preference,
            "language": fields.language,
            "voice_style": fields.voice_style,
            "music_vibe": fields.music_vibe,
            "offer_text": fields.offer_text,
            "tagline": fields.tagline,
            "script_mode": fields.script_mode,
            "strict_script_lock": fields.strict_script_lock,
            "must_show_elements": fields.must_show_elements,
            "must_avoid_elements": fields.must_avoid_elements,
            "claims_to_avoid": fields.claims_to_avoid,
            "compliance_notes": fields.compliance_notes,
        }

    def _default_category_specific_details(self, category: str, subcategory: str, message: str) -> str:
        if category == "beverage":
            return "Focus on refreshment, temperature cues, and pack-in-hand realism."
        if category == "skincare_beauty":
            return "Focus on texture, skin feel, and believable on-camera application."
        if category == "fashion_footwear":
            return "Focus on comfort, silhouette, and natural on-feet motion."
        if subcategory:
            return f"Lean into the {subcategory.replace('_', ' ')} use case while keeping the demo natural."
        return "Focus on one clear consumer benefit and a believable creator-style showcase."

    def _extract_product_name(self, message: str) -> str:
        cleaned = self._clean_text(message)
        patterns = (
            r"(?:create|make)\s+(?:an?\s+)?(?:avatar\s+product\s+ad|ad)\s+for\s+(.*?)(?:\s+for\s+|\s+using\s+|$)",
            r"(?:for|about)\s+(?:our\s+new\s+)?(.*?)(?:\s+for\s+|\s+using\s+|$)",
        )
        for pattern in patterns:
            match = re.search(pattern, cleaned, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip(" .")
        return ""

    def _extract_brand_name(self, message: str) -> str:
        match = re.search(r"\b(?:for|our new)\s+([A-Z][a-zA-Z0-9&-]+)\b", str(message or ""))
        return match.group(1).strip() if match else ""

    def _extract_platform(self, message: str) -> str:
        lowered = str(message or "").lower()
        if "instagram" in lowered or "reels" in lowered:
            return "Instagram Reels"
        if "youtube shorts" in lowered or "shorts" in lowered:
            return "YouTube Shorts"
        if "tiktok" in lowered:
            return "TikTok"
        if "amazon" in lowered:
            return "Amazon listing video"
        return ""

    def _extract_target_audience(self, message: str) -> str:
        patterns = (
            r"for\s+([a-z0-9 ,/-]+?)(?:\s+(?:on|using|with|who|that|looking)|[.])",
            r"target(?:ing)?\s+([a-z0-9 ,/-]+?)(?:[.])",
        )
        lowered = str(message or "")
        for pattern in patterns:
            match = re.search(pattern, lowered, flags=re.IGNORECASE)
            if match:
                candidate = match.group(1).strip(" .")
                if not self._looks_like_product_phrase(candidate):
                    return candidate
        lowered_message = lowered.lower()
        if "wall clock" in lowered_message or "clock" in lowered_message:
            return "home decor shoppers, gift buyers, and apartment owners"
        if "serum" in lowered_message or "skincare" in lowered_message or "beauty" in lowered_message:
            return "working women and skincare shoppers"
        if "software" in lowered_message or "saas" in lowered_message or "app" in lowered_message:
            return "founders, marketers, and software buyers"
        return ""

    def _extract_main_benefit(self, message: str, category: str) -> str:
        lowered = str(message or "").lower()
        if "wall clock" in lowered or "clock" in lowered:
            return "lightweight design that is easy to hang and style"
        benefit_keywords = (
            "refreshment",
            "hydration",
            "glow",
            "comfort",
            "fast charging",
            "performance",
            "protein",
            "lightweight",
            "convenience",
            "taste",
            "energy",
            "focus",
        )
        for benefit in benefit_keywords:
            if benefit in lowered:
                return benefit
        if category == "beverage":
            return "refreshment"
        if category == "home_kitchen":
            return "practical everyday usefulness"
        return ""

    def _extract_problem(self, message: str) -> str:
        lowered = str(message or "")
        match = re.search(r"(?:because|due to|leading to)\s+(.+?)(?:[.]|$)", lowered, flags=re.IGNORECASE)
        return match.group(1).strip(" .") if match else ""

    def _extract_campaign_objective(self, message: str) -> str:
        lowered = str(message or "").lower()
        if any(token in lowered for token in {"buy", "purchase", "shop", "order"}):
            return "drive_purchases"
        if any(token in lowered for token in {"click", "traffic", "website"}):
            return "get_clicks"
        if any(token in lowered for token in {"awareness", "launch", "introduce"}):
            return "build_awareness"
        if any(token in lowered for token in {"book", "visit", "call"}):
            return "drive_bookings"
        return ""

    def _extract_desired_feeling(self, message: str) -> str:
        lowered = str(message or "").lower()
        for feeling in ("confident", "refreshed", "energized", "relieved", "stylish", "comfortable"):
            if feeling in lowered:
                return feeling
        return ""

    def _extract_lifestyle(self, message: str) -> str:
        lowered = str(message or "").lower()
        for lifestyle in ("working women", "college students", "urban runners", "busy parents", "creators"):
            if lifestyle in lowered:
                return lifestyle
        return ""

    def _looks_like_product_phrase(self, value: str) -> bool:
        normalized = value.lower()
        product_markers = (
            "wall clock",
            "clock",
            "serum",
            "bottle",
            "charger",
            "speaker",
            "shoes",
            "sneakers",
            "product",
            "wooden",
            "lightweight",
        )
        return any(marker in normalized for marker in product_markers)

    def _looks_like_home_decor(self, haystack: str) -> bool:
        return any(token in haystack for token in ("wall clock", "clock", "decor", "wooden wall"))

    def _normalize_script_mode(self, value: Any) -> str:
        normalized = self._clean_text(value) or "auto_generate"
        return normalized if normalized in ALLOWED_SCRIPT_MODES else "auto_generate"

    def _coerce_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        text = self._clean_text(value)
        if not text:
            return []
        return [segment.strip() for segment in re.split(r"[,\n]+", text) if segment.strip()]

    def _coerce_bool(self, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        normalized = str(value or "").strip().lower()
        return normalized in {"1", "true", "yes", "on"}

    def _coerce_int(self, value: Any, *, default: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed > 0 else default

    def _clean_text(self, value: Any) -> str:
        return " ".join(str(value or "").strip().split())

    def _first_nonempty(self, *values: Any) -> str:
        for value in values:
            cleaned = self._clean_text(value)
            if cleaned:
                return cleaned
        return ""


    def autofill_with_ai(
        self,
        *,
        text: str,
        image_url: str | None = None,
        current_controls: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        text = self._clean_text(text)

        # 🔥 Simple V1 logic (no Qwen yet — safe & fast)
        product_name = self._extract_product_name(text) or text
        detected_category, _subcategory, _confidence = self.detect_category(message=text)
        if "wall clock" in text.lower() or "clock" in text.lower():
            return {
                "product_name": product_name,
                "product_category": "home_kitchen",
                "target_audience": "home decor shoppers, gift buyers, and apartment owners",
                "main_benefit": "lightweight design that is easy to hang and style",
                "desired_feeling": "stylish",
                "must_show_elements": [
                    "clock face",
                    "wood texture",
                    "wall placement context",
                ],
                "must_avoid_elements": [
                    "distorted clock hands",
                    "warped circular shape",
                    "cluttered background",
                ],
                "brand_tone": "creator_casual",
                "cta_preference": "Shop now",
            }

        return {
            "product_name": product_name,
            "product_category": "fashion_footwear" if "bag" in text.lower() else detected_category,
            "target_audience": "women looking for stylish and unique accessories",
            "main_benefit": "adds a stylish handmade touch to everyday outfits",
            "desired_feeling": "stylish",
            "must_show_elements": [
                "crochet texture",
                "premium handmade finish",
                "stylish design",
            ],
            "must_avoid_elements": [
                "cheap plastic look",
                "blurry texture",
                "distorted shape",
            ],
            "brand_tone": "creator_casual",
            "cta_preference": "Shop now",
        }
