import unittest
from compile_motion import compile_motion,preview,diagnostics
from capabilities import validate_action
def fixture():
    def action(oid,start,end):
        return dict(object_id=oid,action="reveal",start_frame=start,end_frame=end,from_position=[0,0,0],to_position=[0,0,0],from_scale=1,to_scale=1,from_opacity=0,to_opacity=1)
    def scene(oid,start,end):
        return dict(title=oid,spoken_text=oid,start_frame=start,end_frame=end,camera="static",transition="cut",lighting="studio",actions=[action(oid,start,end)])
    return dict(fps=30,total_frames=300,background="#101b2c",objects=[dict(id=i,kind="document",label=i,color="#ffffff") for i in ("a","b")],sequences=[scene("a",0,150),scene("b",150,300)])
class MotionTests(unittest.TestCase):
    def test_visibility(self):
        p=compile_motion(fixture())
        self.assertEqual([s["active_ids"] for s in p["scenes"]],[["a"],["b"]])
    def test_preview(self):
        p=compile_motion(fixture());q=preview(p,6)
        self.assertEqual(q["total_frames"],180)
        self.assertEqual(q["scenes"][-1]["end_frame"],180)
        self.assertEqual(p["total_frames"],300)
    def test_gap(self):
        p=fixture();p["sequences"][1]["start_frame"]=151
        with self.assertRaises(ValueError):compile_motion(p)
    def test_capabilities(self):
        validate_action("key","unlock")
        with self.assertRaises(ValueError):validate_action("document","unlock")
        with self.assertRaises(ValueError):validate_action("document","fly")
    def test_diagnostics(self):
        self.assertEqual(len(diagnostics(compile_motion(fixture()))["findings"]),2)
    def test_duplicate(self):
        p=fixture();p["objects"].append(p["objects"][0])
        with self.assertRaises(ValueError):compile_motion(p)
if __name__=="__main__":unittest.main()
