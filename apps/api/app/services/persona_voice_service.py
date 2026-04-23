from __future__ import annotations

from typing import Any

from app.services.tts import list_tts_voices


DEFAULT_VOICE_PROFILE: dict[str, Any] = {
    "speaker": "shubh",
    "base_speed": 1.05,
    "pitch_style": "medium",
    "tone": "neutral",
    "energy": "medium",
}


class PersonaVoiceService:
    def normalize_voice_profile(self, voice_profile: dict[str, Any] | None) -> dict[str, Any]:
        profile = dict(DEFAULT_VOICE_PROFILE)
        if isinstance(voice_profile, dict):
            speaker = str(voice_profile.get("speaker") or profile["speaker"]).strip().lower()
            profile["speaker"] = speaker or profile["speaker"]
            try:
                profile["base_speed"] = float(voice_profile.get("base_speed", profile["base_speed"]))
            except (TypeError, ValueError):
                profile["base_speed"] = DEFAULT_VOICE_PROFILE["base_speed"]
            profile["base_speed"] = max(0.95, min(float(profile["base_speed"]), 1.25))
            profile["pitch_style"] = str(voice_profile.get("pitch_style") or profile["pitch_style"]).strip() or profile["pitch_style"]
            profile["tone"] = str(voice_profile.get("tone") or profile["tone"]).strip() or profile["tone"]
            profile["energy"] = str(voice_profile.get("energy") or profile["energy"]).strip() or profile["energy"]
        return profile

    def format_script_for_voice(self, script: str, voice_profile: dict[str, Any] | None) -> str:
        del voice_profile
        lines = [line.strip() for line in str(script or "").split("\n") if line.strip()]
        if not lines:
            return ""

        formatted: list[str] = []
        for index, line in enumerate(lines):
            if index == 0:
                formatted.append(line.rstrip(".!?") + "...")
            elif index == len(lines) - 1:
                formatted.append(line.rstrip(".!?") + ".")
            else:
                formatted.append(line.rstrip())
        return "\n".join(formatted)

    def apply_emotion(self, text: str, tone: str) -> str:
        normalized_tone = str(tone or "").strip().lower()
        result = str(text or "")
        if normalized_tone == "friendly_confident":
            result = result.replace("you should", "you SHOULD").replace("you need to", "you NEED to")
        elif normalized_tone == "excited":
            result = result.replace(".", "!")
        elif normalized_tone == "confident_clear":
            result = result.replace("really", "").replace("very", "")
        return result.strip()

    def resolve_speech_rate(self, script: str, base_speed: float) -> float:
        length = len(str(script or "").split())
        try:
            normalized_base = float(base_speed)
        except (TypeError, ValueError):
            normalized_base = float(DEFAULT_VOICE_PROFILE["base_speed"])

        if length < 12:
            return min(normalized_base + 0.1, 1.25)
        if length < 30:
            return max(0.95, min(normalized_base, 1.25))
        return max(normalized_base - 0.05, 0.95)

    def prepare_tts_input(
        self,
        *,
        script: str,
        voice_profile: dict[str, Any] | None,
        fallback_speaker: str | None = None,
        fallback_speech_rate: float = 1.05,
    ) -> dict[str, Any]:
        profile = self.normalize_voice_profile(voice_profile)
        formatted_script = self.format_script_for_voice(script, profile)
        formatted_script = self.apply_emotion(formatted_script, str(profile.get("tone") or "neutral"))
        speech_rate = self.resolve_speech_rate(formatted_script, float(profile.get("base_speed") or fallback_speech_rate))
        speaker = str(profile.get("speaker") or fallback_speaker or DEFAULT_VOICE_PROFILE["speaker"]).strip().lower()
        voice_key = self._resolve_voice_key(speaker=speaker, fallback_voice=fallback_speaker)
        return {
            "text": formatted_script,
            "speaker": speaker or DEFAULT_VOICE_PROFILE["speaker"],
            "voice_key": voice_key,
            "speech_rate": speech_rate,
            "voice_profile": profile,
        }

    def _resolve_voice_key(self, *, speaker: str, fallback_voice: str | None) -> str:
        normalized_fallback = str(fallback_voice or "").strip()
        for option in list_tts_voices():
            if option.provider_voice.lower() == speaker.lower():
                return option.key
        for option in list_tts_voices():
            if option.key == normalized_fallback or option.key.lower() == normalized_fallback.lower():
                return option.key
        return "Shubh"
