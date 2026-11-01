from __future__ import annotations
import numpy as np
from scipy import signal

def process_instrument(audio: np.ndarray, width: float = 0.5, sr: int = 48_000) -> np.ndarray:
    filtered = signal.sosfilt(signal.butter(2, 70, fs=sr, btype="highpass", output="sos"), audio, axis=0)
    mid = (filtered[:, 0] + filtered[:, 1]) * .5
    side = (filtered[:, 0] - filtered[:, 1]) * .5
    # 0.5 is unchanged; the bounded range remains mono-compatible.
    side *= .6 + .8 * width
    return np.column_stack((mid + side, mid - side))
