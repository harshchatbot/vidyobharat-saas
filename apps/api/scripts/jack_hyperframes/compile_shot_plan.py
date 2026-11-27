"""Compile a review-only HyperFrames composition from a director plan.
Requires locally staged vendor/gsap.min.js and vendor/three.module.js.
Unsupported media cues fail closed until their rendering adapters exist.
"""
import argparse
import html
import json
from pathlib import Path
from app.services.harshverse.jack_cinematic_director import validate_plan

def compile_plan(plan, target):
    duration=plan["duration"]
    validate_plan(plan,duration,set())
    data=json.dumps(plan["shots"],ensure_ascii=True).replace("<","\\u003c")
    template=Path(__file__).with_name("composition")/"dynamic.html"
    output=template.read_text().replace("__DURATION__",str(float(duration))).replace("__SHOTS__",data)
    target=Path(target)
    target.write_text(output)
    return target

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--plan",required=True)
    p.add_argument("--output",required=True)
    a=p.parse_args()
    compile_plan(json.loads(Path(a.plan).read_text()),a.output)
