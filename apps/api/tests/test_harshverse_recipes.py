from __future__ import annotations

import unittest
from app.services.harshverse.scene_plan import Scene, ScenePlan, demo_plan
from app.services.harshverse.render_adapter import build_filter


class HarshVerseRecipeTests(unittest.TestCase):
    def test_demo_plan_has_valid_bounds(self):
        plan = demo_plan(15.73, asset_duration=10)
        plan.validate(asset_duration=10)
        self.assertEqual(plan.scenes[0].recipe, 'presenter_hook')
        self.assertEqual(plan.scenes[-1].recipe, 'presenter_outro')

    def test_rejects_gaps(self):
        plan = ScenePlan(5, (Scene('presenter_hook', 0, 2), Scene('presenter_outro', 3, 5)))
        with self.assertRaisesRegex(ValueError, 'gap/overlap'):
            plan.validate()

    def test_rejects_short_asset(self):
        plan = ScenePlan(5, (Scene('presenter_hook', 0, 2), Scene('animated_explainer', 2, 5)))
        with self.assertRaisesRegex(ValueError, 'asset too short'):
            plan.validate(asset_duration=2)

    def test_keeps_original_audio_outside_video_filter(self):
        graph = build_filter(demo_plan(15.73, asset_duration=10))
        self.assertIn('concat=n=4:v=1:a=0', graph)
        self.assertNotIn('amix', graph)


if __name__ == '__main__':
    unittest.main()
