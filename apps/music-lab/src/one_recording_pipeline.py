
"""Local end-to-end test for Rangmanch single recordings."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


LAB_ROOT = Path(__file__).resolve().parents[1]

SEPARATOR_PYTHON = LAB_ROOT / ".venv-separation/bin/python"
PRODUCER_PYTHON = LAB_ROOT / ".venv/bin/python"


def run_pipeline(
    recording: Path,
    output_dir: Path,
    *,
    mode: str = "mixed",
    preset: str = "acoustic",
) -> None:
    recording = recording.resolve()
    output_dir = output_dir.resolve()

    if not recording.is_file():
        raise FileNotFoundError(recording)

    if mode not in {"mixed", "vocals_only"}:
        raise ValueError("Invalid recording mode")

    if mode == "mixed":
        separation_dir = output_dir / "separation"

        subprocess.run(
            [
                str(SEPARATOR_PYTHON),
                str(LAB_ROOT / "src/source_separator.py"),
                str(recording),
                str(separation_dir),
            ],
            check=True,
            timeout=900,
        )

        stem_dir = (
            separation_dir
            / "htdemucs"
            / recording.stem
        )

        vocals = stem_dir / "vocals.wav"
        instrumental = stem_dir / "no_vocals.wav"

    else:
        # Temporary silent instrumental for local testing.
        # The production version will have a dedicated vocal-only chain.
        instrumental = output_dir / "silent.wav"
        instrumental.parent.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(recording),
                "-af", "volume=0",
                str(instrumental),
            ],
            check=True,
            timeout=60,
            stdout=subprocess.DEVNULL,
        )

        vocals = recording

    final_dir = output_dir / "master"

    subprocess.run(
        [
            str(PRODUCER_PYTHON),
            str(LAB_ROOT / "src/produce.py"),
            str(vocals),
            str(instrumental),
            str(final_dir),
            "--preset",
            preset,
        ],
        check=True,
        timeout=300,
    )

    print(f"Master WAV: {final_dir / 'produced.wav'}")
    print(f"Master MP3: {final_dir / 'produced.mp3'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("recording", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--mode",
        choices=["mixed", "vocals_only"],
        default="mixed",
    )
    parser.add_argument("--preset", default="acoustic")

    args = parser.parse_args()

    run_pipeline(
        args.recording,
        args.output,
        mode=args.mode,
        preset=args.preset,
    )
