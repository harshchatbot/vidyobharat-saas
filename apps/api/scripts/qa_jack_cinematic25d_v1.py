"""Playwright visual QA for JACK Chromium 2.5D. No AI claims or auto-publish.

Captures deterministic frame samples, checks viewport bounds and critical overlaps,
and applies a bounded caption-layout correction in memory for comparison.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

FRAMES = (12, 36, 72, 110, 142, 190)
ELEMENTS = ("record", "bus", "subscribers", "caption", "end")
MAX_CAPTION_TOP = 850

def intersects(a, b):
    return (a["left"] < b["right"] and a["right"] > b["left"]
            and a["top"] < b["bottom"] and a["bottom"] > b["top"])

def assess_geometry(elements, *, stage_width=540, stage_height=960):
    problems = []
    for key, box in elements.items():
        if not box["visible"]:
            continue
        if box["left"] < -2 or box["right"] > stage_width + 2 or box["top"] < -2 or box["bottom"] > stage_height + 2:
            problems.append({"type":"out_of_bounds","element":key})
    caption = elements.get("caption")
    if caption and caption["visible"]:
        for key in ("record", "subscribers", "end"):
            other = elements.get(key)
            if other and other["visible"] and intersects(caption, other):
                problems.append({"type":"caption_overlap","element":key})
    return problems

JS_GEOMETRY = """() => {
  const stage = document.getElementById('stage').getBoundingClientRect();
  const scale = stage.width / 540;
  const result = {};
  for (const id of ['record','bus','subscribers','caption','end']) {
    const node = document.getElementById(id), b = node.getBoundingClientRect();
    const s = getComputedStyle(node);
    const text = node.innerText.trim();
    result[id] = {
      left:(b.left-stage.left)/scale, right:(b.right-stage.left)/scale,
      top:(b.top-stage.top)/scale, bottom:(b.bottom-stage.top)/scale,
      visible:s.visibility!=='hidden' && Number(s.opacity)>0.1 && b.width>0 && b.height>0 && text.length>0
    };
  }
  return result;
}"""

def run(output_dir, *, auto_correct=False):
    from playwright.sync_api import sync_playwright
    out = Path(output_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).with_name("jack_cinematic25d_v31.html").resolve()
    report = {"schema":"rangmanch-visual-qa/v1","source":source.name,
              "frames":[], "corrections":[], "human_approval_required":True,
              "ai_vision_review":"not_run","audio_qa":"not_run"}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width":540,"height":960}, device_scale_factor=1)
            page.goto(source.as_uri()+"?frame=0")
            for frame in FRAMES:
                page.evaluate("(f)=>window.seekFrame(f)",frame)
                boxes = page.evaluate(JS_GEOMETRY)
                issues = assess_geometry(boxes)
                image_name = f"frame_{frame:03d}.png"
                page.screenshot(path=str(out/image_name), animations="disabled")
                entry = {"frame":frame,"image":image_name,"issues":issues}
                if auto_correct and any(x["type"]=="caption_overlap" for x in issues):
                    original = page.locator("#caption").evaluate("(el)=>el.style.top")
                    # Only an approved bounded parameter change; never rewrite arbitrary CSS.
                    page.locator("#caption").evaluate("(el)=>el.style.top='850px'")
                    corrected = assess_geometry(page.evaluate(JS_GEOMETRY))
                    if len(corrected)<len(issues):
                        corrected_name=f"frame_{frame:03d}_corrected.png"
                        page.screenshot(path=str(out/corrected_name), animations="disabled")
                        report["corrections"].append({"frame":frame,"parameter":"caption.top",
                             "from":original or "740px","to":"850px","image":corrected_name,
                             "remaining_issues":corrected})
                    page.locator("#caption").evaluate("(el,original)=>el.style.top=original",original)
                report["frames"].append(entry)
        finally:
            browser.close()
    report["issues_found"]=sum(len(f["issues"]) for f in report["frames"])
    report["status"]="review_required" if report["issues_found"] else "geometry_checks_passed_review_required"
    (out/"qa_report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"report":str(out/"qa_report.json"),"issues":report["issues_found"],
                      "corrections":len(report["corrections"]),"status":report["status"]},indent=2))
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output-dir",required=True)
    parser.add_argument("--auto-correct",action="store_true")
    args=parser.parse_args()
    run(args.output_dir,auto_correct=args.auto_correct)
