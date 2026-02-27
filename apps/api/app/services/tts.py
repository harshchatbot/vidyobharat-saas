import asyncio
import hashlib
from pathlib import Path

VOICE_MAP = {
    'Aarav': 'en-IN-PrabhatNeural',
    'Anaya': 'en-IN-NeerjaNeural',
    'Dev': 'hi-IN-MadhurNeural',
    'Mira': 'hi-IN-SwaraNeural',
}
DEFAULT_VOICE = 'en-IN-NeerjaNeural'


def resolve_edge_voice(ui_voice: str | None) -> str:
    if not ui_voice:
        return DEFAULT_VOICE
    return VOICE_MAP.get(ui_voice, DEFAULT_VOICE)


async def _synthesize_to_path(text: str, edge_voice: str, output_path: Path) -> None:
    try:
        import edge_tts
    except ModuleNotFoundError as exc:
        raise RuntimeError('edge-tts dependency is missing. Install requirements in apps/api.') from exc

    communicator = edge_tts.Communicate(text=text, voice=edge_voice)
    await communicator.save(str(output_path))


def generate_voiceover(script: str, voice: str, cache_dir: Path) -> tuple[Path, str]:
    text = script.strip()
    if not text:
        raise ValueError('Script is required for TTS voiceover generation')

    edge_voice = resolve_edge_voice(voice)
    cache_dir.mkdir(parents=True, exist_ok=True)

    key = hashlib.sha256(f'{edge_voice}:{text}'.encode('utf-8')).hexdigest()
    output_path = cache_dir / f'{key}.mp3'

    if output_path.exists() and output_path.stat().st_size > 0:
        return output_path, edge_voice

    try:
        asyncio.run(_synthesize_to_path(text=text, edge_voice=edge_voice, output_path=output_path))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_synthesize_to_path(text=text, edge_voice=edge_voice, output_path=output_path))
        finally:
            loop.close()

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError('TTS output file was not generated')

    return output_path, edge_voice
