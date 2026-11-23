"""Local-only Reference DNA -> advisory style blueprint smoke-test.

No hosted model calls, editor changes, or automatic edit authorization.
"""
import argparse
import json
from pathlib import Path

from app.services.harshverse.reference_dna_semantic import analyze_reference_v010
from app.services.harshverse.reference_dna_temporal import analyze_temporal
from app.services.harshverse.reference_style_blueprint import make_reference_blueprint


def analyze_local(reference: str, *, max_windows: int = 6):
    base = analyze_reference_v010(reference, max_frames=6)
    dna = analyze_temporal(reference, base, provider=None,
                           provider_name="none", max_windows=max_windows)
    blueprint = make_reference_blueprint(dna)
    if blueprint["quality_gate"]["automatic_application_allowed"]:
        raise RuntimeError("Unreviewed reference cannot authorize automatic edits")
    return dna, blueprint


def main():
    parser = argparse.ArgumentParser(description="Local reference analysis and advisory blueprint")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-windows", type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.max_windows <= 20:
        parser.error("--max-windows must be between 1 and 20")
    source = Path(args.reference).expanduser().resolve()
    if not source.is_file():
        parser.error("Reference video does not exist")
    dna, blueprint = analyze_local(str(source), max_windows=args.max_windows)
    target = Path(args.output_dir).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    for filename, payload in (("reference_dna.json", dna), ("reference_blueprint.json", blueprint)):
        (target / filename).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("Local analysis complete; automatic editing remains disabled.")
    print("Blueprint:", target / "reference_blueprint.json")


if __name__ == "__main__":
    main()
