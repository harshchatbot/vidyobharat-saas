from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GeminiVoiceOption:
    key: str
    label: str
    tone: str
    gender: str
    description: str


@dataclass(frozen=True)
class GeminiLanguageOption:
    code: str
    label: str
    native_label: str


GEMINI_AVATAR_PRODUCT_VOICES: tuple[GeminiVoiceOption, ...] = (
    GeminiVoiceOption("Achernar", "Achernar", "Calm female", "female", "Calm female delivery for measured product narration."),
    GeminiVoiceOption("Achird", "Achird", "Polished male", "male", "Polished male delivery for clean brand messaging."),
    GeminiVoiceOption("Algenib", "Algenib", "Steady male", "male", "Steady male voice for clear explainer-style ads."),
    GeminiVoiceOption("Algieba", "Algieba", "Warm female", "female", "Warm female voice for friendly creator-led ads."),
    GeminiVoiceOption("Alnilam", "Alnilam", "Firm male", "male", "Firm male delivery for confident product claims."),
    GeminiVoiceOption("Aoede", "Aoede", "Warm female", "female", "Warm, melodic female voice for premium lifestyle ads."),
    GeminiVoiceOption("Autonoe", "Autonoe", "Bright female", "female", "Bright female delivery for upbeat short-form ads."),
    GeminiVoiceOption("Callirrhoe", "Callirrhoe", "Crisp female", "female", "Crisp female voice for polished creator reads."),
    GeminiVoiceOption("Charon", "Charon", "Professional male", "male", "Calm, professional male voice for trustworthy product pitches."),
    GeminiVoiceOption("Despina", "Despina", "Clear female", "female", "Clear female delivery for straightforward demos."),
    GeminiVoiceOption("Enceladus", "Enceladus", "Grounded male", "male", "Grounded male voice for informative ads."),
    GeminiVoiceOption("Erinome", "Erinome", "Soft female", "female", "Soft female tone for gentle lifestyle storytelling."),
    GeminiVoiceOption("Fenrir", "Fenrir", "Deep male", "male", "Deeper male voice for dramatic or premium reads."),
    GeminiVoiceOption("Gacrux", "Gacrux", "Neutral male", "male", "Neutral male tone for general product videos."),
    GeminiVoiceOption("Iapetus", "Iapetus", "Measured male", "male", "Measured male delivery for clean branded content."),
    GeminiVoiceOption("Kore", "Kore", "Strong female", "female", "Strong, firm female voice. Good default for avatar product ads."),
    GeminiVoiceOption("Laomedeia", "Laomedeia", "Confident female", "female", "Confident female voice for persuasive UGC delivery."),
    GeminiVoiceOption("Leda", "Leda", "Gentle female", "female", "Gentle female tone for softer product storytelling."),
    GeminiVoiceOption("Orus", "Orus", "Neutral male", "male", "Balanced male delivery for everyday creator ads."),
    GeminiVoiceOption("Pulcherrima", "Pulcherrima", "Elegant female", "female", "Elegant female voice for premium ad reads."),
    GeminiVoiceOption("Puck", "Puck", "Upbeat male", "male", "Upbeat, lively male voice. Good default for energetic UGC ads."),
    GeminiVoiceOption("Rasalgethi", "Rasalgethi", "Broadcast male", "male", "Broadcast-style male delivery for clear CTA reads."),
    GeminiVoiceOption("Sadachbia", "Sadachbia", "Composed female", "female", "Composed female voice for balanced product narration."),
    GeminiVoiceOption("Sadaltager", "Sadaltager", "Relaxed male", "male", "Relaxed male tone for conversational demos."),
    GeminiVoiceOption("Schedar", "Schedar", "Polished female", "female", "Polished female voice for modern premium ads."),
    GeminiVoiceOption("Sulafat", "Sulafat", "Smooth female", "female", "Smooth female delivery for lifestyle creator content."),
    GeminiVoiceOption("Umbriel", "Umbriel", "Deep male", "male", "Deep male voice for dramatic emphasis."),
    GeminiVoiceOption("Vindemiatrix", "Vindemiatrix", "Balanced female", "female", "Balanced female voice for versatile ad reads."),
    GeminiVoiceOption("Zephyr", "Zephyr", "Bright female", "female", "Bright, clear female voice for crisp short-form ads."),
    GeminiVoiceOption("Zubenelgenubi", "Zubenelgenubi", "Steady male", "male", "Steady male voice for clean product intros."),
)


GEMINI_AVATAR_PRODUCT_LANGUAGES: tuple[GeminiLanguageOption, ...] = (
    GeminiLanguageOption("Arabic (Egypt)", "Arabic (Egypt)", "Arabic (Egypt)"),
    GeminiLanguageOption("Bangla (Bangladesh)", "Bangla (Bangladesh)", "Bangla (Bangladesh)"),
    GeminiLanguageOption("Dutch (Netherlands)", "Dutch (Netherlands)", "Dutch (Netherlands)"),
    GeminiLanguageOption("English (India)", "English (India)", "English (India)"),
    GeminiLanguageOption("English (US)", "English (US)", "English (US)"),
    GeminiLanguageOption("French (France)", "French (France)", "French (France)"),
    GeminiLanguageOption("German (Germany)", "German (Germany)", "German (Germany)"),
    GeminiLanguageOption("Hindi (India)", "Hindi (India)", "Hindi (India)"),
    GeminiLanguageOption("Indonesian (Indonesia)", "Indonesian (Indonesia)", "Indonesian (Indonesia)"),
    GeminiLanguageOption("Italian (Italy)", "Italian (Italy)", "Italian (Italy)"),
    GeminiLanguageOption("Japanese (Japan)", "Japanese (Japan)", "Japanese (Japan)"),
    GeminiLanguageOption("Korean (South Korea)", "Korean (South Korea)", "Korean (South Korea)"),
    GeminiLanguageOption("Marathi (India)", "Marathi (India)", "Marathi (India)"),
    GeminiLanguageOption("Polish (Poland)", "Polish (Poland)", "Polish (Poland)"),
    GeminiLanguageOption("Portuguese (Brazil)", "Portuguese (Brazil)", "Portuguese (Brazil)"),
    GeminiLanguageOption("Romanian (Romania)", "Romanian (Romania)", "Romanian (Romania)"),
    GeminiLanguageOption("Russian (Russia)", "Russian (Russia)", "Russian (Russia)"),
    GeminiLanguageOption("Spanish (Spain)", "Spanish (Spain)", "Spanish (Spain)"),
    GeminiLanguageOption("Tamil (India)", "Tamil (India)", "Tamil (India)"),
    GeminiLanguageOption("Telugu (India)", "Telugu (India)", "Telugu (India)"),
    GeminiLanguageOption("Thai (Thailand)", "Thai (Thailand)", "Thai (Thailand)"),
    GeminiLanguageOption("Turkish (Turkey)", "Turkish (Turkey)", "Turkish (Turkey)"),
    GeminiLanguageOption("Ukrainian (Ukraine)", "Ukrainian (Ukraine)", "Ukrainian (Ukraine)"),
    GeminiLanguageOption("Vietnamese (Vietnam)", "Vietnamese (Vietnam)", "Vietnamese (Vietnam)"),
    GeminiLanguageOption("Afrikaans (South Africa)", "Afrikaans (South Africa)", "Afrikaans (South Africa)"),
    GeminiLanguageOption("Albanian (Albania)", "Albanian (Albania)", "Albanian (Albania)"),
    GeminiLanguageOption("Amharic (Ethiopia)", "Amharic (Ethiopia)", "Amharic (Ethiopia)"),
    GeminiLanguageOption("Arabic (World)", "Arabic (World)", "Arabic (World)"),
    GeminiLanguageOption("Armenian (Armenia)", "Armenian (Armenia)", "Armenian (Armenia)"),
    GeminiLanguageOption("Azerbaijani (Azerbaijan)", "Azerbaijani (Azerbaijan)", "Azerbaijani (Azerbaijan)"),
    GeminiLanguageOption("Basque (Spain)", "Basque (Spain)", "Basque (Spain)"),
    GeminiLanguageOption("Belarusian (Belarus)", "Belarusian (Belarus)", "Belarusian (Belarus)"),
    GeminiLanguageOption("Bulgarian (Bulgaria)", "Bulgarian (Bulgaria)", "Bulgarian (Bulgaria)"),
    GeminiLanguageOption("Burmese (Myanmar)", "Burmese (Myanmar)", "Burmese (Myanmar)"),
    GeminiLanguageOption("Catalan (Spain)", "Catalan (Spain)", "Catalan (Spain)"),
    GeminiLanguageOption("Cebuano (Philippines)", "Cebuano (Philippines)", "Cebuano (Philippines)"),
    GeminiLanguageOption("Chinese Mandarin (China)", "Chinese Mandarin (China)", "Chinese Mandarin (China)"),
    GeminiLanguageOption("Chinese Mandarin (Taiwan)", "Chinese Mandarin (Taiwan)", "Chinese Mandarin (Taiwan)"),
    GeminiLanguageOption("Croatian (Croatia)", "Croatian (Croatia)", "Croatian (Croatia)"),
    GeminiLanguageOption("Czech (Czech Republic)", "Czech (Czech Republic)", "Czech (Czech Republic)"),
    GeminiLanguageOption("Danish (Denmark)", "Danish (Denmark)", "Danish (Denmark)"),
    GeminiLanguageOption("English (Australia)", "English (Australia)", "English (Australia)"),
    GeminiLanguageOption("English (UK)", "English (UK)", "English (UK)"),
    GeminiLanguageOption("Estonian (Estonia)", "Estonian (Estonia)", "Estonian (Estonia)"),
    GeminiLanguageOption("Filipino (Philippines)", "Filipino (Philippines)", "Filipino (Philippines)"),
    GeminiLanguageOption("Finnish (Finland)", "Finnish (Finland)", "Finnish (Finland)"),
    GeminiLanguageOption("French (Canada)", "French (Canada)", "French (Canada)"),
    GeminiLanguageOption("Galician (Spain)", "Galician (Spain)", "Galician (Spain)"),
    GeminiLanguageOption("Georgian (Georgia)", "Georgian (Georgia)", "Georgian (Georgia)"),
    GeminiLanguageOption("Greek (Greece)", "Greek (Greece)", "Greek (Greece)"),
    GeminiLanguageOption("Gujarati (India)", "Gujarati (India)", "Gujarati (India)"),
    GeminiLanguageOption("Haitian Creole (Haiti)", "Haitian Creole (Haiti)", "Haitian Creole (Haiti)"),
    GeminiLanguageOption("Hebrew (Israel)", "Hebrew (Israel)", "Hebrew (Israel)"),
    GeminiLanguageOption("Hungarian (Hungary)", "Hungarian (Hungary)", "Hungarian (Hungary)"),
    GeminiLanguageOption("Icelandic (Iceland)", "Icelandic (Iceland)", "Icelandic (Iceland)"),
    GeminiLanguageOption("Javanese (Java)", "Javanese (Java)", "Javanese (Java)"),
    GeminiLanguageOption("Kannada (India)", "Kannada (India)", "Kannada (India)"),
    GeminiLanguageOption("Konkani (India)", "Konkani (India)", "Konkani (India)"),
    GeminiLanguageOption("Lao (Laos)", "Lao (Laos)", "Lao (Laos)"),
    GeminiLanguageOption("Latin (Vatican City)", "Latin (Vatican City)", "Latin (Vatican City)"),
    GeminiLanguageOption("Latvian (Latvia)", "Latvian (Latvia)", "Latvian (Latvia)"),
    GeminiLanguageOption("Lithuanian (Lithuania)", "Lithuanian (Lithuania)", "Lithuanian (Lithuania)"),
    GeminiLanguageOption("Luxembourgish (Luxembourg)", "Luxembourgish (Luxembourg)", "Luxembourgish (Luxembourg)"),
    GeminiLanguageOption("Macedonian (North Macedonia)", "Macedonian (North Macedonia)", "Macedonian (North Macedonia)"),
    GeminiLanguageOption("Maithili (India)", "Maithili (India)", "Maithili (India)"),
    GeminiLanguageOption("Malay (Malaysia)", "Malay (Malaysia)", "Malay (Malaysia)"),
    GeminiLanguageOption("Malayalam (India)", "Malayalam (India)", "Malayalam (India)"),
    GeminiLanguageOption("Mongolian (Mongolia)", "Mongolian (Mongolia)", "Mongolian (Mongolia)"),
    GeminiLanguageOption("Nepali (Nepal)", "Nepali (Nepal)", "Nepali (Nepal)"),
    GeminiLanguageOption("Norwegian Bokmal (Norway)", "Norwegian Bokmal (Norway)", "Norwegian Bokmal (Norway)"),
    GeminiLanguageOption("Norwegian Nynorsk (Norway)", "Norwegian Nynorsk (Norway)", "Norwegian Nynorsk (Norway)"),
    GeminiLanguageOption("Odia (India)", "Odia (India)", "Odia (India)"),
    GeminiLanguageOption("Pashto (Afghanistan)", "Pashto (Afghanistan)", "Pashto (Afghanistan)"),
    GeminiLanguageOption("Persian (Iran)", "Persian (Iran)", "Persian (Iran)"),
    GeminiLanguageOption("Portuguese (Portugal)", "Portuguese (Portugal)", "Portuguese (Portugal)"),
    GeminiLanguageOption("Punjabi (India)", "Punjabi (India)", "Punjabi (India)"),
    GeminiLanguageOption("Serbian (Serbia)", "Serbian (Serbia)", "Serbian (Serbia)"),
    GeminiLanguageOption("Sindhi (India)", "Sindhi (India)", "Sindhi (India)"),
    GeminiLanguageOption("Sinhala (Sri Lanka)", "Sinhala (Sri Lanka)", "Sinhala (Sri Lanka)"),
    GeminiLanguageOption("Slovak (Slovakia)", "Slovak (Slovakia)", "Slovak (Slovakia)"),
    GeminiLanguageOption("Slovenian (Slovenia)", "Slovenian (Slovenia)", "Slovenian (Slovenia)"),
    GeminiLanguageOption("Spanish (Latin America)", "Spanish (Latin America)", "Spanish (Latin America)"),
    GeminiLanguageOption("Spanish (Mexico)", "Spanish (Mexico)", "Spanish (Mexico)"),
    GeminiLanguageOption("Swahili (Kenya)", "Swahili (Kenya)", "Swahili (Kenya)"),
    GeminiLanguageOption("Swedish (Sweden)", "Swedish (Sweden)", "Swedish (Sweden)"),
    GeminiLanguageOption("Urdu (Pakistan)", "Urdu (Pakistan)", "Urdu (Pakistan)"),
)


LEGACY_VOICE_TO_GEMINI_MAP = {
    "Priya": "Kore",
    "Shubh": "Puck",
}

LANGUAGE_ALIAS_MAP = {
    "en-IN": "English (India)",
    "english": "English (India)",
    "english (india)": "English (India)",
    "hi-IN": "Hindi (India)",
    "hi-IN-x-hinglish": "Hindi (India)",
    "hindi": "Hindi (India)",
    "hindi (india)": "Hindi (India)",
    "mr-IN": "Marathi (India)",
    "marathi": "Marathi (India)",
    "marathi (india)": "Marathi (India)",
    "ta-IN": "Tamil (India)",
    "tamil": "Tamil (India)",
    "tamil (india)": "Tamil (India)",
    "te-IN": "Telugu (India)",
    "telugu": "Telugu (India)",
    "telugu (india)": "Telugu (India)",
    "gu-IN": "Gujarati (India)",
    "gujarati": "Gujarati (India)",
    "gujarati (india)": "Gujarati (India)",
    "kn-IN": "Kannada (India)",
    "kannada": "Kannada (India)",
    "kannada (india)": "Kannada (India)",
    "ml-IN": "Malayalam (India)",
    "malayalam": "Malayalam (India)",
    "malayalam (india)": "Malayalam (India)",
    "od-IN": "Odia (India)",
    "odia": "Odia (India)",
    "odia (india)": "Odia (India)",
    "pa-IN": "Punjabi (India)",
    "punjabi": "Punjabi (India)",
    "punjabi (india)": "Punjabi (India)",
    "bn-IN": "Bangla (Bangladesh)",
    "bangla": "Bangla (Bangladesh)",
    "bangla (bangladesh)": "Bangla (Bangladesh)",
}


def list_avatar_product_gemini_voices() -> list[GeminiVoiceOption]:
    return list(GEMINI_AVATAR_PRODUCT_VOICES)


def list_avatar_product_gemini_languages() -> list[GeminiLanguageOption]:
    return list(GEMINI_AVATAR_PRODUCT_LANGUAGES)


def resolve_avatar_product_gemini_voice(*, voice_key: str | None, gender: str | None) -> str:
    normalized = str(voice_key or "").strip()
    valid_keys = {item.key for item in GEMINI_AVATAR_PRODUCT_VOICES}
    if normalized in valid_keys:
        return normalized
    mapped = LEGACY_VOICE_TO_GEMINI_MAP.get(normalized)
    if mapped:
        return mapped
    normalized_gender = str(gender or "").strip().lower()
    if normalized_gender.startswith("m"):
        return "Puck"
    return "Kore"


def resolve_avatar_product_gemini_language(value: str | None) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return "English (India)"
    valid = {item.label for item in GEMINI_AVATAR_PRODUCT_LANGUAGES}
    if normalized in valid:
        return normalized
    return LANGUAGE_ALIAS_MAP.get(normalized.lower(), "English (India)")

