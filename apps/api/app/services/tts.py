import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LanguageOption:
    code: str
    label: str
    native_label: str


@dataclass(frozen=True)
class VoiceOption:
    key: str
    label: str
    tone: str
    gender: str
    provider_voice: str
    supported_language_codes: tuple[str, ...]
    description: str


@dataclass(frozen=True)
class VoiceoverResult:
    path: Path
    resolved_voice: str
    provider: str
    cached: bool


LANGUAGE_OPTIONS: tuple[LanguageOption, ...] = (
    LanguageOption('en-IN', 'English', 'English'),
    LanguageOption('hi-IN', 'Hindi', 'हिन्दी'),
    LanguageOption('hi-IN', 'Hinglish', 'Hinglish'),
    LanguageOption('bn-IN', 'Bengali', 'বাংলা'),
    LanguageOption('gu-IN', 'Gujarati', 'ગુજરાતી'),
    LanguageOption('kn-IN', 'Kannada', 'ಕನ್ನಡ'),
    LanguageOption('ml-IN', 'Malayalam', 'മലയാളം'),
    LanguageOption('mr-IN', 'Marathi', 'मराठी'),
    LanguageOption('od-IN', 'Odia', 'ଓଡ଼ିଆ'),
    LanguageOption('pa-IN', 'Punjabi', 'ਪੰਜਾਬੀ'),
    LanguageOption('ta-IN', 'Tamil', 'தமிழ்'),
    LanguageOption('te-IN', 'Telugu', 'తెలుగు'),
)

ALL_LANGUAGE_CODES = tuple(sorted({item.code for item in LANGUAGE_OPTIONS}))

VOICE_OPTIONS: tuple[VoiceOption, ...] = (
    VoiceOption('Shubh', 'Shubh', 'Balanced male', 'male', 'Shubh', ALL_LANGUAGE_CODES, 'Default Bulbul v3 voice with neutral, versatile delivery.'),
    VoiceOption('Aditya', 'Aditya', 'Confident male', 'male', 'Aditya', ALL_LANGUAGE_CODES, 'Clear storyteller voice for startup, product, and tech explainers.'),
    VoiceOption('Rahul', 'Rahul', 'Warm male', 'male', 'Rahul', ALL_LANGUAGE_CODES, 'Friendly male narration for accessible creator content.'),
    VoiceOption('Rohan', 'Rohan', 'Polished male', 'male', 'Rohan', ALL_LANGUAGE_CODES, 'Professional male delivery for branded and polished videos.'),
    VoiceOption('Amit', 'Amit', 'Steady male', 'male', 'Amit', ALL_LANGUAGE_CODES, 'Steady male narration for neutral explainers and promos.'),
    VoiceOption('Dev', 'Dev', 'Deep male', 'male', 'Dev', ALL_LANGUAGE_CODES, 'Stronger dramatic male tone for cinematic or intense scripts.'),
    VoiceOption('Ratan', 'Ratan', 'Grounded male', 'male', 'Ratan', ALL_LANGUAGE_CODES, 'Grounded male voice for informative and educational narration.'),
    VoiceOption('Varun', 'Varun', 'Young male', 'male', 'Varun', ALL_LANGUAGE_CODES, 'Youthful male tone for fast creator videos and social clips.'),
    VoiceOption('Manan', 'Manan', 'Neutral male', 'male', 'Manan', ALL_LANGUAGE_CODES, 'Neutral male delivery for general-purpose narration.'),
    VoiceOption('Sumit', 'Sumit', 'Clear male', 'male', 'Sumit', ALL_LANGUAGE_CODES, 'Clear male voice for instructional or product-led content.'),
    VoiceOption('Kabir', 'Kabir', 'Broadcast male', 'male', 'Kabir', ALL_LANGUAGE_CODES, 'Anchor-style male voice for commentary and educational reels.'),
    VoiceOption('Aayan', 'Aayan', 'Light male', 'male', 'Aayan', ALL_LANGUAGE_CODES, 'Lighter male voice for energetic creator-facing narration.'),
    VoiceOption('Ashutosh', 'Ashutosh', 'Formal male', 'male', 'Ashutosh', ALL_LANGUAGE_CODES, 'Formal male tone for corporate and training content.'),
    VoiceOption('Advait', 'Advait', 'Measured male', 'male', 'Advait', ALL_LANGUAGE_CODES, 'Measured male narration for premium explainers.'),
    VoiceOption('Anand', 'Anand', 'Deep male', 'male', 'Anand', ALL_LANGUAGE_CODES, 'Deeper cinematic tone for dramatic storytelling.'),
    VoiceOption('Tarun', 'Tarun', 'Friendly male', 'male', 'Tarun', ALL_LANGUAGE_CODES, 'Friendly and balanced male voice for everyday content.'),
    VoiceOption('Sunny', 'Sunny', 'Energetic male', 'male', 'Sunny', ALL_LANGUAGE_CODES, 'More upbeat male narration for engaging short-form content.'),
    VoiceOption('Mani', 'Mani', 'Warm male', 'male', 'Mani', ALL_LANGUAGE_CODES, 'Warm, conversational male voice for regional storytelling.'),
    VoiceOption('Gokul', 'Gokul', 'Natural male', 'male', 'Gokul', ALL_LANGUAGE_CODES, 'Natural male delivery for grounded scenes and local stories.'),
    VoiceOption('Vijay', 'Vijay', 'Confident male', 'male', 'Vijay', ALL_LANGUAGE_CODES, 'Confident male voice for authoritative delivery.'),
    VoiceOption('Mohit', 'Mohit', 'Balanced male', 'male', 'Mohit', ALL_LANGUAGE_CODES, 'Balanced male narration for general creator workflows.'),
    VoiceOption('Rehan', 'Rehan', 'Smooth male', 'male', 'Rehan', ALL_LANGUAGE_CODES, 'Smooth male voice for polished branded content.'),
    VoiceOption('Soham', 'Soham', 'Young male', 'male', 'Soham', ALL_LANGUAGE_CODES, 'Modern male tone for social and youth-focused scripts.'),
    VoiceOption('Ritu', 'Ritu', 'Clear female', 'female', 'Ritu', ALL_LANGUAGE_CODES, 'Natural female narration for clean explainers and tutorials.'),
    VoiceOption('Priya', 'Priya', 'Bright female', 'female', 'Priya', ALL_LANGUAGE_CODES, 'Lively female voice for social, product, and short-form content.'),
    VoiceOption('Neha', 'Neha', 'Friendly female', 'female', 'Neha', ALL_LANGUAGE_CODES, 'Friendly female narration for everyday brand and social use.'),
    VoiceOption('Pooja', 'Pooja', 'Balanced female', 'female', 'Pooja', ALL_LANGUAGE_CODES, 'Balanced female delivery for versatile creator workflows.'),
    VoiceOption('Simran', 'Simran', 'Expressive female', 'female', 'Simran', ALL_LANGUAGE_CODES, 'Energetic female voice for creator-led storytelling.'),
    VoiceOption('Kavya', 'Kavya', 'Soft female', 'female', 'Kavya', ALL_LANGUAGE_CODES, 'Gentle storytelling tone for mythology and devotional themes.'),
    VoiceOption('Ishita', 'Ishita', 'Calm female', 'female', 'Ishita', ALL_LANGUAGE_CODES, 'Composed female voice for premium brand narration.'),
    VoiceOption('Shreya', 'Shreya', 'Polished female', 'female', 'Shreya', ALL_LANGUAGE_CODES, 'Polished female voice for premium content and tutorials.'),
    VoiceOption('Roopa', 'Roopa', 'Mature female', 'female', 'Roopa', ALL_LANGUAGE_CODES, 'More grounded female delivery for documentary-style scripts.'),
    VoiceOption('Amelia', 'Amelia', 'Global female', 'female', 'Amelia', ALL_LANGUAGE_CODES, 'Refined female voice for premium and cosmopolitan content.'),
    VoiceOption('Sophia', 'Sophia', 'Crisp female', 'female', 'Sophia', ALL_LANGUAGE_CODES, 'Crisp female narration for sharp, clean product storytelling.'),
    VoiceOption('Tanya', 'Tanya', 'Modern female', 'female', 'Tanya', ALL_LANGUAGE_CODES, 'Modern female voice for social-first creator workflows.'),
    VoiceOption('Shruti', 'Shruti', 'Warm female', 'female', 'Shruti', ALL_LANGUAGE_CODES, 'Warm female narration for emotional or community-led content.'),
    VoiceOption('Suhani', 'Suhani', 'Gentle female', 'female', 'Suhani', ALL_LANGUAGE_CODES, 'Gentle female voice for softer storytelling and lifestyle content.'),
    VoiceOption('Kavitha', 'Kavitha', 'Mature female', 'female', 'Kavitha', ALL_LANGUAGE_CODES, 'Measured female voice for regional and documentary-style content.'),
    VoiceOption('Rupali', 'Rupali', 'Rich female', 'female', 'Rupali', ALL_LANGUAGE_CODES, 'Richer female tone for premium narrative voiceovers.'),
)

EDGE_VOICE_MAP = {
    'Shubh': 'en-IN-PrabhatNeural',
    'Aditya': 'en-IN-PrabhatNeural',
    'Rahul': 'en-IN-PrabhatNeural',
    'Rohan': 'en-IN-PrabhatNeural',
    'Amit': 'en-IN-PrabhatNeural',
    'Dev': 'hi-IN-MadhurNeural',
    'Ratan': 'hi-IN-MadhurNeural',
    'Varun': 'en-IN-PrabhatNeural',
    'Manan': 'en-IN-PrabhatNeural',
    'Sumit': 'en-IN-PrabhatNeural',
    'Kabir': 'hi-IN-MadhurNeural',
    'Aayan': 'en-IN-PrabhatNeural',
    'Ashutosh': 'hi-IN-MadhurNeural',
    'Advait': 'en-IN-PrabhatNeural',
    'Anand': 'hi-IN-MadhurNeural',
    'Tarun': 'en-IN-PrabhatNeural',
    'Sunny': 'en-IN-PrabhatNeural',
    'Mani': 'hi-IN-MadhurNeural',
    'Gokul': 'hi-IN-MadhurNeural',
    'Vijay': 'hi-IN-MadhurNeural',
    'Mohit': 'en-IN-PrabhatNeural',
    'Rehan': 'en-IN-PrabhatNeural',
    'Soham': 'en-IN-PrabhatNeural',
    'Ritu': 'en-IN-NeerjaNeural',
    'Priya': 'en-IN-NeerjaNeural',
    'Neha': 'en-IN-NeerjaNeural',
    'Pooja': 'en-IN-NeerjaNeural',
    'Simran': 'en-IN-NeerjaNeural',
    'Kavya': 'hi-IN-SwaraNeural',
    'Ishita': 'hi-IN-SwaraNeural',
    'Shreya': 'en-IN-NeerjaNeural',
    'Roopa': 'hi-IN-SwaraNeural',
    'Amelia': 'en-IN-NeerjaNeural',
    'Sophia': 'en-IN-NeerjaNeural',
    'Tanya': 'en-IN-NeerjaNeural',
    'Shruti': 'hi-IN-SwaraNeural',
    'Suhani': 'en-IN-NeerjaNeural',
    'Kavitha': 'hi-IN-SwaraNeural',
    'Rupali': 'hi-IN-SwaraNeural',
}
DEFAULT_EDGE_VOICE = 'en-IN-NeerjaNeural'

GTTS_LANGUAGE_MAP = {
    'en-IN': 'en',
    'hi-IN': 'hi',
    'bn-IN': 'bn',
    'gu-IN': 'gu',
    'kn-IN': 'kn',
    'ml-IN': 'ml',
    'mr-IN': 'mr',
    'ta-IN': 'ta',
    'te-IN': 'te',
}

PREVIEW_MAX_CHARS = 280
PREVIEW_WINDOW_SECONDS = 600
PREVIEW_MAX_REQUESTS_PER_WINDOW = 20
_preview_request_log: dict[str, list[float]] = {}


def list_tts_languages() -> list[LanguageOption]:
    return list(LANGUAGE_OPTIONS)


def list_tts_voices() -> list[VoiceOption]:
    return list(VOICE_OPTIONS)


def resolve_language_code(language: str | None) -> str:
    value = (language or '').strip().lower()
    by_label = {item.label.lower(): item.code for item in LANGUAGE_OPTIONS}
    if value in by_label:
        return by_label[value]
    for item in LANGUAGE_OPTIONS:
        if item.code.lower() == value:
            return item.code
    return 'en-IN'


def resolve_voice_option(ui_voice: str | None) -> VoiceOption:
    if not ui_voice:
        return VOICE_OPTIONS[0]
    for option in VOICE_OPTIONS:
        if option.key == ui_voice:
            return option
    return VOICE_OPTIONS[0]


def resolve_edge_voice(ui_voice: str | None) -> str:
    if not ui_voice:
        return DEFAULT_EDGE_VOICE
    return EDGE_VOICE_MAP.get(ui_voice, DEFAULT_EDGE_VOICE)


async def _synthesize_to_path(text: str, edge_voice: str, output_path: Path) -> None:
    try:
        import edge_tts
    except ModuleNotFoundError as exc:
        raise RuntimeError('edge-tts dependency is missing. Install requirements in apps/api.') from exc

    communicator = edge_tts.Communicate(text=text, voice=edge_voice)
    await communicator.save(str(output_path))


def _synthesize_with_gtts(text: str, output_path: Path, lang: str) -> None:
    try:
        from gtts import gTTS
    except ModuleNotFoundError as exc:
        raise RuntimeError('gTTS dependency is missing. Install requirements in apps/api.') from exc

    tts = gTTS(text=text, lang=lang)
    tts.save(str(output_path))


def _synthesize_with_sarvam(text: str, output_path: Path, *, language_code: str, speaker: str) -> str:
    settings = get_settings()
    if not settings.sarvam_api_key:
        raise RuntimeError('SARVAM_API_KEY is not configured')

    try:
        from sarvamai import SarvamAI
        from sarvamai.play import save
    except ModuleNotFoundError as exc:
        raise RuntimeError('sarvamai dependency is missing. Install requirements in apps/api.') from exc

    client = SarvamAI(api_subscription_key=settings.sarvam_api_key)

    # Official integration hook:
    # If Sarvam changes the SDK surface, update this call only. Bulbul v3 uses
    # target_language_code + speaker for TTS selection.
    response = client.text_to_speech.convert(
        text=text,
        target_language_code=language_code,
        speaker=speaker,
        model=settings.sarvam_model,
    )
    save(response, str(output_path))
    return speaker


def generate_voiceover_detailed(script: str, voice: str, cache_dir: Path, language: str | None = None) -> VoiceoverResult:
    text = script.strip()
    if not text:
        raise ValueError('Script is required for TTS voiceover generation')

    cache_dir.mkdir(parents=True, exist_ok=True)
    language_code = resolve_language_code(language)
    voice_option = resolve_voice_option(voice)

    settings = get_settings()
    key = hashlib.sha256(f'{settings.sarvam_model}:{voice_option.provider_voice}:{language_code}:{text}'.encode('utf-8')).hexdigest()
    sarvam_path = cache_dir / f'{key}.wav'

    if sarvam_path.exists() and sarvam_path.stat().st_size > 0:
        return VoiceoverResult(sarvam_path, voice_option.provider_voice, 'Sarvam AI', True)

    sarvam_error: Exception | None = None
    if settings.sarvam_api_key:
        try:
            resolved_speaker = _synthesize_with_sarvam(
                text=text,
                output_path=sarvam_path,
                language_code=language_code,
                speaker=voice_option.provider_voice,
            )
            if sarvam_path.exists() and sarvam_path.stat().st_size > 0:
                logger.info('sarvam_tts_generated', extra={'voice': resolved_speaker, 'language': language_code})
                return VoiceoverResult(sarvam_path, resolved_speaker, 'Sarvam AI', False)
        except Exception as exc:  # noqa: BLE001
            sarvam_error = exc
            logger.warning('sarvam_tts_failed', extra={'voice': voice_option.provider_voice, 'language': language_code, 'error': str(exc)})

    edge_voice = resolve_edge_voice(voice)
    fallback_key = hashlib.sha256(f'{edge_voice}:{language_code}:{text}'.encode('utf-8')).hexdigest()
    output_path = cache_dir / f'{fallback_key}.mp3'
    if output_path.exists() and output_path.stat().st_size > 0:
        return VoiceoverResult(output_path, edge_voice, 'Fallback TTS', True)

    edge_error: Exception | None = None
    try:
        try:
            asyncio.run(_synthesize_to_path(text=text, edge_voice=edge_voice, output_path=output_path))
        except RuntimeError:
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(_synthesize_to_path(text=text, edge_voice=edge_voice, output_path=output_path))
            finally:
                loop.close()
    except Exception as exc:  # noqa: BLE001
        edge_error = exc

    if (not output_path.exists() or output_path.stat().st_size == 0) and edge_error is not None:
        fallback_lang = GTTS_LANGUAGE_MAP.get(language_code, 'en')
        _synthesize_with_gtts(text=text, output_path=output_path, lang=fallback_lang)

    if not output_path.exists() or output_path.stat().st_size == 0:
        if sarvam_error is not None:
            raise RuntimeError(f'Sarvam TTS failed: {sarvam_error}')
        raise RuntimeError('TTS output file was not generated')

    return VoiceoverResult(output_path, edge_voice, 'Fallback TTS', False)


def generate_voiceover(script: str, voice: str, cache_dir: Path, language: str | None = None) -> tuple[Path, str]:
    result = generate_voiceover_detailed(script=script, voice=voice, cache_dir=cache_dir, language=language)
    return result.path, result.resolved_voice


def assert_preview_rate_limit(user_id: str) -> None:
    now = time.time()
    window_start = now - PREVIEW_WINDOW_SECONDS
    timestamps = [item for item in _preview_request_log.get(user_id, []) if item >= window_start]
    if len(timestamps) >= PREVIEW_MAX_REQUESTS_PER_WINDOW:
        raise RuntimeError('Preview limit reached. Try again in a few minutes.')
    timestamps.append(now)
    _preview_request_log[user_id] = timestamps


def get_cached_voiceover(script: str, voice: str, cache_dir: Path, language: str | None = None) -> tuple[Path, str] | None:
    text = script.strip()
    if not text:
        return None

    cache_dir.mkdir(parents=True, exist_ok=True)
    language_code = resolve_language_code(language)
    voice_option = resolve_voice_option(voice)
    settings = get_settings()

    sarvam_key = hashlib.sha256(f'{settings.sarvam_model}:{voice_option.provider_voice}:{language_code}:{text}'.encode('utf-8')).hexdigest()
    sarvam_path = cache_dir / f'{sarvam_key}.wav'
    if sarvam_path.exists() and sarvam_path.stat().st_size > 0:
        return sarvam_path, voice_option.provider_voice

    edge_voice = resolve_edge_voice(voice)
    fallback_key = hashlib.sha256(f'{edge_voice}:{language_code}:{text}'.encode('utf-8')).hexdigest()
    fallback_path = cache_dir / f'{fallback_key}.mp3'
    if fallback_path.exists() and fallback_path.stat().st_size > 0:
        return fallback_path, edge_voice

    return None


def get_cached_voiceover_detailed(script: str, voice: str, cache_dir: Path, language: str | None = None) -> VoiceoverResult | None:
    text = script.strip()
    if not text:
        return None

    cache_dir.mkdir(parents=True, exist_ok=True)
    language_code = resolve_language_code(language)
    voice_option = resolve_voice_option(voice)
    settings = get_settings()

    sarvam_key = hashlib.sha256(f'{settings.sarvam_model}:{voice_option.provider_voice}:{language_code}:{text}'.encode('utf-8')).hexdigest()
    sarvam_path = cache_dir / f'{sarvam_key}.wav'
    if sarvam_path.exists() and sarvam_path.stat().st_size > 0:
        return VoiceoverResult(sarvam_path, voice_option.provider_voice, 'Sarvam AI', True)

    edge_voice = resolve_edge_voice(voice)
    fallback_key = hashlib.sha256(f'{edge_voice}:{language_code}:{text}'.encode('utf-8')).hexdigest()
    fallback_path = cache_dir / f'{fallback_key}.mp3'
    if fallback_path.exists() and fallback_path.stat().st_size > 0:
        return VoiceoverResult(fallback_path, edge_voice, 'Fallback TTS', True)

    return None
