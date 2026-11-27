import copy
import unittest
from semantic_storytelling import validate_story, script_beats, plan

class StoryTests(unittest.TestCase):
    def setUp(self):
        self.beats={"beat_00":{"text":"Documents become chunks.","source_ids":[1]},"beat_01":{"text":"Chunks become vectors.","source_ids":[1]}}
        self.sources=[{"id":1},{"id":2}]
        base=dict(meaning="meaning",viewer_takeaway="takeaway",anchor_quote="Documents",mode="conceptual_diagram",subject="document",action="split",before_state="whole",after_state="parts",continuity="same object",evidence_ids=[1],asset_requirement="none",fallback="diagram",object_id="document",carry_from="none",secondary_subject="none",supporting_text="Split documents",transition="cut",motion="signal")
        self.story={"beat_00":base,"beat_01":dict(base,anchor_quote="Chunks",carry_from="document")}
    def check(self):
        return validate_story(self.story,self.beats,self.sources)
    def test_valid(self):
        self.check()
    def test_missing_beat(self):
        del self.story["beat_01"]
        with self.assertRaises(ValueError): self.check()
    def test_wrong_anchor(self):
        self.story["beat_00"]["anchor_quote"]="Vectors"
        with self.assertRaises(ValueError): self.check()
    def test_cross_source(self):
        self.story["beat_00"]["evidence_ids"]=[2]
        with self.assertRaises(ValueError): self.check()
    def test_invalid_continuity(self):
        self.story["beat_01"]["object_id"]="different"
        with self.assertRaises(ValueError): self.check()
    def test_unsupported_transition(self):
        self.story["beat_01"]["transition"]="magic_morph"
        with self.assertRaises(ValueError): self.check()
    def test_product_requires_asset(self):
        self.story["beat_00"]["mode"]="product_demo"
        with self.assertRaises(ValueError): self.check()
    def test_sentence_split(self):
        self.assertEqual(len(script_beats([{"text":"A question? An answer.","source_ids":[1]}])),2)
    def test_plan_mock(self):
        def structured(client,prompt,data,schema,check):
            result=copy.deepcopy(self.story)
            check(result)
            return result
        result=plan(None,structured,self.beats,self.sources)
        self.assertEqual(result["beat_00"]["renderer_hint"]["template"],"hero_title")
        self.assertFalse(result["beat_01"]["renderer_hint"]["persistent_objects_executed"])

if __name__=="__main__":
    unittest.main()
