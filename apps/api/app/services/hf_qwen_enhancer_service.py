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
    product_type: str | None = None
    target_audience: str | None = None
    avatar_style: str | None = None
    brand_tone: str | None = None
    brief: str | None = None
    avatar_prompt_template: str | None = None
    recommended_voice: str | None = None
    has_product_image: bool = False
    reference_image_count: int = 0


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

    DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct"
    DEFAULT_PROVIDER = "auto"
    DEFAULT_TIMEOUT_SECONDS = 90

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
            "product_type": enhancer_input.product_type or "",
            "target_audience": enhancer_input.target_audience or "",
            "avatar_style": enhancer_input.avatar_style or "",
            "brand_tone": enhancer_input.brand_tone or "",
            "brief": enhancer_input.brief or "",
            "avatar_prompt_template": enhancer_input.avatar_prompt_template or "",
            "recommended_voice": enhancer_input.recommended_voice or "",
            "has_product_image": enhancer_input.has_product_image,
            "reference_image_count": enhancer_input.reference_image_count,
        }

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
