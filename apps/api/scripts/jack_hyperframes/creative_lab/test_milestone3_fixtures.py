import unittest

from compile_motion import compile_motion
from milestone3_fixtures import rendered_repair_fixtures, safety_fixture_manifest


class MilestoneThreeFixtureTests(unittest.TestCase):
    def test_ten_required_fixture_classes_exist(self):
        names = set(rendered_repair_fixtures()) | set(safety_fixture_manifest())
        self.assertEqual(len(names), 10)
        self.assertEqual(names, {"camera_discontinuity", "caption_safe_area", "subject_framing",
                                 "lighting_exposure", "transition_flash", "audio_mastering",
                                 "locked_scene_protection", "invalid_repair_rejection",
                                 "failed_repair_rollback", "retry_exhaustion"})

    def test_all_rendered_negative_plans_compile(self):
        for name, fixture in rendered_repair_fixtures().items():
            with self.subTest(name=name):
                compiled = compile_motion(fixture["plan"])
                self.assertEqual(compiled["render_options"], fixture["plan"]["render_options"])

    def test_fixture_generation_is_deterministic(self):
        self.assertEqual(rendered_repair_fixtures(), rendered_repair_fixtures())


if __name__ == "__main__": unittest.main()
