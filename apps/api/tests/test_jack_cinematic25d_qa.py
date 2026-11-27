import importlib.util
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "qa_jack_cinematic25d_v1.py"
spec = importlib.util.spec_from_file_location("jack_visual_qa", MODULE)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

def box(l,t,r,b,visible=True):
    return {"left":l,"top":t,"right":r,"bottom":b,"visible":visible}

def test_intersection_detected():
    assert qa.intersects(box(0,0,20,20),box(10,10,30,30))
    assert not qa.intersects(box(0,0,10,10),box(10,10,20,20))

def test_caption_overlap_flagged():
    issues=qa.assess_geometry({"caption":box(20,700,500,820),
                               "subscribers":box(30,750,490,850)})
    assert {"type":"caption_overlap","element":"subscribers"} in issues

def test_hidden_elements_ignored():
    assert qa.assess_geometry({"caption":box(20,700,500,820),
                                "subscribers":box(30,750,490,850,False)}) == []

def test_offscreen_flagged():
    assert qa.assess_geometry({"caption":box(-10,700,500,820)})[0]["type"]=="out_of_bounds"
