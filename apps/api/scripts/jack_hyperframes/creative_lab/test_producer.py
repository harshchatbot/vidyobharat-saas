import unittest,tempfile
from pathlib import Path
from producer import iterate,gate,DIMENSIONS
def report(score):
    return {"scores":dict.fromkeys(DIMENSIONS,score),"defects":[]}
class ProducerTests(unittest.TestCase):
    def test_missing(self): self.assertFalse(gate({}))
    def test_minimum(self):
        self.assertTrue(gate(report(60)))
        self.assertFalse(gate(report(59)))
    def test_critical(self):
        r=report(90);r["defects"]=[{"severity":"critical"}]
        self.assertFalse(gate(r))
    def test_revision(self):
        with tempfile.TemporaryDirectory() as d:
            r=iterate(0,lambda p,o:p,lambda v,o,p:report(60 if p else 20),lambda p,r:p+1,lambda p:None,Path(d)/"run")
            self.assertEqual(r["status"],"visual_gate_pass")
            self.assertEqual(len(r["history"]),2)
            self.assertFalse(r["publish_authorized"])
    def test_budget(self):
        with tempfile.TemporaryDirectory() as d:
            r=iterate(0,lambda p,o:p,lambda v,o,p:report(20),lambda p,r:p+1,lambda p:None,Path(d)/"run",2)
            self.assertEqual(r["status"],"blocked")
            self.assertEqual(len(r["history"]),3)
    def test_malformed(self):
        for defects in ([None],[{}],[{"severity":"unknown"}]):
            r=report(90);r["defects"]=defects
            self.assertFalse(gate(r))
    def test_render_failure(self):
        with tempfile.TemporaryDirectory() as d:
            def fail(p,o): raise RuntimeError("render failed")
            out=Path(d)/"run"
            r=iterate(0,fail,lambda *a:report(90),lambda p,r:p,lambda p:None,out)
            self.assertEqual(r["failed_stage"],"render")
            self.assertFalse(r["publish_authorized"])
            self.assertTrue((out/"producer_report.json").exists())
    def test_mutating_revision(self):
        with tempfile.TemporaryDirectory() as d:
            original={"n":0}
            def revise(p,r):
                p["n"]+=1
                return p
            r=iterate(original,lambda p,o:p,lambda v,o,p:report(60 if p["n"] else 20),revise,lambda p:None,Path(d)/"run")
            self.assertEqual(r["status"],"visual_gate_pass")
            self.assertEqual(original,{"n":0})
if __name__=="__main__":unittest.main()
