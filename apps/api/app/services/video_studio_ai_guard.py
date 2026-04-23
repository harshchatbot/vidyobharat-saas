from __future__ import annotations

import re


RENDER_RELATED_KEYWORDS = {
    "video",
    "render",
    "scene",
    "scenes",
    "hook",
    "cta",
    "showcase",
    "recipe",
    "avatar",
    "product",
    "prompt",
    "script",
    "narration",
    "voice",
    "tts",
    "audio",
    "music",
    "bgm",
    "caption",
    "captions",
    "status",
    "progress",
    "stuck",
    "failed",
    "error",
    "quality",
    "resolution",
    "aspect ratio",
    "model",
    "provider",
    "asset",
    "assets",
    "image",
    "images",
    "thumbnail",
    "output",
    "enhancer",
    "timeline",
    "persona",
    "actor",
    "retry",
    "edit",
    "change",
    "settings",
}

OFF_TOPIC_PATTERNS = (
    re.compile(r"\bcapital of\b", re.IGNORECASE),
    re.compile(r"\bprime minister\b", re.IGNORECASE),
    re.compile(r"\bpresident of\b", re.IGNORECASE),
    re.compile(r"\bweather\b", re.IGNORECASE),
    re.compile(r"\bstock price\b", re.IGNORECASE),
    re.compile(r"\bwho won\b", re.IGNORECASE),
    re.compile(r"\bmovie review\b", re.IGNORECASE),
    re.compile(r"\bmeaning of life\b", re.IGNORECASE),
    re.compile(r"\btranslate this\b", re.IGNORECASE),
)


def is_studio_ai_question_relevant(user_message: str) -> bool:
    text = str(user_message or "").strip().lower()
    if not text:
        return False

    if any(pattern.search(text) for pattern in OFF_TOPIC_PATTERNS):
        return False

    return any(keyword in text for keyword in RENDER_RELATED_KEYWORDS)