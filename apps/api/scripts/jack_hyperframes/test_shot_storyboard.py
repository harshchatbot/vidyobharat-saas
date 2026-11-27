import unittest
from shot_storyboard import compile_storyboard
class ShotTests(unittest.TestCase):
    def setUp(self):
        self.plan={"shots":[{"start_frame":0,"end_frame":60,"template":"hero_title"}]}
        self.spatial={"fps":30,"total_frames":60,"objects":[{"id":"shot_0","start":0,"end":60,"position":[0,0,0]}],"camera":[],"lighting":[]}
        self.words=[{"word":"AI","start":.5}]
        self.semantic={"beat_00":{"viewer_takeaway":"AI","action":"reveal","object_id":"ai","carry_from":"none","renderer_hint":{"template":"hero_title"}}}
    def compile(self):
        return compile_storyboard(self.plan,self.spatial,self.words,self.semantic,{})
    def test_timing(self):
        s=self.compile()["shots"][0]
        self.assertEqual(s["duration_seconds"],2)
        self.assertEqual(s["word_onsets"][0]["frame"],15)
    def test_invalid_bounds(self):
        self.plan["shots"][0]["end_frame"]=61
        with self.assertRaises(ValueError): self.compile()
    def test_missing_subject(self):
        self.spatial["objects"]=[]
        with self.assertRaises(ValueError): self.compile()
    def test_object_bounds(self):
        self.spatial["objects"][0]["end"]=61
        with self.assertRaises(ValueError): self.compile()
    def test_missing_semantic(self):
        self.semantic={}
        with self.assertRaises(ValueError): self.compile()
    def test_unverified_execution(self):
        self.assertFalse(self.compile()["shots"][0]["limitations"]["planned_action_verified"])
    def test_mapping_gap(self):
        self.semantic["beat_00"]["renderer_hint"]["template"]="workflow"
        self.assertTrue(self.compile()["shots"][0]["limitations"]["layout_differs_from_hint"])
if __name__=="__main__":
    unittest.main()
