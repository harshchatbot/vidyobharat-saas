"""Evaluate versioned checks and keep missing or disputed evidence unverified."""
import argparse
import json
from pathlib import Path

MINIMUM = 60
RUBRIC_VERSION = 1
WEIGHTS = {"behavior": 50, "output": 30, "repeatability": 20}
# All rows require each dimension. Output is independently mandatory.
# For technical capabilities it is measured; for creative capabilities it is reviewed.
RUBRIC = {
    "A": {
        "research": ("Dated, relevant provenance ledger", "Sources substantiate the topic", "Expired, corrupt and unavailable sources are rejected", False),
        "trend": ("Time-bounded observation and sample size", "No unsupported growth claims", "Stale and duplicate observations rejected", False),
        "virality": ("Candidate hooks and evidence-backed selection", "Specific opening delivers a payoff", "Both topics demonstrate distinct hooks", True),
        "fact_check": ("Claim-to-original-passage ledger", "No unsupported material claim", "False corroboration fixtures fail", False),
        "audience": ("Explicit audience and relevant examples", "Concrete pain point and useful payoff", "Both topics suit their distinct intended audience", True),
        "script": ("Canonical verified narration and duration", "Coherent spoken narrative and actionable takeaways", "Out-of-budget and unsupported revisions fail", True),
        "engagement": ("Timecoded narrative beats", "Clear progression, payoff and natural CTA", "Both topics sustain progression", True),
    },
    "B": {
        "executive_producer": ("Run scope, budget and approval tracked", "Production and handoff gates match actual run", "Injected approval and budget failures stop safely", False),
        "creative_direction": ("Creative bible translates to scene choices", "Coherent concept suits the topic", "Both topics use distinct creative directions", True),
        "art_direction": ("Palette, type and materials recorded", "Readable and cohesive styling across frames", "Continuity holds across both topics", True),
        "visual_storytelling": ("Narration beats map to visual intent", "Rendered imagery explains the idea without misleading", "Both topics use appropriate techniques", True),
        "storyboard": ("Every beat maps to a supported planned shot", "Rendered beats communicate the plan", "Unsupported actions and missing beats rejected", True),
        "creative_critic": ("Timecoded concrete and actionable defects", "Review identifies actual material creative deficiencies", "Known seeded material defects detected", True),
    },
    "C": {
        "cinematography": ("Camera cues execute at intended beats", "Purposeful framing without disruptive jumps", "Bounds and scene transitions sampled", True),
        "lighting": ("Lighting choices visible in rendered samples", "Subject separation and readable tonal range", "Consistent across changing scenes", True),
        "motion": ("Supported animation events execute", "Movement explains the beat smoothly", "Unsupported and failed actions detected", True),
        "geometry": ("Finite projected geometry and visible bounds", "Spatial objects remain readable", "Invalid and offscreen geometry fixtures fail", False),
        "vfx": ("Effect executes at planned time", "Effect adds clarity without flicker or obstruction", "Control and effect samples compared", True),
        "typography": ("Phone-size safe area and overflow checks", "Readable hierarchy and type treatment", "Clipped and oversized fixtures detected", True),
        "composition": ("Projected focal elements and boxes recorded", "Readable hierarchy without obscuring overlaps", "Injected collisions detected", True),
        "assets": ("Rights, digest and scene verified", "Relevant approved visual appears as represented", "Missing and rejected media safely handled", True),
        "transitions": ("Rendered boundary timing verified", "Cut or transition supports continuity", "Injected blanks and jumps detected", True),
        "color": ("Palette and grading verified in frame samples", "Coherent color and readable highlights and shadows", "Consistency across both topics", True),
        "captions": ("Rendered caption text and offsets measured", "Legible pacing and placement", "Injected clipping and timing drift detected", True),
    },
    "D": {
        "voice": ("Canonical words and alignment verified", "Natural, intelligible narration and pronunciation", "Revised script updates speech and alignment", True),
        "music": ("Approved instrumental and auditable rights", "Successful approved music adds suitable mood and energy", "Successful fixture and safe no-music fallback both demonstrated", True),
        "sound_design": ("Cues match rendered events", "Purposeful, audible, nonrepetitive sound", "Mistimed and excessive cues detected", True),
        "mixing": ("Stem and final-output levels measured", "Narration stays clear with smooth fades and balance", "Ducking and music-free branches exercised", True),
        "sync": ("Measured audio-to-render offsets", "Offsets meet stated per-event tolerances", "Injected shifted events rejected", False),
        "mastering": ("Final encode measured with FFmpeg", "Integrated loudness −14 ±1 LU and true peak ≤−1 dBTP", "Out-of-range final encodes detected", False),
    },
    "E": {
        "pipeline": ("Logs show stages and terminal status", "Run stops safely and preserves consistent artifacts", "Resume, fault and budget fixtures exercised", False),
        "rendering": ("Logged resource budget and complete decode", "Final video meets declared profile", "Both benchmark renders complete", False),
        "integration": ("Normal entry point executes complete ordered flow", "Artifacts agree on one run and produce decodable outputs", "Both topics execute without manual splicing", False),
        "technical_qa": ("Probe and decode inspect final streams", "Codec, dimensions, rate and duration verified", "Corrupt files are rejected", False),
        "visual_qa": ("Browser and screenshot evidence covers actual states", "Material visible defects correctly reported", "Seeded loading, bounds and collision defects caught", False),
        "temporal_qa": ("Rendered boundary and frame analysis", "Unexpected freezes, flicker and black frames detected", "Intentional holds retained", False),
        "audio_qa": ("Final loudness, peak, silence and cue analysis", "Technical measurements and listening establish accepted mix", "Injected audio defects detected", True),
        "revision": ("History links defects and targeted corrections", "Corrected artifacts improve the observed defects", "Retry bounds and best valid attempt preserved", False),
    },
}
GROUPS = {group: list(items) for group, items in RUBRIC.items()}


def evaluate(evidence):
    evidence = evidence if isinstance(evidence,dict) else {}
    rows = []
    for department, capabilities in RUBRIC.items():
        for name, criteria in capabilities.items():
            item = evidence.get(name)
            item = item if isinstance(item,dict) else {}
            submitted = item.get("checks")
            checks = {}
            for criterion, description in zip(WEIGHTS, criteria[:3]):
                record = submitted.get(criterion) if isinstance(submitted,dict) else None
                if not isinstance(record,dict):
                    record = {}
                result = record.get("result")
                if not record.get("artifact") or result not in ("fail","partial","pass"):
                    result = None
                if criterion == "output" and criteria[3] and (
                    not isinstance(record.get("reviewer"),str) or not record["reviewer"].strip()
                    or record.get("disputed") is not False or record.get("fallback") is not False
                ):
                    result = None
                checks[criterion] = dict(weight=WEIGHTS[criterion], criterion=description, result=result,
                                         artifact=record.get("artifact"), reviewer=record.get("reviewer"))
            results = {key:value["result"] for key,value in checks.items()}
            verified = (item.get("version")==RUBRIC_VERSION and bool(item.get("run_id")) and bool(item.get("commit"))
                        and isinstance(item.get("benchmarks"),list) and sorted(map(str,item["benchmarks"]))==["A","B"] and all(results.values()))
            score = sum(WEIGHTS[key]*{"pass":1,"partial":.5,"fail":0}[result] for key,result in results.items()) if verified else None
            status = "unverified" if not verified else "pass" if results["output"]=="pass" and "fail" not in results.values() and score>=MINIMUM else "fail"
            rows.append(dict(department=department,capability=name,score=score,status=status,checks=checks,
                             evidence_flags=item.get("evidence_flags",{})))
    return dict(minimum=MINIMUM, rubric_version=RUBRIC_VERSION, capabilities=rows,
                gate="pass" if all(row["status"]=="pass" for row in rows) else "blocked",publish_authorized=False)


if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("evidence",type=Path)
    args=parser.parse_args()
    report=evaluate(json.loads(args.evidence.read_text()))
    print(json.dumps(report,indent=2))
    raise SystemExit(0 if report["gate"]=="pass" else 1)
