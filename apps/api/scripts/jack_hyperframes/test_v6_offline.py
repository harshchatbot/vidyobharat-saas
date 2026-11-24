import tempfile, unittest
from pathlib import Path
from cinematography import compile_camera, sample_camera
from creative_assets import catalog

class V6Tests(unittest.TestCase):
    def test_camera(self):
        objects=[{"id":"a","position":[0,0,0]}]
        beats=[{"frame":0,"target":"a","intent":"explain"},{"frame":30,"target":"a","intent":"explain"}]
        keys=compile_camera(objects,beats,60)
        self.assertEqual(keys[-1]["frame"],59)
        self.assertNotEqual(keys[0]["position"],keys[1]["position"])
        self.assertEqual(sample_camera(keys,15),sample_camera(keys,15))
    def test_curated_catalog_no_sidecar(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"sfx"/"impact.wav"
            p.parent.mkdir()
            p.write_bytes(b"fixture")
            self.assertIn("sfx/impact.wav",catalog(d))
    def test_invalid_camera(self):
        with self.assertRaises(ValueError):
            compile_camera([],[],1)

if __name__=="__main__": unittest.main()
