"""Build the final JACK acceptance-preparation package without paid calls."""
from __future__ import annotations

import argparse
import json
import shutil
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from paid_budget import preflight
from quality_policy import RUBRIC

COMMIT = "41f8b70b7dd470afd1cc3c7a215d80a30fce5212"
PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing"
MODEL_SOURCES = {
    "gpt-4.1-mini": "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
    "gpt-4o-mini-tts": "https://developers.openai.com/api/docs/models/gpt-4o-mini-tts",
    "text-embedding-3-small": "https://developers.openai.com/api/docs/models/text-embedding-3-small",
}

BENCHMARKS = {
    "A": {"topic": "Three practical open-source tools for building RAG applications that let AI chatbots answer questions from your documents.",
          "duration_seconds": 60, "audience": "Developers evaluating practical document-question-answering stacks",
          "visual_intent": "Documents become chunks, vectors, retrieved context and grounded answers; repository identities are evidence-backed."},
    "B": {"topic": "How vector embeddings turn meaning into a map: words become coordinates, related ideas cluster, and semantic search retrieves useful context.",
          "duration_seconds": 30, "audience": "AI builders who know prompts but want an intuitive mental model for embeddings",
          "visual_intent": "A spatial meaning map forms, clusters move under camera, typography labels neighborhoods, and a query travels to its nearest context."},
}

EXPECTED_USAGE = {
    "A": [
        ("Research query planning", 1, 1000, 200), ("Audience and hook strategy", 3, 15000, 2600),
        ("Script generation", 1, 24000, 1200), ("Fact-check and claim verification", 4, 90000, 7000),
        ("Creative and art direction", 2, 24000, 2200), ("Semantic/object storyboarding", 4, 52000, 4800),
        ("Editorial shot direction", 1, 18000, 1800), ("Multimodal creative evaluation", 1, 50000, 1200),
    ],
    "B": [
        ("Research query planning", 1, 800, 150), ("Audience and hook strategy", 3, 10000, 2200),
        ("Script generation", 1, 16000, 800), ("Fact-check and claim verification", 4, 60000, 5200),
        ("Creative and art direction", 2, 18000, 1900), ("Semantic/object storyboarding", 3, 36000, 3600),
        ("Editorial shot direction", 1, 12000, 1400), ("Multimodal creative evaluation", 1, 40000, 1000),
    ],
}


def pricing_file(path: Path) -> dict[str, Any]:
    pricing = {"as_of": "2026-11-26", "source": PRICING_SOURCE, "models": {
        "gpt-4.1-mini": {"input_usd": "0.40", "output_usd": "1.60", "max_input": 150000, "max_output": 8000},
        "gpt-4o-mini-tts": {"input_usd": "0.60", "output_usd": "12.00", "max_input": 2000, "max_output": 1800},
        "text-embedding-3-small": {"input_usd": "0.02", "output_usd": "0", "max_input": 8192, "max_output": 0},
    }, "model_sources": MODEL_SOURCES,
       "notes": ["USD per one million tokens", "TTS output estimate assumes 20 audio tokens per second",
                 "gpt-4.1-mini and gpt-4o-mini-tts are deprecated but available for this final benchmark; no migration is introduced in Milestone 4"]}
    path.write_text(json.dumps(pricing, indent=2))
    return pricing


def _args(root: Path, pricing: Path, key: str) -> SimpleNamespace:
    spec = BENCHMARKS[key]
    return SimpleNamespace(
        pricing_file=str(pricing), topic=spec["topic"], workspace=str(root / "workspace"),
        output=str(root / ("benchmark_" + key.lower())), max_budget="10", approval=None, preflight=None,
        target_duration=spec["duration_seconds"], model="gpt-4.1-mini", content_only=False,
        resume=False, audience=spec["audience"], research_ttl=3600, corroboration=None,
        no_resource_cta=True, comment_keyword=None, voice="ash", spatial_preview=False,
        assets_root=None, product_manifest=None, sfx_manifest=None, approved_assets=None,
        creative_bible=True, music=None, display_font=None, body_font=None, browser_modules=None,
    )


def cost_report(root: Path, pricing_path: Path) -> dict[str, Any]:
    reports = {}
    for key, spec in BENCHMARKS.items():
        bound = preflight(_args(root, pricing_path, key))
        rows = []
        input_total = output_total = 0
        for stage, calls, inputs, outputs in EXPECTED_USAGE[key]:
            input_total += inputs; output_total += outputs
            usd = Decimal("0.40") * inputs / 1_000_000 + Decimal("1.60") * outputs / 1_000_000
            rows.append({"stage": stage, "calls": calls, "estimated_input_tokens": inputs,
                         "estimated_output_tokens": outputs, "estimated_usd": str(usd.quantize(Decimal("0.0001")))})
        seconds = spec["duration_seconds"]
        tts_input = 200 if key == "A" else 110
        tts_output = seconds * 20
        tts_usd = Decimal("0.60") * tts_input / 1_000_000 + Decimal("12") * tts_output / 1_000_000
        embedding_tokens = 12000 if key == "A" else 8000
        embedding_usd = Decimal("0.02") * embedding_tokens / 1_000_000
        expected = sum(Decimal(row["estimated_usd"]) for row in rows) + tts_usd + embedding_usd
        reports[key] = {"benchmark": spec, "itemized_llm": rows,
            "estimated_llm_input_tokens": input_total, "estimated_llm_output_tokens": output_total,
            "tts": {"calls_expected": 1, "calls_maximum": 3, "estimated_input_tokens": tts_input,
                    "estimated_audio_output_tokens": tts_output, "estimated_seconds": seconds,
                    "estimated_usd": str(tts_usd.quantize(Decimal("0.0001")))},
            "embeddings": {"calls_expected": 1, "calls_maximum": 8, "estimated_input_tokens": embedding_tokens,
                           "estimated_usd": str(embedding_usd.quantize(Decimal("0.0001")))},
            "evaluator_optimizer": {"deterministic_paid_calls": 0, "maximum_revisions": 2,
                                    "maximum_transient_retries_per_stage": 1,
                                    "multimodal_review_calls_expected": 1},
            "additional_generation_services": {"paid_image_calls": 0, "paid_video_calls": 0,
                "github_api": "credential-free/free subject to rate limits", "alignment": "local faster-whisper CPU",
                "rendering": "local HyperFrames and FFmpeg"},
            "expected_local_render_seconds": [3 * seconds, 20 * seconds], "expected_maximum_memory_bytes": 2_147_483_648,
            "estimated_expected_usd": str(expected.quantize(Decimal("0.01"))),
            "enforced_maximum_usd": bound["maximum_estimated_usd"], "recommended_approved_spend_usd": "10.00",
            "budget_enforcement": bound, "cache_reuse": {
                "reusable": ["local renderer dependencies", "validated model files", "approved asset manifests when topic-relevant and digest-valid"],
                "not_reusable": ["research snapshots for a different topic", "scripts, narration or alignments from fixtures", "creative evaluations from other videos"],
                "freshness": "Research cache may be reused only when topic fingerprint matches and age is within 3600 seconds"}}
    combined_expected = sum(Decimal(reports[key]["estimated_expected_usd"]) for key in reports)
    combined_max = sum(Decimal(reports[key]["enforced_maximum_usd"]) for key in reports)
    return {"pricing_as_of": "2026-11-26", "pricing_source": PRICING_SOURCE, "benchmarks": reports,
            "combined": {"estimated_expected_usd": str(combined_expected.quantize(Decimal("0.01"))),
                         "enforced_maximum_usd": str(combined_max), "recommended_approved_spend_usd": "20.00"},
            "approval": "No paid call is authorized by this report. Explicit approval of both bound configurations and USD 20.00 combined maximum is required."}


def capability_matrix(root: Path) -> dict[str, Any]:
    common = ["Milestone 1 73-test source/evidence", "Milestone 2 encoded fixture suite", "Milestone 3 evaluator-optimizer evidence"]
    rows = []
    for department, capabilities in RUBRIC.items():
        for name, criteria in capabilities.items():
            creative = criteria[3]
            rows.append({"department": department, "capability": name,
                "existing_evidence": common if department in ("B", "C", "D") else [common[0]] if department == "A" else common[1:],
                "evidence_already_verified": "Offline regression and preserved fixture evidence; not final benchmark acceptance",
                "missing_evidence": ["Benchmark A complete ordered run", "Benchmark B complete ordered run"] + (["Independent named creative reviewer decision"] if creative else []),
                "required_benchmark_checks": criteria[0], "required_creative_evaluation": criteria[1] if creative else "Not a mandatory creative-output row",
                "required_additional_deterministic_fixtures": "None pre-authorized; add only a minimal regression if an end-to-end benchmark exposes a reproducible defect",
                "repeatability_and_failure_check": criteria[2],
                "current_verification_status": "benchmark_and_independent_review_pending" if creative else "benchmark_verification_pending",
                "score": None})
    assert len(rows) == 38
    return {"rubric": {"behavior_and_correctness": 50, "output_quality": 30, "repeatability_and_failure_handling": 20},
            "commit": COMMIT, "capability_count": len(rows), "final_gate": "blocked_pending_benchmarks_and_review",
            "scores_assigned": False, "capabilities": rows}


def production_audit() -> dict[str, Any]:
    integrated = ["research and corroboration", "audience and hook strategy", "verified script", "duration and paid budget",
                  "creative bible", "semantic storytelling", "actual spatial object storyboard", "approved media selection",
                  "camera, lighting, transitions, VFX, typography and captions", "word-aligned narration", "music and SFX",
                  "mixing and mastering", "encoded QA", "best-candidate retention", "human publication gate"]
    corrected = [
        {"gap": "Normal renderer did not persist its actual object storyboard", "correction": "Normal creative-bible runs now write shot_storyboard.json from the actual spatial timeline"},
        {"gap": "Milestone 3 evaluator-optimizer was benchmark-only", "correction": "Normal run now sends the final encoded review.mp4 through a bounded final-quality optimizer; only safe audio remastering is automatic and visual defects fail closed"},
        {"gap": "Hosted encoded-video tests lacked FFmpeg", "correction": "Workflow installs FFmpeg before running the full suite"},
        {"gap": "TTS pricing contract mixed token and character limits", "correction": "Budget accepts the documented 2,000-token bound and separately enforces the 4,096-character API limit"},
        {"gap": "Editorial browser defect codes were not all consumed by encoded QA", "correction": "Caption, overlap, asset, empty-scene and browser failures are mapped into the final evaluation contract"},
    ]
    return {"entry_point": "run_faceless.py", "commit": COMMIT, "integrated_capabilities": integrated,
            "offline_integration_corrections": corrected,
            "disconnected_nonproduction_paths": ["run_benchmark.py legacy benchmark", "run_benchmark_v2.py isolated V2", "run_benchmark_v3.py isolated V3", "creative_lab/milestone*_benchmark.py fixture runners"],
            "normal_order": ["preflight and explicit approval", "research", "audience/hooks", "verified script", "TTS and word alignment",
                             "semantic/creative/art direction", "approved media and spatial storyboard", "render/mix/master",
                             "browser and encoded QA", "bounded final optimizer", "38-capability evidence", "human publication approval"],
            "limitations": ["Dynamic independent source discovery beyond curated manifests", "Actual spoken narration quality",
                "Full-length duration validation", "Creative music suitability", "Actual audiovisual synchronization",
                "Independent creative acceptance", "Safe partial-render integration", "Final 38-capability acceptance"]}


def _copy(source: Path, target: Path) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    return str(target)


def review_packages(repo: Path, output: Path) -> dict[str, Any]:
    m2 = repo / "data/renders/jack_milestone_2_evidence_20261125"
    m3 = repo / "data/renders/jack_milestone_3_evidence_20261126_run3"
    packages = {"milestone_2": [], "milestone_3": []}
    summary2 = json.loads((m2 / "benchmark_summary.json").read_text())
    for item in summary2["fixtures"]:
        name = item["fixture"]; src = m2 / name; dst = output / "milestone_2" / name
        contact = _copy(src / "contact-sheet.png", dst / "contact-sheet.png")
        browser = json.loads((src / "browser_qa.json").read_text())
        samples = []
        for sample in browser["samples"][:3]:
            copied = _copy(src / sample["screenshot"], dst / sample["screenshot"])
            samples.append({"scene": sample["scene"], "seconds": sample["seconds"], "image": copied})
        plan = json.loads((m2 / "inputs" / name / "object_storyboard.json").read_text())
        packages["milestone_2"].append({"fixture": name, "contact_sheet": contact, "timecoded_samples": samples,
            "scene_descriptions": [{"title": scene["title"],
                                    "intent": scene.get("intent") or f"{scene['camera']} camera; {scene['lighting']} lighting",
                                    "spoken_text": scene["spoken_text"]} for scene in plan["sequences"]],
            "qa": {"clean_browser_defects": item["clean_browser_defects"], "camera_continuity": item["camera_continuity"], "temporal": item["temporal_qa"]},
            "limitations": summary2["limitations"]})
    summary3 = json.loads((m3 / "milestone3_summary.json").read_text())
    for item in summary3["fixtures"]:
        if item["fixture"] == "audio_mastering":
            packages["milestone_3"].append(item)
            continue
        name = item["fixture"]; src = m3 / name; dst = output / "milestone_3" / name
        before = _copy(src / "before-contact-sheet.png", dst / "before-contact-sheet.png")
        after = _copy(src / "after-contact-sheet.png", dst / "after-contact-sheet.png")
        browser = json.loads((src / "attempt_001/render/browser_qa.json").read_text())
        samples = []
        for sample in browser["samples"][:3]:
            image = src / "attempt_001/render" / sample["screenshot"]
            samples.append({"scene": sample["scene"], "seconds": sample["seconds"], "image": _copy(image, dst / sample["screenshot"])})
        plan = json.loads((src / "attempt_001/candidate_plan.json").read_text())
        packages["milestone_3"].append({"fixture": name, "before_contact_sheet": before, "after_contact_sheet": after,
            "timecoded_after_samples": samples, "scene_descriptions": [{"title": scene["title"],
                "intent": scene.get("intent") or f"{scene['camera']} camera; {scene['lighting']} lighting",
                "spoken_text": scene["spoken_text"]} for scene in plan["sequences"]],
            "before_findings": item["before_categories"], "after_findings": item["after_categories"], "repairs": item["repairs"],
            "limitations": summary3["limitations"]})
    portable = json.loads(json.dumps(packages).replace(str(output), "."))
    (output / "review_package_manifest.json").write_text(json.dumps(portable, indent=2))
    return portable


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo, output = args.repo.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    pricing = output / "pricing-openai-2026-11-26.json"
    pricing_file(pricing)
    artifacts = {"production_path_audit": production_audit(), "benchmark_execution_plans": BENCHMARKS,
                 "paid_execution_estimate": cost_report(output, pricing), "capability_readiness": capability_matrix(output)}
    review_packages(repo, output / "review_packages")
    for name, value in artifacts.items():
        (output / (name + ".json")).write_text(json.dumps(value, indent=2))
    matrix_lines = ["# JACK 38-Capability Evidence Readiness", "",
        "No final scores are assigned. Every row remains blocked until both end-to-end benchmarks complete; creative rows also require independent review.", "",
        "| Department | Capability | Current status | Required output-quality evidence |", "|---|---|---|---|"]
    for row in artifacts["capability_readiness"]["capabilities"]:
        matrix_lines.append(f"| {row['department']} | {row['capability']} | {row['current_verification_status']} | {row['required_creative_evaluation']} |")
    (output / "capability_readiness.md").write_text("\n".join(matrix_lines) + "\n")
    review_lines = ["# Independent Creative Review Packages", "",
        "These packages contain copied review aids only; the original evidence directories remain unchanged.",
        "Reviewers should assess creative quality directly and must not treat deterministic QA as a creative score.", "",
        "- `milestone_2/`: five encoded creative fixtures, contact sheets and timecoded frame samples.",
        "- `milestone_3/`: five before/after repair comparisons plus audio-mastering measurements.",
        "- `review_package_manifest.json`: scene descriptions, timestamps, QA measurements, repairs and known limitations.", "",
        "Required reviewer output: named reviewer, each video viewed end-to-end, timecoded findings, pass/fail/needs-revision decision, and no unsupported numeric score."]
    (output / "review_packages" / "README.md").write_text("\n".join(review_lines) + "\n")
    print(output)


if __name__ == "__main__":
    main()
