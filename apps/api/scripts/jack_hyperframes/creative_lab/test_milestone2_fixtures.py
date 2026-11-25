import unittest

from compile_motion import compile_motion, sample_camera
from milestone2_fixtures import fixtures


class MilestoneTwoFixtureTests(unittest.TestCase):
    def test_all_fixtures_compile_deterministically(self):
        for name, fixture in fixtures().items():
            with self.subTest(name=name):
                self.assertEqual(compile_motion(fixture), compile_motion(fixture))

    def test_fixtures_cover_required_creative_modes(self):
        kinds = {item["kind"] for fixture in fixtures().values() for item in fixture["objects"]}
        actions = {action["action"] for fixture in fixtures().values()
                   for scene in fixture["sequences"] for action in scene["actions"]}
        self.assertTrue({"pipeline", "product", "particle_field", "document", "chart", "model"} <= kinds)
        self.assertTrue({"assemble", "data_flow", "path", "explode", "reassemble",
                         "dissolve", "stagger", "transform", "rotate"} <= actions)

    def test_compiled_tracks_declare_renderer_execution(self):
        for fixture in fixtures().values():
            compiled = compile_motion(fixture)
            self.assertTrue(all(track["execution"] == "renderer_v3"
                                for item in compiled["objects"] for track in item["tracks"]))

    def test_camera_samples_are_finite_and_bounded(self):
        for fixture in fixtures().values():
            compiled = compile_motion(fixture)
            for frame in range(compiled["total_frames"]):
                sample = sample_camera(compiled["camera"], frame)
                self.assertTrue(all(abs(value) < 20 for value in sample["position"] + sample["look_at"]))

    def test_fixture_contract_is_vertical_short_form(self):
        for fixture in fixtures().values():
            self.assertEqual(fixture["fps"], 30)
            self.assertLessEqual(fixture["total_frames"], 240)
            self.assertEqual(fixture["sequences"][0]["start_frame"], 0)
            self.assertEqual(fixture["sequences"][-1]["end_frame"], fixture["total_frames"])


if __name__ == "__main__":
    unittest.main()
