"""V3.3: Topic -> AI storyboard -> validation -> optional deterministic MP4 preview.

This CLI never publishes. The generator has no fixture fallback; if the model
cannot produce a valid storyboard after one repair, the run fails closed.
Rendering reuses the already-tested V3.2 illustrated engine.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

from validate import ACTORS, ENTRANCES, EVENTS, POSES, PROPS, ROLES, SFX, validate


SYSTEM = """You are RangManch Illustrated Creative Director V3.3.
Generate an ORIGINAL, precise, visually legible 20-second VOICELESS illustrated
vertical reel. Output a JSON object matching the given reference example's
structure, but write entirely NEW story, dialogue, event timings and actions
for the user's topic. Do NOT reuse the reference story about five AI critics.
No narration, no claims of performance/returns without substantiation.
The *only* allowed actor IDs, prop IDs, poses, entrance styles, event types
and SFX IDs come from the supplied library lists. Do not invent asset IDs.
Do NOT write executable scripts, URLs, or HTML into visible text.
The story MUST work without audio; give each beat an on-screen action.
Every beat MUST have a coordinated SFX within 2 frames of a visible event.
Use concise, impactful text with varied visual compositions.
Use exactly 8 beats in story-role order:
hook, setup, proof, reveal, demo, demo, resolution, cta.
For a full duration of 600 frames, use the frame allocation in the
provided frame_slots list (start/end/duration are absolute frame indices).
This is a deliberately constrained v3.3 integration with v3.2 renderer.
Each headline has 1-5 words and its emphasis_word must appear within it.
Each caption has 1-7 words, 1-2 highlight_words in that caption and a
stagger_frames integer 3-5. Each caption must have at least 8 frames/word.
The only 6-actor shot allowed is the first hook; otherwise max 3 actors.
No financial guarantees, fictitious statistics presented as real, or
misleading medical/financial advice. Counter events must be illustrative.
End with a short uppercase keyword typed into comment_box, alongside
an envelope prop. CTA requires type_text on comment_box.
Preserve schema, version, fps, width, height, needs_review=true,
ready_to_publish=false. All content requires manual review.
Return valid JSON only: no markdown, commentary or code fences."""


FRAME_SLOTS = [
    {"id": "beat-01", "role": "hook", "start_frame": 0, "end_frame": 60, "duration_frames": 60},
    {"id": "beat-02", "role": "setup", "start_frame": 60, "end_frame": 120, "duration_frames": 60},
    {"id": "beat-03", "role": "proof", "start_frame": 120, "end_frame": 180, "duration_frames": 60},
    {"id": "beat-04", "role": "reveal", "start_frame": 180, "end_frame": 240, "duration_frames": 60},
    {"id": "beat-05", "role": "demo", "start_frame": 240, "end_frame": 330, "duration_frames": 90},
    {"id": "beat-06", "role": "demo", "start_frame": 330, "end_frame": 420, "duration_frames": 90},
    {"id": "beat-07", "role": "resolution", "start_frame": 420, "end_frame": 495, "duration_frames": 75},
    {"id": "beat-08", "role": "cta", "start_frame": 495, "end_frame": 600, "duration_frames": 105},
]


def request_payload(topic: str, sample: dict, previous: dict | None = None,
                    feedback: str | None = None) -> dict:
    request = {
        "topic": topic,
        "reference_is_structure_only_not_content": sample,
        "frame_slots": FRAME_SLOTS,
        "library": {
            "actors": sorted(ACTORS), "poses": sorted(POSES), "props": sorted(PROPS),
            "events": sorted(EVENTS), "sfx": sorted(SFX),
            "roles": ROLES, "entrances": sorted(ENTRANCES),
        },
    }
    if previous is not None:
        request["previous_invalid_storyboard"] = previous
        request["validation_error_to_fix"] = feedback
    return request


def verify_generated(doc: dict, topic: str) -> dict:
    # The renderer's existing strict contract is the authoritative validator.
    result = validate(doc)
    beats = doc["beats"]
    if len(beats) != len(FRAME_SLOTS):
        raise ValueError("V3.3 requires eight storyboard beats")
    for beat, slot in zip(beats, FRAME_SLOTS):
        for key, expected in slot.items():
            if beat.get(key) != expected:
                raise ValueError(f"{beat.get('id')}: {key} must be {expected!r}")
    if doc.get("brief") != topic:
        raise ValueError("brief must match the original user topic exactly")
    if not isinstance(doc.get("creative_thesis"), str) or not doc["creative_thesis"].strip():
        raise ValueError("Missing creative thesis")
    # Validate Unicode-safe textual content. This stage accepts plain text only.
    for beat in beats:
        for text in [beat["headline"]["text"], beat["caption"]["text"],
                     *(p.get("text", "") or "" for p in beat["stage"]["props"])]:
            if any(ch in text for ch in ("<", ">", "{", "}", "\x00")):
                raise ValueError("Potential markup/code in storyboard text")
        for event in beat["events"]:
            val = event.get("value")
            if isinstance(val, str) and any(ch in val for ch in ("<", ">", "{", "}", "\x00")):
                raise ValueError("Potential markup/code in event value")
    return result


async def generate(topic: str, example: dict, key: str, *,
                   model: str = "gpt-4o-mini") -> tuple[dict, dict]:
    # No API key persisted, logged or included in saved reports.
    previous: dict | None = None
    feedback: str | None = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10)) as client:
        for attempt in range(2):
            req = request_payload(topic, example, previous, feedback)
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model, "temperature": 0.45,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": json.dumps(req, ensure_ascii=False)},
                    ],
                },
            )
            resp.raise_for_status()
            choice = (resp.json().get("choices") or [])[0]
            message = choice.get("message") or {}
            if message.get("refusal") or choice.get("finish_reason") != "stop":
                raise ValueError("Model refused or did not finish complete storyboard")
            output = message.get("content")
            try:
                doc = json.loads(output)
                doc["brief"] = topic  # Topic is trusted input, not an AI-derived field.
                proof = verify_generated(doc, topic)
                return doc, {**proof, "model": model, "repair_attempts": attempt,
                             "source": "openai_generated", "publish_gate": "blocked_review_required"}
            except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
                feedback = str(exc)[:500]
                try:
                    previous = json.loads(output)
                except (TypeError, json.JSONDecodeError):
                    previous = {"model_output": str(output)[:6000]}
                if attempt:
                    raise ValueError(f"AI storyboard failed validation after repair: {feedback}") from exc
    raise RuntimeError("Unreachable storyboard generation state")


def load_example() -> dict:
    p = Path(__file__).with_name("example_illustrated_v30.json")
    return json.loads(p.read_text(encoding="utf-8"))


def provenance(topic: str, plan: dict, qa: dict) -> dict:
    canonical = json.dumps(plan, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return {
        **qa,
        "topic_sha256": hashlib.sha256(topic.encode("utf-8")).hexdigest(),
        "storyboard_sha256": hashlib.sha256(canonical).hexdigest(),
        "needs_review": True, "ready_to_publish": False,
        "warnings": [
            "Private storyboard preview only: no license or content clearance",
            "No Celery worker, quotas or automated publish/export authorization",
            "Human review of visual accuracy, SFX and claims is mandatory",
        ],
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--topic", required=True, help="Short original prompt for voiceless illustrated reel")
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--model", default="gpt-4o-mini")
    p.add_argument("--plan-only", action="store_true",
                   help="Only generate and validate storyboard JSON; do not render")
    p.add_argument("--chromium", default=None)
    p.add_argument("--width", type=int, choices=(540, 1080), default=540)
    p.add_argument("--smoke-frames", type=int,
                   help="Partial QA test frames, not a publishable export")
    args = p.parse_args()
    topic = args.topic.strip()
    if not 12 <= len(topic) <= 900:
        p.error("--topic must be between 12 and 900 characters")
    load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        p.error("OPENAI_API_KEY missing: no unapproved fallback storyboard")
    if args.output_dir.exists() and (not args.output_dir.is_dir() or any(args.output_dir.iterdir())):
        p.error("Choose a new empty output directory to preserve previous renders")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    doc, proof = asyncio.run(generate(topic, load_example(), api_key, model=args.model))
    storyboard_path = args.output_dir / "illustrated_v33_storyboard.json"
    storyboard_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
                               encoding="utf-8")
    report = provenance(topic, doc, proof)
    if not args.plan_only:
        # Reuse the existing V3.2 renderer; do not duplicate animation logic.
        from render import render
        video = args.output_dir / "illustrated_v33_preview.mp4"
        rendered = render(storyboard_path, video, chromium=args.chromium,
                          width=args.width, qa_frames=args.smoke_frames)
        report["render"] = rendered
        report["preview_path"] = str(video)
        report["is_partial_preview"] = args.smoke_frames is not None
    report_path = args.output_dir / "illustrated_v33_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                           encoding="utf-8")
    print(json.dumps({"storyboard": str(storyboard_path),
                      "report": str(report_path),
                      "video": report.get("preview_path"),
                      "frames": proof["frames"], "beats": proof["beats"],
                      "publish_gate": report["publish_gate"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
