"""Local JACK V0.4 research-to-script demonstration.

Example:
PYTHONPATH=apps/api python apps/api/scripts/demo_jack_research_local.py \
 --url https://developer.salesforce.com/docs/... --output /tmp/jack_demo.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.harshverse.jack_content_engine import ContentRequest
from app.services.harshverse.jack_research import research_sources
from app.services.harshverse.jack_scriptwriter import generate_script_draft


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", action="append", required=True,
                        help="Approved Salesforce HTTPS documentation URL (up to five)")
    parser.add_argument("--topic", default="Salesforce Change Data Capture explained in 60 seconds")
    parser.add_argument("--format", choices=("talking_head", "faceless", "screen_demo"),
                        default="screen_demo")
    parser.add_argument("--output", required=True)
    parser.add_argument("--generate-script", action="store_true",
                        help="Explicit opt-in: send extracted excerpts to OpenAI")
    args = parser.parse_args()
    request = ContentRequest(topic=args.topic, audience="Salesforce developers",
                             goal="Explain the concept accurately",
                             format=args.format, duration_seconds=60)
    research = research_sources(args.url)
    output = {
        "schema_version": "jack-demo/v0.4",
        "research": {
            "status": research["status"],
            "source_discovery": research["source_discovery"],
            "claims_verified": False,
            "evidence": [
                {"id": item.id, "source_url": item.source_url, "excerpt": item.excerpt}
                for item in research["evidence"]
            ],
        },
        "storyboard": None,
    }
    if args.generate_script:
        output["storyboard"] = generate_script_draft(request, research["evidence"])
        output["storyboard"]["safety"]["research_performed"] = True
        output["storyboard"]["safety"]["evidence_origin"] = "jack_research_v0.4"
    destination = Path(args.output).expanduser()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved JACK review-only demo to {destination}")


if __name__ == "__main__":
    main()
