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
if __name__=="__main__":unittest.main()
