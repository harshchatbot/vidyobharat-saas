"""Offline CLI: review ChatGPT-authored semantic choices; render only with real plate."""
import argparse
import json
from pathlib import Path

from app.services.video_creative_context import CreativeContext
from app.services.harshverse.chat_plan_preview import compile_chat_preview, render_chat_preview


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True)
    parser.add_argument("--choices", required=True, help="JSON choices with schema_version=1.0")
    parser.add_argument("--reference", help="Optional reference-style blueprint V0.13 JSON")
    parser.add_argument("--output", required=True, help="Review JSON destination")
    parser.add_argument("--presenter", help="Original recording, with audio")
    parser.add_argument("--animation", help="Already prepared real animation MP4")
    parser.add_argument("--approved-module", help="Module ID matching validated choice and supplied plate")
    parser.add_argument("--video-output", help="Explicitly requested local diagnostic MP4")
    args = parser.parse_args()
    context = CreativeContext.model_validate_json(Path(args.context).read_text(encoding="utf-8"))
    choices = json.loads(Path(args.choices).read_text(encoding="utf-8"))
    reference = json.loads(Path(args.reference).read_text(encoding="utf-8")) if args.reference else None
    render_args = (args.presenter, args.animation, args.approved_module, args.video_output)
    if any(render_args) and not all(render_args):
        parser.error("Rendering needs --presenter --animation --approved-module --video-output together")
    if all(render_args):
        result = render_chat_preview(
            context, choices, presenter=Path(args.presenter), animation=Path(args.animation),
            output=Path(args.video_output), approved_module=args.approved_module,
            reference_blueprint=reference,
        )
    else:
        validated, plan = compile_chat_preview(context, choices, reference_blueprint=reference)
        result = {"validated": validated, "render_plan": None if plan is None else "review_only"}
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Review: {destination}")
    print("Render:", args.video_output if all(render_args) else "SKIPPED - no verified animation plate")
    print("Automatic application: DISABLED")


if __name__ == "__main__":
    main()
