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
    - Convert a messy product brief into a clean 3-scene creator-style ad structure
    - Keep spoken lines short for avatar scenes
    - Produce a more grounded showcase visual prompt for image-to-video generation
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
            },
        )

        raw_content = self.client.chat_completion(
            task_type="avatar_product_enhancer",
            system_prompt=(
                "You generate clean structured JSON for short creator-style "
                "avatar product ad pipelines."
            ),
            user_prompt=prompt,
            temperature=0.3,
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

        return f"""
You are an ad-script enhancer for short AI-generated avatar product ads.

Your job is to create a believable 3-scene creator-style product ad.
The output must sound like a real person casually recommending a product, not like ad copy.

Return only valid JSON.
No markdown.
No explanation.

Scene structure:
- Scene 1 = Hook
- Scene 2 = Product experience / showcase
- Scene 3 = Soft CTA

Hard speech rules:
- hook_line: 10 words or fewer
- showcase_line: 12 words or fewer
- cta_line: 10 words or fewer
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
- Showcase should mention feel, texture, absorption, or use experience
- CTA should feel soft, like a suggestion

Script handling rules:
- script_mode=auto_generate: create fresh hook/showcase/CTA from the brief
- script_mode=improve_draft: improve the provided draft respectfully while preserving intent
- script_mode=use_exact_script: do not rewrite the provided script wording; only segment it if needed and preserve brand-safe phrasing

Bad examples:
- "Hey there, glowing skin lovers!"
- "This serum gives you that natural glow, trust me!"
- "Get your bottle now!"

Good examples:
- "My skin felt dull, so I tried this."
- "It feels light and absorbs really fast."
- "Worth trying if you want a simple glow."

Visual prompt rules for showcase_visual_prompt:
- One sentence only
- Must be written for realistic image-to-video generation
- Must include:
  1. avatar/creator identity
  2. product bottle clearly visible
  3. actual application or handling action
  4. camera framing
  5. lighting source
  6. realistic skin/product texture
  7. natural motion
- Do not write it like marketing copy

Notes rules:
- Notes must be short downstream production instructions
- Be specific and actionable
- Mention bottle visibility, texture, motion, realism, or framing
- Avoid vague phrases like "natural skincare experience"

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
        hook_line = self._normalize_spoken_line(parsed.get("hook_line", ""), max_words=10)
        showcase_line = self._normalize_spoken_line(parsed.get("showcase_line", ""), max_words=12)
        cta_line = self._normalize_spoken_line(parsed.get("cta_line", ""), max_words=10)
        showcase_visual_prompt = self._normalize_visual_prompt(
            parsed.get("showcase_visual_prompt", ""),
            enhancer_input,
        )
        voice_tone = self._normalize_voice_tone(parsed.get("voice_tone"), enhancer_input)
        notes = self._normalize_notes(parsed.get("notes"), enhancer_input)

        if not hook_line:
            hook_line = "My skin felt dull, so I tried this."
        if not showcase_line:
            showcase_line = "It feels light and absorbs really fast."
        if not cta_line:
            cta_line = "Worth trying if you want a simple glow."
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

        lowered = text.lower()
        for phrase in self.BANNED_PHRASES:
            lowered = lowered.replace(phrase, "")
        # reapply cleanup to original text through phrase removal
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

        # Avoid trailing orphan punctuation
        text = re.sub(r"[\s,;:]+$", "", text)

        return text

    def _normalize_visual_prompt(
        self,
        value: Any,
        enhancer_input: HFQwenEnhancerInput,
    ) -> str:
        text = self._clean_text(value)
        if not text:
            return self._build_fallback_visual_prompt(enhancer_input)

        lower = text.lower()

        must_add = []
        if "close-up" not in lower and "medium close-up" not in lower and "medium shot" not in lower:
            must_add.append("medium close-up")
        if "natural light" not in lower and "soft natural" not in lower and "daylight" not in lower:
            must_add.append("soft natural light")
        if "realistic" not in lower:
            must_add.append("realistic skin texture")
        if "bottle" not in lower and "product" not in lower and enhancer_input.product_name:
            must_add.append("product bottle clearly visible")
        if not any(word in lower for word in ["applying", "holding", "dispensing", "using"]):
            must_add.append("gently applying the product")

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

        actionable_keywords = ("visible", "texture", "motion", "light", "framing", "label", "realistic")
        useful_notes = [
            note for note in notes if any(keyword in note.lower() for keyword in actionable_keywords)
        ]

        if useful_notes:
            notes = useful_notes

        if len(notes) < 2:
            fallback_notes = [
                "Keep product bottle visible during the showcase shot.",
                "Show lightweight texture with natural hand movement.",
            ]
            for fallback in fallback_notes:
                if fallback not in notes:
                    notes.append(fallback)

        return notes[:2]

    def _build_fallback_visual_prompt(self, enhancer_input: HFQwenEnhancerInput) -> str:
        avatar = enhancer_input.avatar_style or "friendly creator"
        product = enhancer_input.product_name or "product"
        return (
            f"Medium close-up of a {avatar} holding the {product} bottle near the face and "
            f"gently applying it to the cheek, product bottle clearly visible, soft natural "
            f"bathroom light, realistic skin texture and natural hand motion."
        )

    @staticmethod
    def _clean_text(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).strip()
        text = re.sub(r"\s+", " ", text)
        return text
