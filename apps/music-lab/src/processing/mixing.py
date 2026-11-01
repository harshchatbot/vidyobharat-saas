from __future__ import annotations
import numpy as np
from scipy import signal

def _room(mono: np.ndarray, amount: float, sr: int) -> np.ndarray:
    if amount <= 0: return np.zeros_like(mono)
    taps = [(27,.42),(43,.31),(71,.2),(112,.14)]
    impulse=np.zeros(int(sr*(.2+amount*1.25)))
    for ms, amp in taps: impulse[min(len(impulse)-1, round(ms*sr/1000))] = amp
    impulse *= np.exp(-np.arange(len(impulse))/sr/(.25+amount))
    return signal.fftconvolve(mono, impulse, mode="full")[:len(mono)]

def mix(vocal: np.ndarray, instrument: np.ndarray, vocal_balance: float, reverb: float, delay: float, sidechain: bool, sr: int = 48_000) -> np.ndarray:
    vocal_gain=1.15 * 10**(vocal_balance*6/20); instrumental_gain=.83 * 10**(-vocal_balance*4/20)
    if sidechain:
        env=np.abs(vocal.mean(axis=1)); env=signal.lfilter([.01], [1,-.99], env)
        instrument *= (1 - .22*np.clip(env/(np.max(env)+1e-9),0,1))[:,None]
    vm=vocal.mean(axis=1); im=instrument.mean(axis=1)
    ambience=_room(vm, reverb, sr)
    delayed=np.zeros_like(vm); delay_samples=round((.18+delay*.24)*sr)
    if delay and delay_samples < len(vm): delayed[delay_samples:] = vm[:-delay_samples] * delay*.22
    left=vocal_gain*vm*.707 + instrumental_gain*instrument[:,0]*.56 + ambience*.10 + delayed*.5
    right=vocal_gain*vm*.707 + instrumental_gain*instrument[:,1]*.81 + ambience*.09 + delayed*.5
    return np.column_stack((left, right))
