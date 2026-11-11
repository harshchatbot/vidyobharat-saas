"""Convert previously generated Reference DNA JSON into advisory blueprint JSON."""
import argparse
import json
from pathlib import Path

from app.services.harshverse.reference_style_blueprint import blueprint_from_file


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = blueprint_from_file(args.input)
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"BLUEPRINT: {output}")
    print("Observations:", result["diagnostics"]["accepted_observation_count"])
    print("Automatic editing: DISABLED")


if __name__ == "__main__":
    main()
