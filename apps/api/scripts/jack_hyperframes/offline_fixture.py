"""Reproducible original-media smoke render through the normal editorial renderer."""
import argparse
from array import array
import math
import time
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from types import SimpleNamespace

from render_tech_editorial import run


def command(*args):
    subprocess.run([str(arg) for arg in args],check=True)


def tone_level(video,start,duration,frequency=460):
    command=["ffmpeg","-v","error","-ss",str(start),"-i",str(video),"-vn","-t",str(duration),
             "-ac","1","-ar","8000","-f","f32le","-"]
    samples=array("f",subprocess.check_output(command))
    omega=2*math.pi*frequency/8000
    real=sum(sample*math.cos(omega*i) for i,sample in enumerate(samples))
    imag=sum(sample*math.sin(omega*i) for i,sample in enumerate(samples))
    return 2*math.hypot(real,imag)/len(samples)


def fixture(root, hyperframes, browser_modules):
    root.mkdir(parents=True,exist_ok=False)
    workspace=root/"workspace"
    vendor=workspace/"cdc-benchmark"/"vendor"
    vendor.mkdir(parents=True)
    (workspace/"node_modules").symlink_to(hyperframes/"node_modules",target_is_directory=True)
    shutil.copyfile(hyperframes/"cdc-benchmark/vendor/gsap.min.js",vendor/"gsap.min.js")
    source=root/"input"
    source.mkdir()
    lines="Build a simple local concept. Show its purpose with familiar examples. Explain each step clearly and check the result."
    (source/"script.txt").write_text(lines)
    # Deterministic narration proxy with audible vowel harmonics and controlled gaps.
    command("ffmpeg","-v","error","-f","lavfi","-i",
            "aevalsrc=0.20*sin(2*PI*180*t)*(0.65+0.35*sin(2*PI*3*t))*lt(mod(t\\,1)\\,0.8):s=48000",
            "-t","6",source/"narration.wav")
    words=[dict(word=word,start=i*.28,end=i*.28+.21) for i,word in enumerate(lines.split())]
    (source/"alignment.json").write_text(json.dumps({"words":words}))
    image=root/"illustration.png"
    command("ffmpeg","-v","error","-f","lavfi","-i",
            "color=c=0x09DF8C:s=600x300","-frames:v","1","-threads","1",image)
    music=root/"instrumental.wav"
    command("ffmpeg","-v","error","-f","lavfi","-i","sine=f=460:r=48000","-af","volume=2","-t","7",music)
    def asset(file,kind,**meta):
        return dict(path=file.name,kind=kind,approved=True,license="CC0-1.0",source="Original JACK fixture",
                    evidence="Procedurally generated for this test",sha256=hashlib.sha256(file.read_bytes()).hexdigest(),**meta)
    assets={"concept":asset(image,"illustration",tags=["local","concept","build"]),
            "bed":asset(music,"music",tags=["ambient","technology","minimal"],instrumental=True,bpm=85,duration_seconds=7)}
    manifest=root/"approved_assets.json"
    rejected={
        "not_approved":dict(assets["concept"],approved=False),
        "wrong_digest":dict(assets["concept"],sha256="0"*64),
        "unsafe":dict(assets["concept"],path="../outside.png"),
        "missing":dict(assets["concept"],path="absent.png"),
    }
    manifest.write_text(json.dumps({"assets":{**assets,**rejected}}))
    no_music=root/"visual_only.json"
    no_music.write_text(json.dumps({"assets":{"concept":assets["concept"]}}))
    def embeddings(**kwargs):
        return SimpleNamespace(data=[SimpleNamespace(index=i,embedding=[1,0]) for i in range(len(kwargs["input"]))])
    def storyboard(**kwargs):
        payload=json.loads(kwargs["messages"][1]["content"])
        shots={}
        for i,(key,beat) in enumerate(payload["beats"].items()):
            shots[key]=dict(template="product_demo",headline="A Local Concept" if i==0 else "Explain The Process",
                            detail="Illustrated example" if i==0 else "Follow the next step",items=[],
                            product_asset="concept" if i==0 else "missing",overlay_asset="none",background_asset="none",
                            typography="highlight_wipe",camera="static",motion_graphic="none",graphic_labels=[],
                            transition="cut",effect="none",accent_word=beat["from_word"],sfx="none")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(shots)))])
    client=SimpleNamespace(embeddings=SimpleNamespace(create=embeddings),
                          chat=SimpleNamespace(completions=SimpleNamespace(create=storyboard)))
    measurements={}
    for name,file in (("with-music",manifest),("without-music",no_music)):
        started=time.monotonic()
        run(SimpleNamespace(source=source,output=root/name,workspace=workspace,client=client,
                            mascot_manifest=None,approved_assets=file,product_manifest=None,sfx_manifest=None,
                            model="fixture",skip_ai_review=True,system_fonts_only=True))
        report=json.loads((root/name/"asset_usage.json").read_text())
        render_elapsed=time.monotonic()-started
        assert report["approved_visual_count"]==1
        assert bool(report["music"]) == (name=="with-music")
        assert report["visuals"][0]["assets"]==["concept"]
        final=root/name/"review.mp4"
        command("ffmpeg","-v","error","-i",final,"-f","null","-")
        # The original fixture has a distinctive green field. Inspect pixels in the encoded scene.
        pixels=subprocess.check_output(["ffmpeg","-v","error","-ss","0.8","-i",str(final),"-frames:v","1",
                                        "-vf","scale=108:192,format=rgb24","-f","rawvideo","-"])
        assert sum(g>140 and g>r*1.55 and g>b*1.28 for r,g,b in zip(pixels[::3],pixels[1::3],pixels[2::3]))>350
        audio=json.loads((root/name/"temporal_audio_qa.json").read_text())["audio"]
        assert abs(audio["integrated_lufs"]+14)<=1 and audio["true_peak_dbtp"]<=-1, audio
        measures={key:tone_level(final,start,length) for key,start,length in
                  [("intro",.04,.12),("narration_active",.45,.18),("narration_gap",.81,.16),("outro",6.26,.09)]}
        if name=="with-music":
            assert measures["narration_gap"]>measures["narration_active"]*1.10,measures
            assert measures["intro"]<measures["narration_gap"]*.30,measures
            assert measures["outro"]<measures["narration_gap"]*.9,measures
        else:
            assert measures["narration_gap"]<.003 and measures["outro"]<.003,measures
        measurements[name]={"render_and_mix_seconds":round(render_elapsed,2),"audio":audio,"music_tone_amplitudes":measures}
    (root/"fixture_measurements.json").write_text(json.dumps(measurements,indent=2))
    qa=Path(__file__).with_name("creative_lab")/"editorial_browser_qa.cjs"
    output=root/"with-music"
    command("node",qa,browser_modules,output)
    command("node",qa,browser_modules,output,"inject")
    clean=json.loads((output/"browser_qa.json").read_text())
    bad=json.loads((output/"injected_browser_qa.json").read_text())
    assert not clean["defects"], clean["defects"]
    assert any(sample["asset"]=="concept" and sample["label"]=="CONCEPT ILLUSTRATION" for sample in clean["samples"])
    assert {"caption_safe_area","text_overflow","expected_asset_missing"} <= {x["code"] for x in bad["defects"]}
    print(root)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--hyperframes",type=Path,required=True)
    parser.add_argument("--browser-modules",type=Path,required=True)
    args=parser.parse_args()
    fixture(args.output.resolve(),args.hyperframes.resolve(),args.browser_modules.resolve())
