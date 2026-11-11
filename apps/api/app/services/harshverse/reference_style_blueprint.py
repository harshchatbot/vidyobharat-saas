"""Build an advisory-only, evidence-backed style blueprint from Reference DNA JSON.

No network calls. Unreviewed model observations never authorize editing actions.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
from pathlib import Path
import json
import math

KNOWN = frozenset(("presenter", "full_screen_graphics", "split_screen", "lower_third",
    "chart", "calendar", "money_stack", "illustration", "b_roll", "kinetic_typography",
    "text_reveal", "zoom", "slide", "transition"))
MOTION = frozenset(("kinetic_typography", "text_reveal", "zoom", "slide", "transition"))
GRAPHICS = frozenset(("full_screen_graphics", "slide", "chart", "calendar", "money_stack", "illustration"))
TEXT = frozenset(("text_reveal", "kinetic_typography", "lower_third"))


class InvalidReferenceDNA(ValueError):
    pass


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _bounds(data):
    video = data.get("video") or {}
    duration = video.get("duration_seconds")
    if not _number(duration) or not 0 < duration <= 86400:
        raise InvalidReferenceDNA("Valid duration_seconds is required")
    cuts = (data.get("editing_rhythm") or {}).get("detected_cut_times_seconds", [])
    if not isinstance(cuts, list) or len(cuts) > 1000:
        raise InvalidReferenceDNA("Invalid cut array")
    times = [0.0]
    for t in cuts:
        if not _number(t) or not times[-1] < t < duration:
            raise InvalidReferenceDNA("Cut times must increase and be inside video")
        times.append(float(t))
    times.append(float(duration))
    return list(zip(times, times[1:]))


def make_reference_blueprint(data):
    if not isinstance(data, dict):
        raise InvalidReferenceDNA("Expected JSON object")
    shots = _bounds(data)
    duration = shots[-1][1]
    section = data.get("temporal_vision") or {}
    windows = section.get("windows") or []
    if not isinstance(windows, list) or len(windows) > 100:
        raise InvalidReferenceDNA("Invalid temporal windows")
    observations, skipped = [], Counter()
    for wi, window in enumerate(windows):
        if not isinstance(window, dict) or window.get("error"):
            skipped["failed_window"] += 1
            continue
        frame_times = window.get("sampled_times_seconds") or []
        if not isinstance(frame_times, list) or any(not _number(t) for t in frame_times):
            skipped["invalid_frame_times"] += 1
            continue
        candidates = window.get("observations") or []
        if not isinstance(candidates, list) or len(candidates) > 1000:
            raise InvalidReferenceDNA("Invalid observation count")
        for candidate in candidates:
            if not isinstance(candidate, dict) or candidate.get("label") not in KNOWN:
                skipped["unknown_label"] += 1
                continue
            start, end = candidate.get("start_seconds"), candidate.get("end_seconds")
            evidence = candidate.get("evidence_times_seconds") or []
            if (not _number(start) or not _number(end) or not 0 <= start <= end <= duration
                or not isinstance(evidence, list) or not evidence
                or any(not _number(t) or t < start - .002 or t > end + .002
                       or not any(abs(t - s) <= .003 for s in frame_times) for t in evidence)):
                skipped["invalid_timing"] += 1
                continue
            if candidate["label"] in MOTION and len({round(t, 3) for t in evidence}) < 2:
                skipped["motion_without_temporal_evidence"] += 1
                continue
            observations.append({
                "label": candidate["label"], "start_seconds": round(start, 3),
                "end_seconds": round(end, 3),
                "evidence_times_seconds": sorted({round(t, 3) for t in evidence}),
                "evidence_summary": str(candidate.get("evidence") or "")[:400],
                "origin": "vision_model_unreviewed", "review_status": "unreviewed",
                "source_window_index": wi,
            })
    per_shot = []
    for i, (start, end) in enumerate(shots):
        labels = sorted({o["label"] for o in observations
            if o["start_seconds"] <= end and o["end_seconds"] >= start})
        per_shot.append({"shot_index": i, "start_seconds": round(start, 3),
                         "end_seconds": round(end, 3), "observed_labels": labels})
    counts = Counter(o["label"] for o in observations)
    p_shots = sum("presenter" in s["observed_labels"] for s in per_shot)
    g_shots = sum(bool(GRAPHICS.intersection(s["observed_labels"])) for s in per_shot)
    rhythm = data.get("editing_rhythm") or {}
    pacing = rhythm.get("pacing")
    if pacing not in {"slow", "moderate", "fast", "unknown"}:
        pacing = "unknown"
    mean = rhythm.get("mean_shot_seconds")
    inferred, advice = [], []
    if p_shots and g_shots:
        inferred.append({"hypothesis": "mixed_presenter_and_graphics",
            "basis": "presenter and graphics labels in sampled shots", "status": "provisional",
            "evidence_shot_indices": [s["shot_index"] for s in per_shot
                if "presenter" in s["observed_labels"] or GRAPHICS.intersection(s["observed_labels"])]})
        advice.append({"technique": "alternate_presenter_and_explainer",
            "strength": "soft_preference", "condition": "Only when narration benefits from explanation",
            "never_force": True})
    text_count = sum(counts[label] for label in TEXT)
    if text_count:
        inferred.append({"hypothesis": "text_emphasis_used",
            "basis": f"{text_count} text-related sampled observations", "status": "provisional"})
        advice.append({"technique": "progressive_text_emphasis", "strength": "soft_preference",
            "condition": "Only on meaningful spoken words with verified timing", "never_force": True})
    if pacing != "unknown":
        advice.append({"technique": "shot_pacing", "strength": "soft_preference",
            "value": pacing, "condition": "Adapt to narration; never copy cut timestamps",
            "never_force": True})
    return {
        "schema_version": "reference-style-blueprint/v0.13",
        "status": "provisional_unreviewed", "source_kind": "derived_from_reference_dna",
        "source_schema_version": data.get("schema_version", "unknown"),
        "observed": {"shot_count": len(shots), "shot_intervals": per_shot,
            "editing_rhythm": {"pacing": pacing,
                "mean_shot_seconds": round(mean, 3) if _number(mean) and mean > 0 else None},
            "temporal_observations": observations,
            "label_observation_counts": dict(sorted(counts.items())),
            "sample_coverage": deepcopy(section.get("sampling_coverage"))},
        "inferred": inferred,
        "recommended": {"advisory_editing_preferences": advice,
            "semantic_relevance_required": True,
            "source_facts_required_for_numeric_visuals": True, "copy_reference_assets": False},
        "quality_gate": {"automatic_application_allowed": False,
            "requires_reviewed_annotations": True,
            "reason": "Temporal observations unreviewed; only advisory guidance"},
        "diagnostics": {"skipped_observations": dict(skipped),
            "accepted_observation_count": len(observations)},
        "privacy": {"reference_frames_embedded": False,
            "reference_audio_embedded": False, "reference_assets_embedded": False},
    }


def blueprint_from_file(path):
    return make_reference_blueprint(json.loads(Path(path).read_text(encoding="utf-8")))
