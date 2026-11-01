from __future__ import annotations
import json, re, shutil, subprocess
from pathlib import Path
import numpy as np
from .audio_io import write_wav

class MasteringError(RuntimeError): pass
def _ffmpeg():
    path=shutil.which("ffmpeg")
    if not path: raise MasteringError("FFmpeg is required for mastering")
    return path
def _run(args: list[str]) -> subprocess.CompletedProcess[str]: return subprocess.run(args, check=True, capture_output=True, text=True)
def _stats(stderr: str) -> dict[str, object]:
    found=re.findall(r"\{\s*\"input_i\".*?\}", stderr, flags=re.S)
    if not found: raise MasteringError("FFmpeg loudness analysis did not return measurements")
    return json.loads(found[-1])
def master(mix: np.ndarray, wav_output: Path, mp3_output: Path | None, target_lufs: float) -> dict[str, float]:
    scratch=wav_output.with_suffix(".premaster.wav"); write_wav(scratch, mix)
    ffmpeg=_ffmpeg(); analysis=_run([ffmpeg,"-i",str(scratch),"-af",f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11:print_format=json","-f","null","-"]).stderr
    m=_stats(analysis); filter=(f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json")
    _run([ffmpeg,"-y","-i",str(scratch),"-ar","48000","-ac","2","-af",filter,"-c:a","pcm_s24le",str(wav_output)])
    if mp3_output: _run([ffmpeg,"-y","-i",str(wav_output),"-c:a","libmp3lame","-b:a","320k",str(mp3_output)])
    verify=_run([ffmpeg,"-i",str(wav_output),"-af","loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json","-f","null","-"]).stderr
    scratch.unlink(missing_ok=True); actual=_stats(verify)
    return {"integrated_lufs": float(actual["input_i"]), "true_peak_dbtp": float(actual["input_tp"])}
