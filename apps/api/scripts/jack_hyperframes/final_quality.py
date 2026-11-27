"""Final encoded-artifact gate for the normal JACK production path.

Only final audio mastering is automatically changed here. Visual defects have
already passed through the normal renderer's browser gate; any encoded visual
defect detected at this stage fails closed and requires an upstream full rerender.
Publication always remains a human decision.
"""
from __future__ import annotations

import copy
import json
import logging
import subprocess
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
LAB = HERE / "creative_lab"
import sys
if str(LAB) not in sys.path:
    sys.path.insert(0, str(LAB))

from producer import optimize
from rendered_video_evaluator import evaluate_video

logger = logging.getLogger(__name__)


class FinalQualityConfigurationError(ValueError):
    """Raised when a final-composite correction is not safely supported."""


def _validate(plan: dict[str, Any]) -> None:
    required = {"schema_version", "source_video", "expected_duration_seconds", "audio_mastering"}
    if set(plan) != required or plan["schema_version"] != 1:
        raise FinalQualityConfigurationError("Invalid final-quality plan")
    if not Path(plan["source_video"]).is_file() or plan["expected_duration_seconds"] <= 0:
        raise FinalQualityConfigurationError("Missing source video or duration")
    gain = plan["audio_mastering"].get("gain_db")
    if not isinstance(gain, (int, float)) or not -12 <= gain <= 12:
        raise FinalQualityConfigurationError("Audio correction is outside safe bounds")


def _propose(_plan: dict[str, Any], defects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    categories = {item["category"] for item in defects}
    unsupported = categories - {"audio_loudness", "audio_peak"}
    if unsupported:
        return []
    if categories:
        return [{"operation": "remaster_audio", "target_lufs": -14, "true_peak_dbtp": -1.5}]
    return []


def _apply(plan: dict[str, Any], operations: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if len(operations) != 1 or operations[0].get("operation") != "remaster_audio":
        raise FinalQualityConfigurationError("Only bounded final audio remastering is supported")
    updated = copy.deepcopy(plan)
    updated["audio_mastering"] = {"gain_db": 0, "loudnorm": {"integrated_lufs": -14, "true_peak_dbtp": -1.5, "lra": 7}}
    return updated, [{**operations[0], "actual_correction": "FFmpeg loudnorm final-composite pass"}]


def optimize_final(video: str | Path, output: str | Path, *, expected_duration_seconds: float,
                   browser_report: str | Path | None, commit: str, max_revisions: int = 1) -> dict[str, Any]:
    source = Path(video).resolve()
    root = Path(output).resolve()
    plan = {"schema_version": 1, "source_video": str(source),
            "expected_duration_seconds": float(expected_duration_seconds),
            "audio_mastering": {"gain_db": 0}}
    logger.info("JACK final-quality gate start video=%s", source)

    def render(candidate: dict[str, Any], attempt: Path, _scope: list[int]) -> Path:
        if candidate["audio_mastering"].get("loudnorm") is None:
            return source
        target = attempt / "review-remastered.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source),
                        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
                        "-af", "loudnorm=I=-14:TP=-1.5:LRA=7", "-c:a", "aac",
                        "-b:a", "192k", "-ar", "48000", str(target)], check=True)
        return target

    def evaluate(candidate_video: Path, attempt: Path, candidate: dict[str, Any], attempt_id: str) -> dict[str, Any]:
        return evaluate_video(candidate_video, attempt, run_id=root.name, attempt_id=attempt_id,
                              commit=commit, config={"expected_duration_seconds": candidate["expected_duration_seconds"]},
                              browser_report=browser_report)

    result = optimize(plan, render, evaluate, _propose, _apply, _validate, root,
                      max_revisions=max_revisions, transient_retries=1,
                      time_budget_seconds=max(180, expected_duration_seconds * 12))
    result["final_quality_gate"] = "pass" if result["status"] == "final_awaiting_approval" else "blocked"
    result["human_publication_approval_required"] = True
    result["publish_authorized"] = False
    (root / "final_quality_result.json").write_text(json.dumps(result, indent=2))
    logger.info("JACK final-quality gate end status=%s", result["status"])
    return result
