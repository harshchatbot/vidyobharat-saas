from __future__ import annotations
import argparse
import numpy as np
from pathlib import Path
from processing.audio_io import apply_offset, pad_to_match, read_audio
from processing.instrument_chain import process_instrument
from processing.mastering import master
from processing.mixing import mix
from processing.presets import validated_settings
from processing.vocal_chain import process_vocal

def produce(vocal_path: Path | None, instrument_path: Path | None, output_dir: Path, **options: object) -> dict[str, object]:
    """Enhance vocals, instruments, or a two-stem recording."""
    if vocal_path is None and instrument_path is None:
        raise ValueError("At least one audio input is required")
    settings = validated_settings(**options)
    vocal = read_audio(vocal_path) if vocal_path is not None else None
    instrument = read_audio(instrument_path) if instrument_path is not None else None
    if instrument is not None:
        instrument = apply_offset(instrument, settings.sync_offset_ms)
    if vocal is not None and instrument is not None:
        vocal, instrument = pad_to_match(vocal, instrument)
    pv = process_vocal(vocal, settings.clarity, settings.compression, settings.de_esser, settings.vocal_warmth, settings.noise_reduction) if vocal is not None else None
    pi = process_instrument(instrument, settings.instrumental_width) if instrument is not None else None
    if pv is None:
        final = pi.copy()
    else:
        if pi is None:
            pi = np.zeros_like(pv)
        final = mix(pv, pi, settings.vocal_balance, settings.reverb, settings.delay, settings.sidechain, stereo_space=settings.stereo_space)
    peak = max(float(np.max(np.abs(final))), 1e-9)
    final *= min(1, 10 ** (-1.5 / 20) / peak)
    output_dir.mkdir(parents=True, exist_ok=True)
    wav, mp3 = output_dir / "produced.wav", output_dir / "produced.mp3"
    measurements = master(final, wav, mp3, settings.loudness_lufs)
    return {"wav": str(wav), "mp3": str(mp3), "measurements": measurements}

if __name__ == "__main__":
    p=argparse.ArgumentParser(description="Produce a Rangmanch Music Studio mix from aligned stems.")
    p.add_argument("vocal", type=Path); p.add_argument("instrument", type=Path); p.add_argument("output_dir", type=Path); p.add_argument("--preset", default="acoustic")
    args=p.parse_args(); print(produce(args.vocal, args.instrument, args.output_dir, preset=args.preset))
