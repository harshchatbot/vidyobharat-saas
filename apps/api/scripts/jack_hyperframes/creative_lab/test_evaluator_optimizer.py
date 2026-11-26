import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from automatic_corrections import RepairBlockedError, apply_repairs, propose_repairs
from evaluation_contracts import (EvaluationContractError, artifact_record, defect,
                                  defect_cost, evaluation, validate_evaluation)
from milestone2_fixtures import fixtures
from producer import optimize
from rendered_video_evaluator import evaluate_video
from revision_contracts import RevisionContractError, assert_invariants, operation


class ContractTests(unittest.TestCase):
    def evidence(self, root):
        path = Path(root) / "evidence.txt"; path.write_text("evidence"); return path

    def test_stable_defect_and_real_evidence(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.evidence(root)
            kwargs = dict(category="transition_flash", severity="high", evidence=[artifact_record(path)],
                          reproduction={"frame": 3}, confidence=.9, verification_method="deterministic",
                          capability="transitions", suggested_correction={"operation": "set_transition"},
                          scene=0, timecode_seconds=1.2)
            self.assertEqual(defect(**kwargs)["id"], defect(**kwargs)["id"])

    def test_missing_evidence_rejected(self):
        with self.assertRaises(EvaluationContractError):
            defect(category="x", severity="high", evidence=[{"path": "/missing"}], reproduction={},
                   confidence=1, verification_method="deterministic", capability="qa", suggested_correction=None)

    def test_evaluation_never_authorizes_publication(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.evidence(root)
            report = evaluation(run_id="r", attempt_id="a", commit="c", config={}, video=path,
                                defects=[], measurements={}, limitations=[])
            validate_evaluation(report)
            self.assertFalse(report["publish_authorized"])
            self.assertEqual(report["creative_status"], "human_review_required")

    def test_cost_is_severity_aware(self):
        self.assertGreater(defect_cost({"defects": [{"severity": "high"}]}),
                           defect_cost({"defects": [{"severity": "medium"}, {"severity": "low"}]}))


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.plan = copy.deepcopy(fixtures()["camera_continuity"])

    def finding(self, category, scene=0, severity="high", **reproduction):
        return {"id": "d-" + category, "category": category, "scene": scene,
                "severity": severity, "reproduction": reproduction, "before_after": {}}

    def test_camera_repair_is_targeted(self):
        operations = propose_repairs(self.plan, [self.finding("camera_discontinuity")])
        updated, applied = apply_repairs(self.plan, operations)
        self.assertEqual(updated["sequences"][0]["camera"], "track")
        self.assertEqual(updated["sequences"][1], self.plan["sequences"][1])
        self.assertTrue(applied[0]["changes"])

    def test_caption_repair_uses_render_options(self):
        operations = propose_repairs(self.plan, [self.finding("text_overflow")])
        updated, _ = apply_repairs(self.plan, operations)
        self.assertEqual(updated["render_options"]["caption_left"], 90)

    def test_lighting_and_transition_repairs(self):
        operations = propose_repairs(self.plan, [self.finding("exposure"), self.finding("transition_flash")])
        updated, _ = apply_repairs(self.plan, operations)
        self.assertIn("key fill rim", updated["sequences"][0]["lighting"])
        self.assertEqual(updated["sequences"][0]["transition"], "continuous")
        self.assertFalse(updated["render_options"]["transition_flash"])

    def test_audio_repair_is_bounded(self):
        finding = self.finding("audio_loudness", scene=None)
        finding["before_after"] = {"before": {"integrated_lufs": -24}}
        updated, _ = apply_repairs(self.plan, propose_repairs(self.plan, [finding]))
        self.assertEqual(updated["render_options"]["audio_gain_db"], 10)

    def test_locked_scene_blocks_repair(self):
        self.plan["sequences"][0]["locked"] = True
        with self.assertRaises(RepairBlockedError):
            propose_repairs(self.plan, [self.finding("camera_discontinuity")])

    def test_missing_asset_requires_approved_file(self):
        with self.assertRaises(RepairBlockedError):
            propose_repairs(self.plan, [self.finding("missing_asset", approved_path="/missing")])

    def test_invalid_operation_rejected(self):
        with self.assertRaises(RevisionContractError):
            operation(defect_id="d", operation_type="set_camera", scene=0,
                      parameters={"camera": "teleport"}, reason="invalid")

    def test_immutable_script_change_rejected(self):
        changed = copy.deepcopy(self.plan); changed["sequences"][0]["spoken_text"] = "rewritten"
        with self.assertRaises(RevisionContractError): assert_invariants(self.plan, changed)


class EncodedEvaluatorTests(unittest.TestCase):
    def make_video(self, root, color="black", duration=1):
        video = Path(root) / "fixture.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        f"color=c={color}:s=1080x1920:r=30:d={duration}", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)], check=True)
        return video

    def test_black_video_detected_from_encoded_pixels(self):
        with tempfile.TemporaryDirectory() as root:
            video = self.make_video(root)
            report = evaluate_video(video, Path(root) / "qa", run_id="r", attempt_id="a", commit="c")
            self.assertIn("blank_black_frames", {item["category"] for item in report["defects"]})
            self.assertGreater(report["measurements"]["sampled_frames"], 0)

    def test_intentional_dark_range_not_blank_failure(self):
        with tempfile.TemporaryDirectory() as root:
            video = self.make_video(root)
            report = evaluate_video(video, Path(root) / "qa", run_id="r", attempt_id="a", commit="c",
                                    config={"intentional_dark_ranges": [[0, 2]], "intentional_hold_ranges": [[0, 2]]})
            categories = {item["category"] for item in report["defects"]}
            self.assertNotIn("blank_black_frames", categories)
            self.assertNotIn("unexpected_static", categories)

    def test_duration_mismatch(self):
        with tempfile.TemporaryDirectory() as root:
            video = self.make_video(root)
            report = evaluate_video(video, Path(root) / "qa", run_id="r", attempt_id="a", commit="c",
                                    config={"expected_duration_seconds": 2})
            self.assertIn("duration_mismatch", {item["category"] for item in report["defects"]})


class ClosedLoopTests(unittest.TestCase):
    def report(self, video, attempt, category=None, severity="high"):
        findings = []
        if category:
            findings.append(defect(category=category, severity=severity, evidence=[artifact_record(video)],
                                   reproduction={}, confidence=1, verification_method="deterministic",
                                   capability="qa", suggested_correction={"operation": "set_transition"}, scene=0))
        return evaluation(run_id="run", attempt_id=attempt, commit="commit", config={}, video=video,
                          defects=findings, measurements={}, limitations=[])

    def callbacks(self, fail_second=False):
        def render(plan, output, scope):
            video = output / "review.mp4"; video.write_bytes(b"encoded-" + json.dumps(plan, sort_keys=True).encode()); return video
        def evaluate_cb(video, output, plan, attempt):
            defective = plan.get("render_options", {}).get("transition_flash") is True
            if fail_second and not defective:
                return self.report(video, attempt, "decode_failure", "critical")
            return self.report(video, attempt, "transition_flash" if defective else None)
        return render, evaluate_cb

    def test_complete_loop_and_resume(self):
        with tempfile.TemporaryDirectory() as root:
            plan = copy.deepcopy(fixtures()["camera_continuity"]); plan["render_options"] = {"transition_flash": True}
            render, evaluate_cb = self.callbacks()
            result = optimize(plan, render, evaluate_cb, propose_repairs, apply_repairs, lambda value: None,
                              Path(root) / "run", max_revisions=2)
            self.assertEqual(result["status"], "final_awaiting_approval")
            self.assertEqual(len(result["history"]), 2)
            self.assertTrue(result["history"][0]["repairs"])
            resolved = result["history"][1]["resolved_defects"]
            self.assertEqual([item["category"] for item in resolved], ["transition_flash"])
            self.assertEqual(resolved[0]["actual_correction"]["operation"], "set_transition")
            self.assertFalse(resolved[0]["before_after"]["after"]["present"])
            self.assertEqual(optimize(plan, render, evaluate_cb, propose_repairs, apply_repairs,
                                      lambda value: None, Path(root) / "run"), result)

    def test_failed_repair_rolls_back_best(self):
        with tempfile.TemporaryDirectory() as root:
            plan = copy.deepcopy(fixtures()["camera_continuity"]); plan["render_options"] = {"transition_flash": True}
            render, evaluate_cb = self.callbacks(fail_second=True)
            result = optimize(plan, render, evaluate_cb, propose_repairs, apply_repairs, lambda value: None,
                              Path(root) / "run", max_revisions=2)
            self.assertEqual(result["reason"], "severe_regression")
            self.assertTrue(result["history"][1]["rollback"])
            self.assertEqual(result["best_attempt"], 0)

    def test_retry_exhaustion_terminates_safely(self):
        with tempfile.TemporaryDirectory() as root:
            def fail(*args): raise OSError("transient")
            result = optimize(fixtures()["camera_continuity"], fail, fail, lambda *a: [], lambda *a: a,
                              lambda value: None, Path(root) / "run", transient_retries=1)
            self.assertEqual(result["reason"], "transient_retry_exhausted")
            self.assertTrue(result["terminal"])
            self.assertTrue((Path(root) / "run" / "optimizer_state.json").exists())


if __name__ == "__main__": unittest.main()
