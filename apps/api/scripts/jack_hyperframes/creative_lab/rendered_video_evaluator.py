"""Inspect the actual encoded JACK video with deterministic local tools."""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path
from typing import Any

from evaluation_contracts import artifact_record, defect, evaluation


class EncodedVideoEvaluationError(RuntimeError):
    """The encoded artifact cannot be decoded or evaluated."""


def _in_ranges(seconds: float, ranges: list[list[float]]) -> bool:
    return any(start <= seconds <= end for start, end in ranges)


def _runs(values: list[bool], fps: int, minimum_seconds: float) -> list[dict[str, float]]:
    result, start = [], None
    for index, active in enumerate(values + [False]):
        if active and start is None: start = index
        elif not active and start is not None:
            if (index - start) / fps >= minimum_seconds:
                result.append({"start": start / fps, "end": index / fps})
            start = None
    return result


def _probe(video: Path) -> dict[str, Any]:
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "null", "-"],
                       capture_output=True, check=True)
        return json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)
        ], text=True))
    except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        raise EncodedVideoEvaluationError("Encoded video failed decode/probe") from exc


def _pixels(video: Path, fps: int = 10) -> tuple[list[float], list[float], list[float]]:
    width, height = 96, 170
    try:
        raw = subprocess.check_output([
            "ffmpeg", "-v", "error", "-i", str(video), "-an", "-vf",
            f"fps={fps},scale={width}:{height},format=gray", "-f", "rawvideo", "-"
        ])
    except subprocess.CalledProcessError as exc:
        raise EncodedVideoEvaluationError("Frame extraction failed") from exc
    size = width * height
    frames = [raw[i:i + size] for i in range(0, len(raw) - size + 1, size)]
    means = [sum(frame) / size for frame in frames]
    contrasts = []
    for frame, mean in zip(frames, means):
        contrasts.append(math.sqrt(sum((value - mean) ** 2 for value in frame) / size))
    changes = [sum(abs(a - b) for a, b in zip(left, right)) / size for left, right in zip(frames, frames[1:])]
    return means, contrasts, changes


def evaluate_video(video: str | Path, output: str | Path, *, run_id: str, attempt_id: str,
                   commit: str, config: dict[str, Any] | None = None,
                   browser_report: str | Path | None = None,
                   plan: dict[str, Any] | None = None) -> dict[str, Any]:
    video, output = Path(video).resolve(), Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    config, plan = dict(config or {}), dict(plan or {})
    intentional_dark = config.get("intentional_dark_ranges", [])
    intentional_holds = config.get("intentional_hold_ranges", [])
    sample_fps = int(config.get("sample_fps", 10))
    evidence = [artifact_record(video)]
    findings = []
    try:
        probe = _probe(video)
    except EncodedVideoEvaluationError as exc:
        marker = output / "decode_failure.txt"
        marker.write_text(str(exc))
        findings.append(defect(category="decode_failure", severity="critical",
                               evidence=[artifact_record(marker)], reproduction={"command": "ffmpeg -v error -i VIDEO -f null -"},
                               confidence=1, verification_method="deterministic", capability="technical_qa",
                               suggested_correction=None, limitations=["Artifact must be rerendered"])); probe = {"streams": [], "format": {}}
        means, contrasts, changes = [], [], []
    else:
        means, contrasts, changes = _pixels(video, sample_fps)
    duration = float(probe.get("format", {}).get("duration", 0) or 0)
    expected = config.get("expected_duration_seconds") or (plan.get("total_frames", 0) / plan.get("fps", 30) if plan else None)
    if expected and abs(duration - expected) > .15:
        findings.append(defect(category="duration_mismatch", severity="high", evidence=evidence,
                               reproduction={"expected_seconds": expected, "actual_seconds": duration}, confidence=1,
                               verification_method="deterministic", capability="rendering", suggested_correction=None,
                               before_after={"before": {"duration": duration}, "target": {"duration": expected}}))
    black = [mean < 8 and not _in_ranges(i / sample_fps, intentional_dark) for i, mean in enumerate(means)]
    for run in _runs(black, sample_fps, .4):
        findings.append(defect(category="blank_black_frames", severity="high", evidence=evidence,
                               scene=None, timecode_seconds=run["start"], reproduction={"range": run, "threshold_luma": 8},
                               confidence=.98, verification_method="deterministic", capability="temporal_qa",
                               suggested_correction={"operation": "set_visibility_lead_in"},
                               limitations=["Declared intentional dark ranges are excluded"]));
    static_flags = [value < .15 and not _in_ranges((i + 1) / sample_fps, intentional_holds) for i, value in enumerate(changes)]
    for run in _runs(static_flags, sample_fps, 1):
        findings.append(defect(category="unexpected_static", severity="high", evidence=evidence,
                               scene=None, timecode_seconds=run["start"], reproduction={"range": run, "change_threshold": .15},
                               confidence=.9, verification_method="deterministic", capability="motion",
                               suggested_correction={"operation": "set_camera"},
                               limitations=["Declared intentional hold ranges are excluded"]));
    for index in range(1, len(means) - 1):
        timecode = index / sample_fps
        if _in_ranges(timecode, intentional_dark): continue
        neighbor = (means[index - 1] + means[index + 1]) / 2
        if means[index] - neighbor > 55:
            findings.append(defect(category="transition_flash", severity="high", evidence=evidence,
                                   scene=None, timecode_seconds=timecode,
                                   reproduction={"luma": means[index], "neighbor_luma": neighbor}, confidence=.95,
                                   verification_method="deterministic", capability="transitions",
                                   suggested_correction={"operation": "set_transition"}));
    exposure_threshold = 30 if config.get("exposure_check") else 4
    dark_runs = _runs([mean < exposure_threshold and not _in_ranges(i / sample_fps, intentional_dark) for i, mean in enumerate(means)], sample_fps, .6)
    for run in dark_runs:
        findings.append(defect(category="exposure", severity="medium", evidence=evidence,
                               scene=None, timecode_seconds=run["start"], reproduction={"range": run, "luma_threshold": exposure_threshold},
                               confidence=.85, verification_method="deterministic", capability="lighting",
                               suggested_correction={"operation": "set_lighting"},
                               limitations=["Luma cannot determine subjective dramatic intent"]));
    if contrasts and sum(contrasts) / len(contrasts) < 8:
        findings.append(defect(category="contrast", severity="medium", evidence=evidence,
                               reproduction={"mean_contrast": sum(contrasts) / len(contrasts)}, confidence=.8,
                               verification_method="deterministic", capability="lighting",
                               suggested_correction={"operation": "set_lighting"},
                               limitations=["Global contrast is not a composition score"]));
    browser = None
    if browser_report:
        browser_path = Path(browser_report).resolve()
        if browser_path.is_file():
            browser = json.loads(browser_path.read_text())
            browser_evidence = [artifact_record(browser_path), *evidence]
            mapping = {"blank_frame": "subject_visibility", "text_safe_area": "text_safe_area",
                       "caption_safe_area": "text_safe_area", "text_overlap": "text_overlap",
                       "text_overflow": "text_overflow", "geometry_bounds": "geometry_bounds",
                       "camera_discontinuity": "camera_discontinuity", "camera_acceleration": "camera_acceleration",
                       "transition_missing": "transition_discontinuity", "subject_visibility": "subject_visibility",
                       "expected_asset_missing": "missing_asset", "missing_or_hidden_asset": "missing_asset",
                       "empty_scene": "subject_visibility", "javascript_error": "browser_execution",
                       "resource_failure": "browser_execution", "browser_execution": "browser_execution"}
            for issue in browser.get("defects", []):
                category = mapping.get(issue.get("code"))
                if not category: continue
                findings.append(defect(category=category, severity=issue.get("severity", "high"), evidence=browser_evidence,
                                       scene=issue.get("scene"), timecode_seconds=issue.get("seconds"),
                                       reproduction={**issue, "object_id": issue.get("detail")}, confidence=1,
                                       verification_method="deterministic", capability="visual_qa",
                                       suggested_correction={"operation": "targeted_repair"}))
    for asset in plan.get("approved_assets", []) if isinstance(plan.get("approved_assets"), list) else []:
        path = asset.get("path") if isinstance(asset, dict) else None
        if path and not Path(path).is_file():
            findings.append(defect(category="missing_asset", severity="high", evidence=evidence,
                                   scene=asset.get("scene"), reproduction={"approved_path": path}, confidence=1,
                                   verification_method="deterministic", capability="assets",
                                   suggested_correction={"operation": "restore_asset"}))
    temporal = {}
    if duration and any(stream.get("codec_type") == "audio" for stream in probe.get("streams", [])):
        from temporal_audio_qa import inspect
        temporal = inspect(video, video.parent)
        audio = temporal["audio"]
        if audio.get("integrated_lufs") is None or abs(audio["integrated_lufs"] + 14) > 2:
            findings.append(defect(category="audio_loudness", severity="high", evidence=evidence,
                                   reproduction={"target_lufs": -14}, confidence=1, verification_method="deterministic",
                                   capability="mastering", suggested_correction={"operation": "set_audio_gain"},
                                   before_after={"before": audio}))
        if audio.get("true_peak_dbtp") is None or audio["true_peak_dbtp"] > -1:
            findings.append(defect(category="audio_peak", severity="high", evidence=evidence,
                                   reproduction={"maximum_dbtp": -1}, confidence=1, verification_method="deterministic",
                                   capability="mastering", suggested_correction={"operation": "set_audio_gain"},
                                   before_after={"before": audio}))
        if audio.get("silence_starts_seconds"):
            findings.append(defect(category="unexpected_audio_silence", severity="medium", evidence=evidence,
                                   timecode_seconds=audio["silence_starts_seconds"][0],
                                   reproduction={"silence_starts": audio["silence_starts_seconds"]}, confidence=.9,
                                   verification_method="deterministic", capability="audio_qa", suggested_correction=None,
                                   limitations=["Listening review must distinguish intentional silence"]));
    measurements = {"duration_seconds": duration, "sample_fps": sample_fps, "sampled_frames": len(means),
                    "mean_luma": sum(means) / len(means) if means else None,
                    "mean_contrast": sum(contrasts) / len(contrasts) if contrasts else None,
                    "mean_frame_change": sum(changes) / len(changes) if changes else None,
                    "probe": probe, "temporal_audio": temporal,
                    "browser_scope": browser.get("scope") if browser else None}
    report = evaluation(run_id=run_id, attempt_id=attempt_id, commit=commit, config=config,
                        video=video, defects=findings, measurements=measurements,
                        limitations=["Deterministic checks do not establish artistic quality",
                                     "Creative categories require independent human review"])
    path = output / "rendered_video_evaluation.json"
    path.write_text(json.dumps(report, indent=2))
    return report
