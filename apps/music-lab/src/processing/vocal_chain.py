from __future__ import annotations
import numpy as np
from scipy import ndimage, signal

def _peak(fs: int, hz: float, gain_db: float, q: float = .9):
    a=10**(gain_db/40); w=2*np.pi*hz/fs; alpha=np.sin(w)/(2*q)
    b=np.array([1+alpha*a,-2*np.cos(w),1-alpha*a]); d=np.array([1+alpha/a,-2*np.cos(w),1-alpha/a])
    return b/d[0], d/d[0]

def _soft_noise_reduction(x: np.ndarray, amount: float, sr: int) -> np.ndarray:
    """A conservative downward expander, capped to preserve breaths and ornamentation."""
    if amount <= 0: return x
    rms = np.sqrt(ndimage.uniform_filter1d(x * x, size=max(1, int(sr * .03)), mode="nearest") + 1e-10)
    floor = np.percentile(rms, 12)
    gain = np.clip((rms / max(floor * 2.5, 1e-7)), 0, 1)
    gain = 1 - amount * .5 * (1 - gain)  # maximum 6 dB attenuation
    return x * ndimage.gaussian_filter1d(gain, sigma=max(1, int(sr * .008)))

def _de_ess(x: np.ndarray, amount: float, sr: int) -> np.ndarray:
    if amount <= 0: return x
    sibilance = signal.sosfilt(signal.butter(2, [5000, 10500], fs=sr, btype="bandpass", output="sos"), x)
    envelope = np.sqrt(ndimage.uniform_filter1d(sibilance * sibilance, size=max(1, int(sr * .006)), mode="nearest") + 1e-10)
    threshold = np.percentile(envelope, 72)
    excess = np.clip((envelope - threshold) / max(threshold * 2, 1e-8), 0, 1)
    gain = 1 - .55 * amount * excess
    return x * ndimage.gaussian_filter1d(gain, sigma=max(1, int(sr * .003)))

def process_vocal(audio: np.ndarray, clarity: float, compression: float, de_esser: float = 0.25, warmth: float = 0.2, noise_reduction: float = 0.0, sr: int = 48_000) -> np.ndarray:
    mono = audio.mean(axis=1)
    mono = signal.sosfilt(signal.butter(2, 68, fs=sr, btype="highpass", output="sos"), mono)
    for hz, gain in ((180, 1.8 * warmth), (290, -1.2), (3000, 3.0 * clarity), (8500, 1.6 * clarity)):
        b, a = _peak(sr, hz, gain); mono = signal.lfilter(b, a, mono)
    rms=np.sqrt(ndimage.uniform_filter1d(mono*mono, size=max(1, int(sr*.04)), mode="nearest")+1e-10)
    reduction=np.clip((-25 - 20*np.log10(np.maximum(rms,1e-8))) * (1-1/(1+3*compression)), -5*compression, 0)
    reduction=ndimage.gaussian_filter1d(reduction, sigma=max(1, int(sr*.02)))
    mono *= 10**(reduction/20)
    mono = _de_ess(mono, de_esser, sr)
    mono = _soft_noise_reduction(mono, noise_reduction, sr)
    return np.column_stack((mono, mono))
