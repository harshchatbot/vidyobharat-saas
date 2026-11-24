import tempfile, unittest
from pathlib import Path
from cinematography import compile_camera, sample_camera
from creative_assets import catalog, direct_audio
from spatial_timeline import compile_spatial

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
    def test_unkeyed_assets_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ("greenscreen/clock.mp4","overlays/green-screen-fire.mp4","broll/demo.mp4"):
                p=Path(d)/name
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_bytes(b"fixture")
            self.assertEqual(set(catalog(d)),{"broll/demo.mp4"})

    def test_editorial_audio_spacing(self):
        plan={"shots":[{"events":[{"frame":f,"sfx":k} for f,k in [(0,"soft_impact"),(30,"digital_ping"),(90,"meme.wav"),(120,"digital_ping")]]}]}
        self.assertIsNone(direct_audio(None,plan,{},"test"))
        self.assertEqual([e["sfx"] for e in plan["shots"][0]["events"]],["soft_impact","none","none","digital_ping"])

    def test_workflow_layout(self):
        shot={"start_frame":0,"end_frame":180,"template":"workflow","headline":"Process","items":["Input","Output"],"motion_graphic":"none"}
        ir=compile_spatial({"shots":[shot]},[],180)
        nodes=[o for o in ir["objects"] if o["kind"]=="panel"]
        self.assertEqual(len(nodes),2)
        self.assertEqual(nodes[0]["position"][0],nodes[1]["position"][0])
        self.assertNotEqual(nodes[0]["position"][1],nodes[1]["position"][1])

    def test_invalid_camera(self):
        with self.assertRaises(ValueError):
            compile_camera([],[],1)

if __name__=="__main__": unittest.main()
