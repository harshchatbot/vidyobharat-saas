
"""Local prototype for separating vocals and accompaniment.

Research use only until pretrained model licensing is cleared.
This module does not modify production jobs.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def separate(
    input_path: Path,
    output_dir: Path,
    *,
    model: str = "htdemucs",
    timeout_seconds: int = 900,
) -> tuple[Path, Path]:
    input_path = input_path.resolve()
    output_dir = output_dir.resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Input not found: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems=vocals",
        "-n",
        model,
        "-d",
        "cpu",
        "--shifts",
        "1",
        "-o",
        str(output_dir),
        str(input_path),
    ]

    env = os.environ.copy()
    env["OMP_NUM_THREADS"] = "4"

    subprocess.run(
        command,
        check=True,
        timeout=timeout_seconds,
        env=env,
    )

    result_dir = output_dir / model / input_path.stem
    vocals = result_dir / "vocals.wav"
    instrumental = result_dir / "no_vocals.wav"

    for path in (vocals, instrumental):
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f"Missing separated stem: {path}")

    return vocals, instrumental


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    vocals, instrumental = separate(args.input, args.output)

    print(f"Vocals: {vocals}")
    print(f"Instrumental: {instrumental}")
