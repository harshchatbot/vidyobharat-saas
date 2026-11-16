"""V3.4 automated preflight and optional browser-level visual QA.

This is a QA *screen*, not a guarantee that imagery looks good or claims are true.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any


def storyboard_preflight(plan: dict) -> dict:
    beats = plan["beats"]
    layouts = [b["stage"].get("layout", "character_focus") for b in beats]
    graphics = {"phone_screen", "retention_chart", "timeline_bar", "compare_card",
                "checklist_card", "stat_card", "idea_card", "fix_board", "prompt_card"}
    issues = []
    duplicates = [name for name, n in Counter(layouts).items() if n > 4]
    if duplicates:
        issues.append("overused_layouts:" + ",".join(duplicates))
    if len(set(layouts)) < 4:
        issues.append("insufficient_layout_diversity")
    graphic_beats = sum(bool({p["id"] for p in beat["stage"]["props"]} & graphics)
                        for beat in beats)
    if graphic_beats < 3:
        issues.append("insufficient_graphics")
    for beat in beats:
        if len(beat["headline"]["text"]) > 34:
            issues.append(f"{beat['id']}:headline_may_overflow")
        for prop in beat["stage"]["props"]:
            if len(str(prop.get("text") or "")) > 52:
                issues.append(f"{beat['id']}:{prop['id']}_text_may_overflow")
    return {"status": "review_required" if issues else "preflight_pass",
            "layout_count": len(set(layouts)), "graphic_beats": graphic_beats,
            "issues": issues}


def browser_visual_qa(plan: dict, *, chromium: str | None = None,
                      width: int = 540) -> dict:
    """Check sampled DOM bounds at the same viewport used by renderer."""
    from playwright.sync_api import sync_playwright

    stage_html = Path(__file__).with_name("stage.html").read_text(encoding="utf-8")
    frames = [b["start_frame"] + min(b["duration_frames"] - 1, 38)
              for b in plan["beats"]]
    findings: list[dict[str, Any]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=chromium) if chromium else p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": width, "height": width*16//9})
            page.set_content(stage_html, wait_until="load")
            page.evaluate("(plan) => window.loadPlan(plan)", plan)
            page.evaluate("(scale) => {document.getElementById('stage').style.transform='scale('+scale+')'}", width / 1080)
            for beat, frame in zip(plan["beats"], frames):
                page.evaluate("(f) => window.setFrame(f)", frame)
                data = page.evaluate("""() => {
                  const candidates=[document.getElementById('header'),document.getElementById('pill'),
                                    ...document.querySelectorAll('#props .prop')];
                  return candidates.map((el) => {
                    const txt=el.innerText||'';
                    const overflowX=el.scrollWidth-el.clientWidth;
                    const overflowY=el.scrollHeight-el.clientHeight;
                    const rect=el.getBoundingClientRect();
                    return {kind:el.id||el.className,chars:txt.length,
                            overflow_x:overflowX,overflow_y:overflowY,
                            x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom}
                  })
                }""")
                for item in data:
                    if item["overflow_x"] > 5 or item["overflow_y"] > 6:
                        findings.append({"beat": beat["id"],"frame":frame,
                                         "issue":"text_or_element_overflow",
                                         "element":str(item["kind"]),
                                         "overflow_x":item["overflow_x"],
                                         "overflow_y":item["overflow_y"]})
                    # Visible stage is width x height; mark offstage elements,
                    # except intentional animation easing at early frames.
                    if item["right"] > width+10 or item["x"] < -10 or item["bottom"] > width*16//9+10:
                        findings.append({"beat":beat["id"],"frame":frame,
                                         "issue":"element_offscreen","element":str(item["kind"])})
        finally:
            browser.close()
    return {"status": "review_required" if findings else "sampled_dom_pass",
            "sampled_frames": frames, "findings": findings[:100],
            "finding_count": len(findings),
            "note":"DOM sampled only: human video review still mandatory"}
