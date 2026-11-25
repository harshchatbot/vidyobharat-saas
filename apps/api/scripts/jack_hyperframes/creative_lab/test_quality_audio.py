import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from quality_policy import evaluate,GROUPS
from storyboard_audio import schedule
class QualityTests(unittest.TestCase):
    def evidence(self):
        return {n:dict(version=1,run_id="fixture",commit="fixture",benchmarks=["A","B"],
                       checks={k:dict(result="pass",artifact="fixture",reviewer="synthetic test fixture",
                                      disputed=False,fallback=False) for k in ("behavior","output","repeatability")})
                for names in GROUPS.values() for n in names}
    def test_complete(self):
        r=evaluate(self.evidence())
        self.assertEqual(len(r["capabilities"]),38)
        self.assertEqual(r["gate"],"pass")
        self.assertFalse(r["publish_authorized"])
    def test_single_low(self):
        e=self.evidence();e["music"]["checks"]["output"]["result"]="partial"
        self.assertEqual(evaluate(e)["gate"],"blocked")
    def test_creative_fallback_and_unresolved_review(self):
        for key,value in (("fallback",True),("disputed",True),("reviewer","")):
            e=self.evidence();e["music"]["checks"]["output"][key]=value
            row=next(x for x in evaluate(e)["capabilities"] if x["capability"]=="music")
            self.assertEqual(row["status"],"unverified")
    def test_missing(self):
        e=self.evidence();del e["music"]
        self.assertEqual(evaluate(e)["gate"],"blocked")
    def test_malformed(self):
        for value in (None,[],{"music":None},{"music":{"score":float("nan"),"verified":True,"evidence":"fixture"}}):
            self.assertEqual(evaluate(value)["gate"],"blocked")
class AudioTests(unittest.TestCase):
    def test_spacing_and_cap(self):
        p=dict(total_frames=400,objects=[dict(id="a",tracks=[dict(action="reveal",start_frame=f) for f in (0,10,45,90,135,400)])])
        self.assertEqual([c["frame"] for c in schedule(p)],[0,45,90])
    def test_semantic_and_bounds(self):
        p=dict(total_frames=100,objects=[dict(id="a",tracks=[dict(action=a,start_frame=f) for a,f in (("unlock",0),("hold",45),("assemble",50),("move",100),("rotate",-1))])])
        self.assertEqual([c["sfx"] for c in schedule(p)],["interface_click","soft_impact"])
if __name__=="__main__": unittest.main()
