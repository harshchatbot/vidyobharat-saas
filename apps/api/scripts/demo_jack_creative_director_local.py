"""Generate Creative Director proposals from a JACK demo JSON.

This is a review-only handoff; it does not invoke rendering or download assets.
"""
import argparse
import json
from pathlib import Path

from app.services.harshverse.jack_creative_director_bridge import bridge_jack_to_creative_director


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--storyboard", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    data = json.loads(Path(args.storyboard).expanduser().read_text(encoding="utf-8"))
    storyboard = data.get("storyboard", data)
    result = bridge_jack_to_creative_director(storyboard)
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Creative Director review proposals: {output}")


if __name__ == "__main__":
    main()
