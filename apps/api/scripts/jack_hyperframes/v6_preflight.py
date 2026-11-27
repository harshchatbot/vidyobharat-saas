"""Run before spending API credits on a V6 benchmark."""
import argparse, importlib.util, shutil, subprocess, tempfile, os
from pathlib import Path

def check(workspace):
    workspace=Path(workspace).expanduser()
    for command in ("ffmpeg","ffprobe","node"):
        if not shutil.which(command): raise RuntimeError("Missing "+command)
    for module in ("openai","faster_whisper","jsonschema","reportlab"):
        if importlib.util.find_spec(module) is None: raise RuntimeError("Missing Python dependency: "+module)
    for path in (workspace/"node_modules/.bin/hyperframes",workspace/"cdc-benchmark/vendor/gsap.min.js"):
        if not path.is_file(): raise RuntimeError("Missing "+str(path))
    gsap=workspace/"cdc-benchmark/vendor/gsap.min.js"
    subprocess.run(["node","-e", "const fs=require('fs'),vm=require('vm'); const m=require(process.argv[1]); const g=m.gsap||m.default||m; const ctx={console,setTimeout,clearTimeout}; ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);const browser=ctx.gsap; if(!browser||browser.version!==g.version||typeof browser.parseEase!=='function') throw Error('Browser GSAP bundle mismatch'); if(!g||typeof g.parseEase!=='function') throw Error('GSAP core unavailable'); for(const name of ['power3.out','sine.inOut','back.out(1.25)']) {const e=g.parseEase(name); if(Math.abs(e(0))>1e-6||Math.abs(e(1)-1)>1e-6||!Number.isFinite(e(.5))) throw Error('Invalid ease '+name);} console.log('GSAP core version:',g.version);",str((workspace/'node_modules/gsap/dist/gsap.js').resolve()),str(gsap.resolve())],check=True)
    for path in Path(__file__).parent.glob("*.py"):
        compile(path.read_text(),str(path),"exec")
    html=(Path(__file__).parent/"composition/spatial.html").read_text()
    js=html.split("<script>")[-1].split("</script>")[0]
    for token,value in {"__SPATIAL__":"{}","__PRODUCTS__":"{}","__WORDS__":"[]","__DURATION__":"1"}.items(): js=js.replace(token,value)
    with tempfile.TemporaryDirectory() as d:
        p=Path(d)/"check.js"
        p.write_text(js)
        subprocess.run(["node","--check",str(p)],check=True)
    if not os.environ.get("OPENAI_API_KEY"): raise RuntimeError("OPENAI_API_KEY is not set")
    print("V6 preflight passed (syntax and dependencies only)")

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--workspace",required=True)
    check(p.parse_args().workspace)
