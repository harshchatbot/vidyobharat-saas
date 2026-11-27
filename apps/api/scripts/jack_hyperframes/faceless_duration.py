"""Timing contract for JACK faceless videos."""
from dataclasses import dataclass
import math
import re

TARGET_SECONDS = (30, 45, 60, 90)
TAIL_SECONDS = 0.35
FPS = 30


@dataclass(frozen=True)
class Duration:
    target: int
    rate: float = 150

    def __post_init__(self):
        if self.target not in TARGET_SECONDS:
            raise ValueError("Unsupported JACK target duration")

    @property
    def bounds(self):
        seconds = self.target - TAIL_SECONDS
        return (math.ceil(seconds * self.rate * .9 / 60),
                math.floor(seconds * self.rate * 1.1 / 60))

    def check(self, seconds):
        if not math.isfinite(seconds) or abs(seconds - self.target) > max(1, self.target * .04):
            raise ValueError(f"JACK duration mismatch: {seconds:.2f}s, target {self.target}s")

    def adjust(self, script, seconds):
        # Bound the rate used to correct a real synthesis outlier.
        return Duration(self.target, min(300, max(60, word_count(script) * 60 / seconds)))


def word_count(text):
    return len(re.findall(r"\S+", text))


def runtime(narration_seconds):
    return math.ceil((narration_seconds + TAIL_SECONDS) * FPS) / FPS
