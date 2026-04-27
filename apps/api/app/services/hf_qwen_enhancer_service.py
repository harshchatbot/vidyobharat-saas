import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings
from app.services.llm.hf_qwen_client import HFQwenChatClient

logger = logging.getLogger(__name__)


@dataclass
class HFQwenEnhancerInput:
    product_name: str
    brand_name: str | None = None
    product_type: str | None = None
    product_subcategory: str | None = None
    campaign_objective: str | None = None
    platform: str | None = None
    duration_seconds: int | None = None
    language: str | None = None
    target_audience: str | None = None
    audience_age_range: str | None = None
    audience_lifestyle: str | None = None
    main_benefit: str | None = None
    secondary_benefit: str | None = None
    key_problem_solved: str | None = None
    desired_feeling: str | None = None
    avatar_style: str | None = None
    brand_tone: str | None = None
    voice_style: str | None = None
    cta_preference: str | None = None
    tagline: str | None = None
    offer_text: str | None = None
    brief: str | None = None
    avatar_prompt_template: str | None = None
    recommended_voice: str | None = None
    has_product_image: bool = False
    reference_image_count: int = 0
    must_show_elements: list[str] | None = None
    must_avoid_elements: list[str] | None = None
    compliance_notes: str | None = None
    claims_to_avoid: list[str] | None = None
    category_specific_details: str | None = None
    script_mode: str = "auto_generate"
    provided_script: str | None = None
    strict_script_lock: bool = False
    category_prompt_rules: dict[str, Any] | None = None


@dataclass
class HFQwenEnhancerResult:
    hook_line: str
    showcase_line: str
    cta_line: str
    showcase_visual_prompt: str
    voice_tone: str
    notes: list[str]
    raw_response: str | None = None
    model: str | None = None
    provider: str | None = None


class HFQwenEnhancerService:
    """
    Hugging Face Qwen-backed enhancer for avatar product ads.

    Purpose:
    - Convert a messy product brief into a clean creator-style ad script
    - Keep spoken lines short enough for the requested duration
    - Produce grounded visual guidance without forcing every product into skincare/bottle behavior
    """

    BANNED_PHRASES = {
        "hey there",
        "glow-up",
        "trust me",
        "perfect",
        "must-have",
        "amazing",
        "best",
        "premium",
        "shop now",
        "get your bottle now",
        "order now",
        "buy now",
        "click to shop now",
        "game-changing",
    }

    def __init__(
        self,
        settings: Settings | None = None,
        api_key: str | None = None,
        model: str | None = None,
        provider: str | None = None,
        timeout_seconds: int | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.client = HFQwenChatClient(
            settings=self.settings,
            api_key=api_key,
            model=model,
            provider=provider,
            timeout_seconds=timeout_seconds,
        )
        self.model = self.client.selected_model_name()
        self.provider = self.client.provider_name()

    def enhance_avatar_product_ad(
        self,
        enhancer_input: HFQwenEnhancerInput,
    ) -> HFQwenEnhancerResult:
        script_mode = str(enhancer_input.script_mode or "auto_generate").strip() or "auto_generate"
        if script_mode == "use_exact_script" and str(enhancer_input.provided_script or "").strip():
            return self._segment_locked_script(enhancer_input)

        prompt = self._build_v4_prompt(enhancer_input)

        logger.info(
            "hf_qwen_enhancer_started",
            extra={
                "model": self.model,
                "provider": self.provider,
                "product_name": enhancer_input.product_name,
                "product_type": enhancer_input.product_type,
                "product_subcategory": enhancer_input.product_subcategory,
                "duration_seconds": enhancer_input.duration_seconds,
            },
        )

        raw_content = self.client.chat_completion(
            task_type="avatar_product_enhancer",
            system_prompt=(
                "You generate clean structured JSON for short creator-style "
                "avatar product ad pipelines."
            ),
            user_prompt=prompt,
            temperature=0.25,
            max_tokens=700,
        )
        if not raw_content:
            raise ValueError("HF Qwen enhancer returned an empty response.")

        parsed = self._parse_json_response(raw_content)
        normalized = self._normalize_output(parsed, enhancer_input)

        result = HFQwenEnhancerResult(
            hook_line=normalized["hook_line"],
            showcase_line=normalized["showcase_line"],
            cta_line=normalized["cta_line"],
            showcase_visual_prompt=normalized["showcase_visual_prompt"],
            voice_tone=normalized["voice_tone"],
            notes=normalized["notes"],
            raw_response=raw_content,
            model=self.model,
            provider=self.provider,
        )

        logger.info(
            "hf_qwen_enhancer_completed",
            extra={
                "model": self.model,
                "provider": self.provider,
                "hook_line": result.hook_line,
                "showcase_line": result.showcase_line,
                "cta_line": result.cta_line,
            },
        )

        return result

    def _script_limits_for_duration(self, duration_seconds: int | None) -> dict[str, int]:
        try:
            duration = int(duration_seconds or 15)
        except (TypeError, ValueError):
            duration = 15

        # Conservative spoken-word budgets so TTS/lipsync does not feel rushed or cut.
        if duration <= 5:
            return {"hook_words": 4, "showcase_words": 6, "cta_words": 4, "total_words": 14}
        if duration <= 10:
            return {"hook_words": 7, "showcase_words": 10, "cta_words": 7, "total_words": 24}
        if duration <= 15:
            return {"hook_words": 9, "showcase_words": 14, "cta_words": 9, "total_words": 32}
        return {"hook_words": 14, "showcase_words": 24, "cta_words": 16, "total_words": 54}

    def _product_identity_text(self, enhancer_input: HFQwenEnhancerInput) -> str:
        parts = [
            f"Product name: {self._clean_text(enhancer_input.product_name)}" if self._clean_text(enhancer_input.product_name) else "",
            f"Product type/category: {self._clean_text(enhancer_input.product_type)}" if self._clean_text(enhancer_input.product_type) else "",
            f"Product subcategory: {self._clean_text(enhancer_input.product_subcategory)}" if self._clean_text(enhancer_input.product_subcategory) else "",
            f"Category details: {self._clean_text(enhancer_input.category_specific_details)}" if self._clean_text(enhancer_input.category_specific_details) else "",
            f"Must show: {', '.join(enhancer_input.must_show_elements or [])}" if enhancer_input.must_show_elements else "",
            f"Must avoid: {', '.join(enhancer_input.must_avoid_elements or [])}" if enhancer_input.must_avoid_elements else "",
        ]
        return "\n".join(part for part in parts if part).strip()

    def _product_identity_blob(self, enhancer_input: HFQwenEnhancerInput) -> str:
        return " ".join(
            [
                self._clean_text(enhancer_input.product_name),
                self._clean_text(enhancer_input.product_type),
                self._clean_text(enhancer_input.product_subcategory),
                self._clean_text(enhancer_input.category_specific_details),
                " ".join(enhancer_input.must_show_elements or []),
            ]
        ).lower()

    def _category_script_guidance(self, enhancer_input: HFQwenEnhancerInput) -> str:
        identity = self._product_identity_blob(enhancer_input)
        must_show = ", ".join(enhancer_input.must_show_elements or []) or "use the most important visible product detail"
        must_avoid = ", ".join(enhancer_input.must_avoid_elements or []) or "do not invent unrelated product types"

        if any(word in identity for word in ["earring", "earrings"]):
            return (
                "This product is earrings. Write only about earrings. Do not mention watches, skincare, serum, "
                "bottle, cream, necklace, pendant, ring, bracelet, or any other product type. Good angles: "
                "elegant sparkle, styling, gifting, lightweight look. "
                f"Must show/mention only if natural: {must_show}. Must avoid: {must_avoid}."
            )

        if any(word in identity for word in ["jewellery", "jewelry", "necklace", "pendant", "ring", "bracelet"]):
            return (
                "This product is jewellery. Use the exact jewellery type if provided. Do not change it into watches, "
                "skincare, bottles, clothes, or another jewellery type. Good angles: elegance, shine, gifting, outfit styling. "
                f"Must show/mention only if natural: {must_show}. Must avoid: {must_avoid}."
            )

        if any(word in identity for word in ["skincare", "skin care", "serum", "cream", "lotion", "beauty", "cosmetic"]):
            return (
                "This product is skincare/beauty. Write about feel, texture, routine, glow, or ease of use. "
                "Do not overclaim medical results. "
                f"Must show/mention only if natural: {must_show}. Must avoid: {must_avoid}."
            )

        if any(word in identity for word in ["shoe", "shoes", "sneaker", "sneakers", "footwear", "sandal"]):
            return (
                "This product is footwear. Write about comfort, style, everyday use, or gifting. Do not mention skincare, "
                "jewellery, bottle, or watch. "
                f"Must show/mention only if natural: {must_show}. Must avoid: {must_avoid}."
            )

        if any(word in identity for word in ["crochet", "handmade", "handcrafted", "decor", "craft", "handicraft"]):
            return (
                "This product is handmade/craft/decor. Write about handmade feel, uniqueness, texture, gifting, or home decor. "
                "Do not mention skincare, bottle, watch, or jewellery unless the product is jewellery. "
                f"Must show/mention only if natural: {must_show}. Must avoid: {must_avoid}."
            )

        return (
            "Use the exact product type from the input. Do not invent another product category. "
            f"Must show/mention only if natural: {must_show}. Must avoid: {must_avoid}."
        )

    def _build_v4_prompt(self, enhancer_input: HFQwenEnhancerInput) -> str:
        payload = {
            "product_name": enhancer_input.product_name,
            "brand_name": enhancer_input.brand_name or "",
            "product_type": enhancer_input.product_type or "",
            "product_subcategory": enhancer_input.product_subcategory or "",
            "campaign_objective": enhancer_input.campaign_objective or "",
            "platform": enhancer_input.platform or "",
            "duration_seconds": enhancer_input.duration_seconds or 15,
            "language": enhancer_input.language or "",
            "target_audience": enhancer_input.target_audience or "",
            "audience_age_range": enhancer_input.audience_age_range or "",
            "audience_lifestyle": enhancer_input.audience_lifestyle or "",
            "main_benefit": enhancer_input.main_benefit or "",
            "secondary_benefit": enhancer_input.secondary_benefit or "",
            "key_problem_solved": enhancer_input.key_problem_solved or "",
            "desired_feeling": enhancer_input.desired_feeling or "",
            "avatar_style": enhancer_input.avatar_style or "",
            "brand_tone": enhancer_input.brand_tone or "",
            "voice_style": enhancer_input.voice_style or "",
            "cta_preference": enhancer_input.cta_preference or "",
            "tagline": enhancer_input.tagline or "",
            "offer_text": enhancer_input.offer_text or "",
            "brief": enhancer_input.brief or "",
            "avatar_prompt_template": enhancer_input.avatar_prompt_template or "",
            "recommended_voice": enhancer_input.recommended_voice or "",
            "has_product_image": enhancer_input.has_product_image,
            "reference_image_count": enhancer_input.reference_image_count,
            "must_show_elements": enhancer_input.must_show_elements or [],
            "must_avoid_elements": enhancer_input.must_avoid_elements or [],
            "compliance_notes": enhancer_input.compliance_notes or "",
            "claims_to_avoid": enhancer_input.claims_to_avoid or [],
            "category_specific_details": enhancer_input.category_specific_details or "",
            "script_mode": enhancer_input.script_mode,
            "provided_script": enhancer_input.provided_script or "",
            "strict_script_lock": enhancer_input.strict_script_lock,
            "category_prompt_rules": enhancer_input.category_prompt_rules or {},
        }

        category_rules = enhancer_input.category_prompt_rules or {}
        category_context = str(category_rules.get("category_context") or "").strip()
        showcase_focus = str(category_rules.get("showcase_focus") or "").strip()
        cta_style = str(category_rules.get("cta_style") or "").strip()
        visual_requirements = [str(item).strip() for item in (category_rules.get("visual_requirements") or []) if str(item).strip()]
        script_limits = self._script_limits_for_duration(enhancer_input.duration_seconds)
        product_identity_text = self._product_identity_text(enhancer_input)
        category_script_guidance = self._category_script_guidance(enhancer_input)

        return f"""
You are an ad-script enhancer for short AI-generated avatar product ads.

Your job is to create a believable creator-style product ad that fits the requested duration.
The output must sound like a real person casually recommending the exact product, not like ad copy.

Return only valid JSON.
No markdown.
No explanation.

Scene structure:
- Scene 1 = Hook
- Scene 2 = Product experience / showcase
- Scene 3 = Soft CTA

Hard speech rules:
- Target duration: {enhancer_input.duration_seconds or 15} seconds
- Total spoken script must be {script_limits["total_words"]} words or fewer
- hook_line: {script_limits["hook_words"]} words or fewer
- showcase_line: {script_limits["showcase_words"]} words or fewer
- cta_line: {script_limits["cta_words"]} words or fewer
- If duration is 5 seconds, write one very short complete thought split across hook/showcase/CTA
- No sentence should feel unfinished or abruptly cut
- Simple spoken English
- Casual, natural, believable
- One idea per line
- No greetings
- No hype
- No corporate ad tone
- No direct hard-sell CTA
- Avoid exclamation marks unless truly necessary

Do not use phrases like:
["hey there", "glow-up", "trust me", "perfect", "must-have", "amazing", "best", "premium", "shop now", "get your bottle now", "order now", "buy now", "click to shop now", "game-changing"]

Style guidance:
- Hook should feel like a relatable personal observation
- Showcase should mention the most believable benefit for the exact product type
- CTA should feel soft, like a suggestion
- Never invent a different product category
- Use the exact product name/type/subcategory from the input

Script handling rules:
- script_mode=auto_generate: create fresh hook/showcase/CTA from the brief
- script_mode=improve_draft: improve the provided draft respectfully while preserving intent
- script_mode=use_exact_script: do not rewrite the provided script wording; only segment it if needed and preserve brand-safe phrasing

Bad examples:
- "Hey there, glowing skin lovers!"
- "This serum gives you that natural glow, trust me!"
- "Get your bottle now!"
- "Chiming watches add a touch of elegance."
- "It feels smooth, fits ly."

Good examples:
- "These earrings add instant elegance."
- "Soft sparkle, easy to style."
- "Check them out."
- "This feels light for daily use."
- "Worth trying if it fits your routine."

Visual prompt rules for showcase_visual_prompt:
- One sentence only
- Must be written for realistic image-to-video generation
- Must include:
  1. avatar/creator identity
  2. exact product type clearly visible
  3. product held or presented naturally
  4. camera framing
  5. lighting source
  6. realistic product texture/material
  7. natural motion
- Do not force skincare application unless the product is skincare
- Do not force bottle visibility unless the product is a bottle/tube/jar
- Do not write it like marketing copy

Notes rules:
- Notes must be short downstream production instructions
- Be specific and actionable
- Mention visibility, texture/material, motion, lighting, realism, or framing
- Avoid vague phrases like "natural product experience"

Product identity lock:
{product_identity_text or "No product identity provided."}

Category/script guidance:
{category_script_guidance}

Category context:
- {category_context or "No extra category context provided."}
- Showcase focus: {showcase_focus or "Use the strongest believable product-use moment."}
- CTA style: {cta_style or "Keep the CTA creator-friendly and simple."}
- Visual requirements: {", ".join(visual_requirements) or "Keep product visibility clear and motion realistic."}

Required JSON format:
{{
  "hook_line": "...",
  "showcase_line": "...",
  "cta_line": "...",
  "showcase_visual_prompt": "...",
  "voice_tone": "...",
  "notes": ["...", "..."]
}}

Input:
{json.dumps(payload, ensure_ascii=False)}
""".strip()

    def _segment_locked_script(self, enhancer_input: HFQwenEnhancerInput) -> HFQwenEnhancerResult:
        lines = self._split_script_preserving_wording(str(enhancer_input.provided_script or "").strip())
        hook_line = lines[0] if lines else enhancer_input.product_name
        showcase_line = lines[1] if len(lines) > 1 else (lines[0] if lines else enhancer_input.brief or enhancer_input.product_name)
        cta_line = lines[2] if len(lines) > 2 else (lines[-1] if lines else enhancer_input.product_name)
        notes = [
            "Preserve the provided script wording as closely as possible.",
            "Keep product visibility and brand-safe delivery consistent.",
        ]
        return HFQwenEnhancerResult(
            hook_line=self._normalize_spoken_line(hook_line, max_words=18),
            showcase_line=self._normalize_spoken_line(showcase_line, max_words=24),
            cta_line=self._normalize_spoken_line(cta_line, max_words=18),
            showcase_visual_prompt=self._build_fallback_visual_prompt(enhancer_input),
            voice_tone=self._normalize_voice_tone(enhancer_input.voice_style or enhancer_input.brand_tone, enhancer_input),
            notes=notes,
            raw_response=enhancer_input.provided_script,
            model=self.model,
            provider=self.provider,
        )

    def _parse_json_response(self, raw_content: str) -> dict[str, Any]:
        cleaned = raw_content.strip()

        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json") :].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[len("```") :].strip()

        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        return json.loads(cleaned)

    def _normalize_output(
        self,
        parsed: dict[str, Any],
        enhancer_input: HFQwenEnhancerInput,
    ) -> dict[str, Any]:
        script_limits = self._script_limits_for_duration(enhancer_input.duration_seconds)

        hook_line = self._normalize_spoken_line(parsed.get("hook_line", ""), max_words=script_limits["hook_words"])
        showcase_line = self._normalize_spoken_line(parsed.get("showcase_line", ""), max_words=script_limits["showcase_words"])
        cta_line = self._normalize_spoken_line(parsed.get("cta_line", ""), max_words=script_limits["cta_words"])
        showcase_visual_prompt = self._normalize_visual_prompt(parsed.get("showcase_visual_prompt", ""), enhancer_input)
        voice_tone = self._normalize_voice_tone(parsed.get("voice_tone"), enhancer_input)
        notes = self._normalize_notes(parsed.get("notes"), enhancer_input)

        if not hook_line or not showcase_line or not cta_line:
            fallback = self._fallback_avatar_product_script(enhancer_input)
            hook_line = hook_line or fallback["hook_line"]
            showcase_line = showcase_line or fallback["showcase_line"]
            cta_line = cta_line or fallback["cta_line"]

        combined_script = " ".join([hook_line, showcase_line, cta_line]).strip()
        if self._script_has_product_conflict(combined_script, enhancer_input) or self._script_has_broken_language(combined_script):
            fallback = self._fallback_avatar_product_script(enhancer_input)
            hook_line = fallback["hook_line"]
            showcase_line = fallback["showcase_line"]
            cta_line = fallback["cta_line"]

        if not showcase_visual_prompt:
            showcase_visual_prompt = self._build_fallback_visual_prompt(enhancer_input)

        return {
            "hook_line": hook_line,
            "showcase_line": showcase_line,
            "cta_line": cta_line,
            "showcase_visual_prompt": showcase_visual_prompt,
            "voice_tone": voice_tone,
            "notes": notes,
        }

    def _fallback_avatar_product_script(self, enhancer_input: HFQwenEnhancerInput) -> dict[str, str]:
        product_name = self._clean_text(enhancer_input.product_name) or "this product"
        identity = self._product_identity_blob(enhancer_input)
        duration = int(enhancer_input.duration_seconds or 15)

        if "earring" in identity:
            if duration <= 5:
                return {
                    "hook_line": "These earrings add instant elegance.",
                    "showcase_line": "Soft sparkle, easy to style.",
                    "cta_line": "Check them out.",
                }
            return {
                "hook_line": "These earrings feel instantly elegant.",
                "showcase_line": "They add soft sparkle without looking too loud.",
                "cta_line": "Check them out if you love earrings.",
            }

        if "jewellery" in identity or "jewelry" in identity:
            if duration <= 5:
                return {
                    "hook_line": f"{product_name} feels elegant.",
                    "showcase_line": "Soft shine, easy to style.",
                    "cta_line": "Check it out.",
                }
            return {
                "hook_line": f"{product_name} feels instantly elegant.",
                "showcase_line": "It adds a soft styling touch.",
                "cta_line": "Check it out if you love jewellery.",
            }

        if any(word in identity for word in ["skincare", "skin care", "serum", "cream", "beauty"]):
            if duration <= 5:
                return {
                    "hook_line": "Skin feeling dull?",
                    "showcase_line": f"{product_name} feels light.",
                    "cta_line": "Try it once.",
                }
            return {
                "hook_line": "My skin felt dull today.",
                "showcase_line": f"{product_name} feels light and easy.",
                "cta_line": "Try it for a simple glow.",
            }

        if any(word in identity for word in ["shoe", "shoes", "sneaker", "footwear", "sandal"]):
            if duration <= 5:
                return {
                    "hook_line": "These look easy to wear.",
                    "showcase_line": "Clean style, everyday comfort.",
                    "cta_line": "Check them out.",
                }
            return {
                "hook_line": "These caught my attention today.",
                "showcase_line": "They look easy to style and comfortable.",
                "cta_line": "Check them out if this fits you.",
            }

        if any(word in identity for word in ["crochet", "handmade", "handcrafted", "decor", "craft", "handicraft"]):
            if duration <= 5:
                return {
                    "hook_line": "This feels beautifully handmade.",
                    "showcase_line": "Unique texture, thoughtful detail.",
                    "cta_line": "Check it out.",
                }
            return {
                "hook_line": "This handmade piece feels special.",
                "showcase_line": "The texture and details make it stand out.",
                "cta_line": "Check it out if you love handmade things.",
            }

        if duration <= 5:
            return {
                "hook_line": f"{product_name} caught my attention.",
                "showcase_line": "Simple, useful, easy to like.",
                "cta_line": "Check it out.",
            }
        return {
            "hook_line": f"{product_name} caught my attention.",
            "showcase_line": "It feels useful, simple, and easy to like.",
            "cta_line": "Check it out if this fits your style.",
        }

    def _script_has_product_conflict(self, text: str, enhancer_input: HFQwenEnhancerInput) -> bool:
        combined = self._clean_text(text).lower()
        identity = self._product_identity_blob(enhancer_input)

        if "earring" in identity:
            conflicts = ["watch", "watches", "skincare", "serum", "bottle", "cream", "necklace", "pendant", "bracelet", "ring"]
            return any(word in combined for word in conflicts)
        if "jewellery" in identity or "jewelry" in identity:
            conflicts = ["watch", "watches", "skincare", "serum", "bottle", "cream"]
            return any(word in combined for word in conflicts)
        if any(word in identity for word in ["skincare", "skin care", "serum", "cream", "beauty"]):
            conflicts = ["earring", "earrings", "necklace", "pendant", "watch", "watches", "shoe", "shoes"]
            return any(word in combined for word in conflicts)
        if any(word in identity for word in ["shoe", "shoes", "sneaker", "footwear"]):
            conflicts = ["serum", "bottle", "cream", "earring", "earrings", "necklace", "watch", "watches"]
            return any(word in combined for word in conflicts)
        return False

    def _script_has_broken_language(self, text: str) -> bool:
        cleaned = self._clean_text(text)
        if not cleaned:
            return True
        broken_patterns = [
            r"\blooks\s+[.?!]",
            r"\bfits\s+ly\b",
            r"\bfeels\s+[.?!]",
            r"\bchiming watches\b",
            r"\b\w+\s+ly[.?!]?\b",
        ]
        return any(re.search(pattern, cleaned, flags=re.IGNORECASE) for pattern in broken_patterns)

    def _split_script_preserving_wording(self, script: str) -> list[str]:
        cleaned = " ".join(str(script or "").split()).strip()
        if not cleaned:
            return []
        sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", cleaned) if segment.strip()]
        if len(sentences) >= 3:
            return [sentences[0], " ".join(sentences[1:-1]).strip() or sentences[1], sentences[-1]]
        if len(sentences) == 2:
            return [sentences[0], sentences[1], sentences[1]]
        words = cleaned.split()
        if len(words) < 9:
            return [cleaned, cleaned, cleaned]
        third = max(1, len(words) // 3)
        return [
            " ".join(words[:third]).strip(),
            " ".join(words[third: third * 2]).strip(),
            " ".join(words[third * 2:]).strip(),
        ]

    def _normalize_spoken_line(self, value: Any, max_words: int) -> str:
        text = self._clean_text(value)
        if not text:
            return ""

        for phrase in self.BANNED_PHRASES:
            pattern = re.compile(re.escape(phrase), flags=re.IGNORECASE)
            text = pattern.sub("", text)

        text = self._clean_text(text)
        text = re.sub(r"[!]{2,}", "!", text)
        text = re.sub(r"\s+", " ", text).strip()

        words = text.split()
        if len(words) > max_words:
            text = " ".join(words[:max_words]).rstrip(",.;:- ")

        text = text.strip()
        text = re.sub(r"[\s,;:]+$", "", text)
        return text

    def _normalize_visual_prompt(self, value: Any, enhancer_input: HFQwenEnhancerInput) -> str:
        text = self._clean_text(value)
        if not text:
            return self._build_fallback_visual_prompt(enhancer_input)

        lower = text.lower()
        identity = self._product_identity_blob(enhancer_input)
        is_bottle_like = any(word in identity for word in ["skincare", "skin care", "serum", "cream", "lotion", "bottle", "tube", "jar"])

        must_add = []
        if "close-up" not in lower and "medium close-up" not in lower and "medium shot" not in lower:
            must_add.append("medium close-up")
        if "natural light" not in lower and "soft natural" not in lower and "daylight" not in lower and "soft indoor" not in lower:
            must_add.append("soft natural light")
        if "realistic" not in lower:
            must_add.append("realistic product texture")
        if "product" not in lower and enhancer_input.product_name:
            if is_bottle_like:
                must_add.append("product packaging clearly visible")
            else:
                must_add.append(f"{enhancer_input.product_name} clearly visible")
        if not any(word in lower for word in ["holding", "presenting", "showing", "applying", "dispensing", "using"]):
            if is_bottle_like:
                must_add.append("holding the product near the face")
            else:
                must_add.append("holding and presenting the product near the camera")

        if must_add:
            text = f"{text.rstrip('.')} , " + ", ".join(must_add)

        text = re.sub(r"\s+", " ", text).strip()
        text = text.replace(" , ", ", ")
        text = text.rstrip(" .") + "."
        return text

    def _normalize_voice_tone(self, value: Any, enhancer_input: HFQwenEnhancerInput) -> str:
        text = self._clean_text(value)
        if text:
            return text
        if enhancer_input.voice_style:
            return enhancer_input.voice_style
        if enhancer_input.brand_tone:
            return enhancer_input.brand_tone
        return "Trustworthy, simple, modern"

    def _normalize_notes(self, value: Any, enhancer_input: HFQwenEnhancerInput) -> list[str]:
        notes: list[str] = []

        if isinstance(value, list):
            for item in value:
                cleaned = self._clean_text(item)
                if cleaned:
                    notes.append(cleaned)

        notes = [note for note in notes if len(note.split()) >= 3]

        actionable_keywords = ("visible", "texture", "material", "motion", "light", "framing", "label", "realistic", "product")
        useful_notes = [note for note in notes if any(keyword in note.lower() for keyword in actionable_keywords)]

        if useful_notes:
            notes = useful_notes

        if len(notes) < 2:
            fallback_notes = [
                "Keep the exact product clearly visible during the showcase shot.",
                "Use natural hand movement with realistic product texture and lighting.",
            ]
            for fallback in fallback_notes:
                if fallback not in notes:
                    notes.append(fallback)

        return notes[:2]

    def _build_fallback_visual_prompt(self, enhancer_input: HFQwenEnhancerInput) -> str:
        avatar = enhancer_input.avatar_style or "friendly creator"
        product = enhancer_input.product_name or "product"
        identity = self._product_identity_blob(enhancer_input)

        if any(word in identity for word in ["skincare", "skin care", "serum", "cream", "lotion", "bottle", "tube", "jar"]):
            return (
                f"Medium close-up of a {avatar} holding {product} near the face, "
                f"product packaging clearly visible, soft natural vanity light, "
                f"realistic skin and product texture, natural hand motion."
            )

        return (
            f"Medium close-up of a {avatar} holding and presenting {product} near the camera, "
            f"product clearly visible, soft natural indoor light, realistic product texture, "
            f"stable creator-style hand motion."
        )

    @staticmethod
    def _clean_text(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).strip()
        text = re.sub(r"\s+", " ", text)
        return text
