"""Merge existing local temporal DNA and OpenAI static-frame JSON without API calls."""
import argparse
import json
from pathlib import Path

from app.services.harshverse.reference_style_blueprint import make_reference_blueprint


def combine(temporal: dict, visual: dict) -> tuple[dict, dict]:
    if not isinstance(temporal, dict) or not isinstance(visual, dict):
        raise ValueError("Both inputs must be JSON objects")
    tv, vv = temporal.get("video") or {}, visual.get("video") or {}
    if not isinstance(tv, dict) or not isinstance(vv, dict):
        raise ValueError("Missing video metadata")
    a, b = tv.get("duration_seconds"), vv.get("duration_seconds")
    if type(a) not in (int, float) or type(b) not in (int, float) or abs(a - b) > .05:
        raise ValueError("Video durations differ; cannot safely combine evidence")
    ta, va = temporal.get("editing_rhythm") or {}, visual.get("editing_rhythm") or {}
    if ta.get("detected_cut_times_seconds") != va.get("detected_cut_times_seconds"):
        raise ValueError("Shot boundaries differ; cannot safely combine evidence")
    if not isinstance(visual.get("semantic_vision"), dict):
        raise ValueError("Missing semantic_vision")
    merged = dict(temporal)
    merged["semantic_vision"] = visual["semantic_vision"]
    return merged, make_reference_blueprint(merged)


def main():
    parser = argparse.ArgumentParser(description="Offline visual + temporal Reference DNA integration")
    parser.add_argument("--temporal", required=True)
    parser.add_argument("--visual", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    temporal = json.loads(Path(args.temporal).expanduser().read_text())
    visual = json.loads(Path(args.visual).expanduser().read_text())
    merged, blueprint = combine(temporal, visual)
    output = Path(args.output_dir).expanduser()
    output.mkdir(parents=True, exist_ok=True)
    (output / "reference_dna_unified.json").write_text(json.dumps(merged, indent=2) + "\n")
    (output / "reference_blueprint_unified.json").write_text(json.dumps(blueprint, indent=2) + "\n")
    print("Static observations:", blueprint["diagnostics"]["accepted_static_observation_count"])
    print("Labels:", blueprint["observed"]["label_observation_counts"])
    print("Automatic application:", blueprint["quality_gate"]["automatic_application_allowed"])


if __name__ == "__main__":
    main()
