"""Mode-aware Music Studio processor reusing existing DSP and separation."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
import numpy as np
from produce import produce
from processing.audio_io import read_audio
from processing.mastering import master

def process(vocal: Path, instrument: Path, output: Path, settings: dict):
    options = dict(settings)
    mode = options.pop("_mode", "separate")
    kind = options.pop("_recording_kind", "mixed")
    if mode == "separate":
        return produce(vocal, instrument, output, **options)
    if mode not in {"single", "karaoke"}:
        raise ValueError("Invalid mode")
    if mode == "single" and kind == "vocals_only":
        return produce(vocal, None, output, **options)
    if mode == "single" and kind == "instrument_only":
        return produce(None, vocal, output, **options)
    if mode == "single" and kind != "mixed":
        raise ValueError("Invalid recording kind")
    # Heavy path is executed only on a separately provisioned Demucs worker.
    from source_separator import separate
    stems_dir = output / "stems"
    vocals, accompaniment = separate(vocal, stems_dir, timeout_seconds=900)
    if mode == "single":
        return produce(vocals, accompaniment, output, **options)
    # Karaoke: retain accompaniment without synthesizing or remixing vocals.
    output.mkdir(parents=True, exist_ok=True)
    wav, mp3 = output / "produced.wav", output / "produced.mp3"
    audio = read_audio(accompaniment)
    peak = max(float(np.max(np.abs(audio))), 1e-9)
    audio = audio * min(1.0, 10 ** (-1.5 / 20) / peak)
    from processing.presets import validated_settings
    target_lufs = validated_settings(**options).loudness_lufs
    measurements = master(audio, wav, mp3, target_lufs)
    return {"wav": str(wav), "mp3": str(mp3), "measurements": measurements}

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("vocal", type=Path)
    p.add_argument("instrument", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("settings")
    a = p.parse_args()
    print(json.dumps(process(a.vocal, a.instrument, a.output, json.loads(a.settings))))
