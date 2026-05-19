"""Voice preview service with per-user caching and credit-safe charging."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any

from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from app.core.config import get_settings
from app.providers.firebase import get_firestore_client
from app.services.credit_service import CreditService
from app.services.fal_video_service import FalVideoService

logger = logging.getLogger(__name__)

_STORYBOARD_GEMINI_TTS_VOICE_ALIASES: dict[str, str] = {
    "alex": "Kore",
    "emma": "Aoede",
    "james": "Orus",
    "sophia": "Leda",
    "michael": "Iapetus",
    "olivia": "Aoede",
    "amit": "Orus",
    "priya": "Kore",
    "rajesh": "Iapetus",
    "anjali": "Leda",
    "vikram": "Orus",
    "sneha": "Aoede",
}

_STORYBOARD_GEMINI_TTS_LANGUAGE_ALIASES: dict[str, str] = {
    "en": "English (India)",
    "english": "English (India)",
    "english (india)": "English (India)",
    "hi": "Hindi (India)",
    "hindi": "Hindi (India)",
    "hindi (india)": "Hindi (India)",
    "hinglish": "Hindi (India)",
}

_STORYBOARD_GEMINI_TTS_VALID_VOICES: set[str] = {
    "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe",
    "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome", "Fenrir", "Gacrux",
    "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Pulcherrima", "Puck",
    "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel",
    "Vindemiatrix", "Zephyr", "Zubenelgenubi",
}

_STORYBOARD_GEMINI_TTS_VALID_LANGUAGES: set[str] = {
    "English (India)",
    "English (US)",
    "English (UK)",
    "English (Australia)",
    "Hindi (India)",
}


def normalize_storyboard_tts_literals(voice: str, language_code: str) -> tuple[str, str]:
    raw_voice = str(voice or "").strip()
    raw_language = str(language_code or "").strip()

    voice_candidate = _STORYBOARD_GEMINI_TTS_VOICE_ALIASES.get(raw_voice.lower(), raw_voice)
    if voice_candidate not in _STORYBOARD_GEMINI_TTS_VALID_VOICES:
        voice_candidate = "Kore"

    language_candidate = _STORYBOARD_GEMINI_TTS_LANGUAGE_ALIASES.get(raw_language.lower(), raw_language)
    if language_candidate not in _STORYBOARD_GEMINI_TTS_VALID_LANGUAGES:
        language_candidate = "English (India)"

    return voice_candidate, language_candidate


@dataclass(frozen=True)
class AudioPreview:
    """Generated voice preview audio."""

    audio_url: str
    duration_seconds: float
    voice: str
    language: str
    scene_count: int  # How many lines previewed
    cached: bool = False
    credits_deducted: int = 0
    current_balance: int | None = None


class VoicePreviewService:
    """
    Generates short voice previews for user voice selection.

    Uses Gemini Flash TTS via FAL API.
    Only generates first 2 lines and charges on cache miss.
    """

    def __init__(self) -> None:
        self.fal_service = FalVideoService()
        self.credit_service = CreditService()
        self.firestore = get_firestore_client()
        self.settings = get_settings()

    def generate_preview(
        self,
        project_id: str,
        user_id: str,
        tagged_script: str,
        voice: str,
        language_code: str,
        ad_category: str,
        preview_text: str | None = None,
        style_instructions: str | None = None,
    ) -> AudioPreview:
        """
        Generate a short voice preview for user selection.

        Args:
            project_id: Project ID for logging
            user_id: User ID for credit deduction
            tagged_script: Emotion-tagged script (will extract first 2 lines)
            voice: Voice name (e.g., "Kore", "Nova")
            language_code: Language code (e.g., "English (India)")
            ad_category: Ad category for logging

        Returns:
            AudioPreview with audio URL and metadata

        Raises:
            RuntimeError: If preview generation fails
            ValueError: If insufficient credits
        """
        normalized_voice, normalized_language_code = normalize_storyboard_tts_literals(voice, language_code)

        # Use explicit preview text when provided by UI; otherwise extract from script.
        if preview_text and str(preview_text).strip():
            preview_text = self._sanitize_preview_text(str(preview_text), line_count=2)
        else:
            preview_text = self._extract_preview_lines(tagged_script, line_count=2)

        if not preview_text or len(preview_text) < 10:
            raise ValueError("Script is too short to generate preview")

        logger.info(
            "storyboard_voice_preview_cache_check",
            extra={
                "project_id": project_id,
                "user_id": user_id,
                "voice": normalized_voice,
                "language": normalized_language_code,
            },
        )
        preview_cost = int(getattr(self.settings, "storyboard_tts_preview_credits", 1) or 1)
        preview_text_hash = hashlib.sha256(preview_text.encode("utf-8")).hexdigest()
        cache_key = f"{user_id}:{normalized_language_code}:{normalized_voice}:{preview_text_hash}:fal_gemini_31_flash_tts"
        cache_doc = self.firestore.collection("tts_preview_cache").document(cache_key).get()
        if cache_doc.exists:
            cached_data = cache_doc.to_dict() or {}
            cached_url = str(cached_data.get("audio_url") or "").strip()
            if cached_url:
                self.firestore.collection("tts_preview_cache").document(cache_key).set(
                    {"last_used_at": SERVER_TIMESTAMP},
                    merge=True,
                )
                logger.info("storyboard_voice_preview_cache_hit", extra={"project_id": project_id, "user_id": user_id})
                balance = self.credit_service.get_user_credit_balance(user_id)
                logger.info("storyboard_voice_preview_credit_skipped_cached", extra={"project_id": project_id, "user_id": user_id})
                return AudioPreview(
                    audio_url=cached_url,
                    duration_seconds=float(cached_data.get("duration_seconds") or self._estimate_audio_duration(preview_text)),
                    voice=normalized_voice,
                    language=normalized_language_code,
                    scene_count=2,
                    cached=True,
                    credits_deducted=0,
                    current_balance=balance,
                )
        logger.info("storyboard_voice_preview_cache_miss", extra={"project_id": project_id, "user_id": user_id})
        balance = self.credit_service.get_user_credit_balance(user_id)
        logger.info("storyboard_voice_preview_credit_check", extra={"project_id": project_id, "user_id": user_id, "balance": balance, "cost": preview_cost})
        if balance < preview_cost:
            raise ValueError("insufficient_credits: You need 1 credit to generate this voice preview.")

        idempotency_key = f"{project_id}_voice_preview_{normalized_voice}_{normalized_language_code}_{preview_text_hash}"
        try:
            logger.info("storyboard_voice_preview_provider_started", extra={"project_id": project_id, "user_id": user_id})
            audio_url, metadata = self.fal_service.generate_gemini_flash_tts(
                text=preview_text,
                voice=normalized_voice,
                language_code=normalized_language_code,
                style_instructions=style_instructions or f"Generate preview for {ad_category} ad category",
            )
            logger.info("storyboard_voice_preview_provider_completed", extra={"project_id": project_id, "user_id": user_id})

            duration_seconds = self._estimate_audio_duration(preview_text)
            credit_result = self.credit_service.deduct_credits(
                user_id=user_id,
                amount=preview_cost,
                feature_key="tts_preview",
                metadata={
                    "project_id": project_id,
                    "voice": normalized_voice,
                    "language_code": normalized_language_code,
                    "ad_category": ad_category,
                    "preview_text_hash": preview_text_hash,
                },
                source="storyboard_voice_preview",
                idempotency_key=idempotency_key,
            )
            logger.info("storyboard_voice_preview_credit_deducted", extra={"project_id": project_id, "user_id": user_id, "deducted": preview_cost})
            self.firestore.collection("tts_preview_cache").document(cache_key).set(
                {
                    "user_id": user_id,
                    "project_id": project_id,
                    "provider": "fal",
                    "model_key": "fal_gemini_flash_tts",
                    "provider_language_code": normalized_language_code,
                    "provider_voice_name": normalized_voice,
                    "preview_text_hash": preview_text_hash,
                    "audio_url": audio_url,
                    "duration_seconds": duration_seconds,
                    "credits_charged": preview_cost,
                    "created_at": SERVER_TIMESTAMP,
                    "last_used_at": SERVER_TIMESTAMP,
                },
                merge=True,
            )

            logger.info(
                "voice_preview_generation_completed",
                extra={
                    "project_id": project_id,
                    "audio_url": audio_url[:100] if audio_url else "mock_audio",
                    "duration": duration_seconds,
                    "voice": normalized_voice,
                },
            )

            preview = AudioPreview(
                audio_url=audio_url or self._get_mock_audio_url(voice),
                duration_seconds=duration_seconds,
                voice=normalized_voice,
                language=normalized_language_code,
                scene_count=2,
                cached=False,
                credits_deducted=preview_cost,
                current_balance=credit_result.wallet.current_credits,
            )

            return preview

        except Exception as e:
            logger.error(
                "storyboard_voice_preview_failed",
                extra={
                    "project_id": project_id,
                    "voice": normalized_voice,
                    "error": str(e),
                },
            )
            raise RuntimeError(str(e))

    def get_available_voices(self, language_code: str = "English (India)") -> list[dict[str, str]]:
        """
        Get list of available voices for a language.

        Returns list of voice dicts with name and description.
        """
        normalized_language = normalize_storyboard_tts_literals("Kore", language_code)[1]
        if normalized_language == "Hindi (India)":
            return [
                {"name": "Aoede", "description": "Warm Hindi-friendly female voice"},
                {"name": "Kore", "description": "Strong, clear female voice"},
                {"name": "Leda", "description": "Smooth conversational female voice"},
                {"name": "Orus", "description": "Balanced male voice"},
            ]
        return [
            {"name": "Kore", "description": "Warm, clear voice"},
            {"name": "Aoede", "description": "Friendly expressive voice"},
            {"name": "Leda", "description": "Natural conversational voice"},
            {"name": "Orus", "description": "Balanced male voice"},
        ]

    def _extract_preview_lines(self, script: str, line_count: int = 2) -> str:
        """Extract first N lines from script for preview."""
        # Remove emotion tags
        cleaned = script
        for tag in ["[Emotional Context:", "[Language:", "[Delivery:"]:
            if tag in cleaned:
                # Remove lines that start with [ ]
                lines = cleaned.split("\n")
                cleaned = "\n".join([l for l in lines if not l.strip().startswith("[")])

        lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
        preview_lines = lines[:line_count]
        return "\n".join(preview_lines)

    def _sanitize_preview_text(self, text: str, line_count: int = 2) -> str:
        """Keep only clean preview lines and strip metadata tags."""
        lines = []
        for raw in str(text or "").splitlines():
            candidate = raw.strip()
            if not candidate:
                continue
            if candidate.startswith("[") and candidate.endswith("]"):
                continue
            if candidate.lower().startswith("[emotional context"):
                continue
            if candidate.lower().startswith("[language"):
                continue
            if candidate.lower().startswith("[delivery"):
                continue
            lines.append(candidate)
            if len(lines) >= line_count:
                break
        return "\n".join(lines).strip()

    def _estimate_audio_duration(self, text: str) -> float:
        """
        Estimate audio duration from text.

        Rough estimate: 150 words per minute = 4 seconds per 10 words.
        """
        word_count = len(text.split())
        seconds = (word_count / 150.0) * 60.0
        return max(2.0, min(seconds, 30.0))  # Clamp between 2-30 seconds

    def _get_mock_audio_url(self, voice: str) -> str:
        """
        Get a mock audio URL for Phase 1 development.

        Returns a data URI with a simple audio tone or a placeholder URL.
        """
        # For Phase 1, return a base64-encoded silent audio placeholder
        # In production, this would be replaced with actual FAL API call
        mock_audio_data = (
            "data:audio/mp3;base64,"
            "ID3BAAAAAAADAAAAAgAAAAEAAA=="  # Minimal MP3 header with silence
        )
        return mock_audio_data
