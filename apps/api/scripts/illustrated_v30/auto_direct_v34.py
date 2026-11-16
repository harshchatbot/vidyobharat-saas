"""V3.4: Topic -> AI storyboard -> validation -> optional deterministic MP4 preview.

This CLI never publishes. The generator has no fixture fallback; if the model
cannot produce a valid storyboard after one repair, the run fails closed.
Rendering reuses the already-tested V3.4 visual stage with graphic-first directing.
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

from validate import ACTORS, ENTRANCES, EVENTS, POSES, PROPS, ROLES, SFX, LAYOUTS, validate


SYSTEM = "You are RangManch Creative Director V3.4 for ORIGINAL 20-second VOICELESS illustrated reels.\nYou are not given any sample story. Do not default to critics, roast, five critics, reviews, or\na fake conversation. Select the story specifically for the user's topic.\nProduce pure valid JSON matching the field contract and library manifest in the user request.\nSchema: rangmanch_illustrated_v30; version: \"3.0\"; fps=30; width=1080; height=1920;\nduration_seconds=20; needs_review=true; ready_to_publish=false; palette:\n{\"bg\":\"#f4ecdf\",\"text\":\"#1d1b19\",\"accent\":\"#e8a317\",\"accent2\":\"#2f7d5b\"}.\nStory fields: brief (the user's topic exactly), creative_thesis (one concise sentence);\nbeats (8 entries), warnings (array).\nEach beat: id, role, start_frame, end_frame, duration_frames (copy supplied slot),\nheadline: {text,emphasis_word}; caption: {text,highlight_words:[one or two words],stagger_frames:4};\nstage: {layout,actors:[{id,pose,x,enter}],props:[{id,text,enter}]};\nevents:[{type,target,at_frame,value?}]; sfx:[{id,at_frame}].\nUse the visual library IDs only; graphic_focus/full_bleed/center_card/split_compare\nlayouts must have props and do not need actors. Use character_focus for human actions.\nUse at least 4 distinct stage.layout values, and topic-relevant graphical props\nin 3 or more beats. Strongly prefer graphic-first storytelling to generic actors.\nChoose from phone_screen, retention_chart, timeline_bar, compare_card, checklist_card,\nidea_card, fix_board, stat_card, prompt_card; use ONLY relevant icons/props for topic.\nFor topics about creator retention: prefer phone_screen, retention_chart, timeline_bar,\ncompare_card. For other topics invent your own story within available visuals,\nnot any prescribed example narrative.\nDo not use actor IDs beginning critic_ unless the user explicitly asks for a critic,\ncritique or character review. founder may be used sparingly.\nAt most 3 actors per non-hook scene; hook may also use fewer.\nEvery beat must have at least 1 event with 1 SFX aligned within 2 frames.\nVisible event types: pop, type_text, shake, stamp, confetti, counter.\nFor pop events target a present stage prop or actor. For stamp events target stage\nor a present prop. No invisible targets. For type_text target a present prop;\nvalue is short uppercase or plain text. Avoid counter unless explicit illustrative=true\nwith from/to numeric values; never imply fake numbers are measured data.\nUse short compelling original headlines 1-5 words and captions 1-7 words.\nemphasis_word must literally occur in headline; highlight_words must occur in caption,\nstagger_frames integer 3-5 and 8 frames available for each caption word.\nCTA final beat must include comment_box and envelope props, and a type_text event on\ncomment_box with an uppercase keyword 1-8 characters. Use cta_focus layout.\nAll text must be plain, safe and readable, no HTML and no fake claims.\nNarrative roles in precise order: hook,setup,proof,reveal,demo,demo,resolution,cta.\nUse exactly the eight supplied frame slots to total 600 frames.\nReturn JSON only. Never claim approved for publishing."


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


def request_payload(topic: str, sample: dict | None = None, previous: dict | None = None,
                    feedback: str | None = None) -> dict:
    # No sample storyboard content! Sending V3.0 reference biased model output to five critics.
    request = {
        "topic": topic, "frame_slots": FRAME_SLOTS,
        "required_structure": {
            "schema": "rangmanch_illustrated_v30", "version": "3.0",
            "brief": topic, "creative_thesis": "short original topic-specific concept",
            "fps": 30, "width": 1080, "height": 1920, "duration_seconds": 20,
            "palette": {"bg": "#f4ecdf", "text": "#1d1b19",
                        "accent": "#e8a317", "accent2": "#2f7d5b"},
            "beats": "Eight beat objects using exact fields from system instruction",
            "needs_review": True, "ready_to_publish": False,
            "warnings": ["private preview, human review required"],
        },
        "library": {
            "actors": sorted(ACTORS), "poses": sorted(POSES), "props": sorted(PROPS),
            "events": sorted(EVENTS), "sfx": sorted(SFX), "roles": ROLES,
            "entrances": sorted(ENTRANCES),
            "layouts": sorted(LAYOUTS),
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
        raise ValueError("V3.4 requires eight storyboard beats")
    for beat, slot in zip(beats, FRAME_SLOTS):
        for key, expected in slot.items():
            if beat.get(key) != expected:
                raise ValueError(f"{beat.get('id')}: {key} must be {expected!r}")
    if doc.get("brief") != topic:
        raise ValueError("brief must match the original user topic exactly")
    if not isinstance(doc.get("creative_thesis"), str) or not doc["creative_thesis"].strip():
        raise ValueError("Missing creative thesis")
    layouts = [beat["stage"].get("layout", "character_focus") for beat in beats]
    if len(set(layouts)) < 4:
        raise ValueError("V3.4 requires four distinct visual layouts")
    graphical = {"phone_screen", "retention_chart", "timeline_bar",
                 "compare_card", "checklist_card", "stat_card", "idea_card",
                 "prompt_card", "fix_board"}
    if sum(bool({p["id"] for p in b["stage"]["props"]} & graphical) for b in beats) < 3:
        raise ValueError("V3.4 requires topic-relevant graphics in three beats")
    if layouts[-1] != "cta_focus":
        raise ValueError("V3.4 CTA must use cta_focus layout")
    if "critic" not in topic.casefold() and "roast" not in topic.casefold() and "reviewer" not in topic.casefold():
        if any(a["id"].startswith("critic_") for b in beats for a in b["stage"]["actors"]):
            raise ValueError("V3.4 disallows critic characters unrelated to topic")
    for b in beats:
        present = {a["id"] for a in b["stage"]["actors"]} | {p["id"] for p in b["stage"]["props"]}
        if not present:
            raise ValueError(f"{b['id']}: scene has no visual elements")
        for event in b["events"]:
            if event["target"] != "stage" and event["target"] not in present:
                raise ValueError(f"{b['id']}: event target not present on stage")
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
                             "source": "openai_generated_v34", "publish_gate": "blocked_review_required"}
            except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
                feedback = str(exc)[:500]
                try:
                    previous = json.loads(output)
                except (TypeError, json.JSONDecodeError):
                    previous = {"model_output": str(output)[:6000]}
                if attempt:
                    raise ValueError(f"AI storyboard failed validation after repair: {feedback}") from exc
    raise RuntimeError("Unreachable storyboard generation state")


def load_example() -> dict | None:
    return None  # Deliberately never send a previous story to the director.


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
    storyboard_path = args.output_dir / "illustrated_v34_storyboard.json"
    storyboard_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
                               encoding="utf-8")
    from visual_qa_v34 import storyboard_preflight, browser_visual_qa
    report = provenance(topic, doc, proof)
    report["storyboard_preflight"] = storyboard_preflight(doc)
    if not args.plan_only:
        # Reuse the existing V3.2 renderer; do not duplicate animation logic.
        from render import render
        video = args.output_dir / "illustrated_v34_preview.mp4"
        rendered = render(storyboard_path, video, chromium=args.chromium,
                          width=args.width, qa_frames=args.smoke_frames)
        report["render"] = rendered
        try:
            report["visual_qa"] = browser_visual_qa(doc, chromium=args.chromium, width=args.width)
        except Exception as exc:
            report["visual_qa"] = {"status": "qa_failed", "error": str(exc)[:300]}
        report["release_gate"] = "blocked_manual_review"
        report["preview_path"] = str(video)
        report["is_partial_preview"] = args.smoke_frames is not None
    report_path = args.output_dir / "illustrated_v34_report.json"
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
