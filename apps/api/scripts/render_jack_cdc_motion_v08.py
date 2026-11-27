"""JACK V0.8: cinematic CDC motion-graphics proof of concept.

Renders an original 12-second 9:16 animated diagram with synchronized
macOS synthetic narration. Does not use third-party reference frames.
Requires Pillow, ffmpeg, ffprobe, macOS say. No publication.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

W, H, FPS, SECONDS = 720, 1280, 24, 12


def font(size):
    from PIL import ImageFont
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def ease(x):
    x = max(0., min(1., x))
    return x*x*(3-2*x)


def frame(t):
    from PIL import Image, ImageDraw, ImageFilter
    im = Image.new("RGB", (W, H), (8, 13, 29))
    glow = Image.new("RGBA", (W, H))
    g = ImageDraw.Draw(glow)
    for x,y,r,color in ((125,840,280,(255,99,33,42)), (600,420,300,(42,102,255,40))):
        g.ellipse((x-r,y-r,x+r,y+r), fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(85))
    im = Image.alpha_composite(im.convert("RGBA"), glow)
    d = ImageDraw.Draw(im)
    for x in range(40,720,65):
        d.line((x,580,x,1190),fill=(24,34,53,255),width=1)
    for y in range(600,1200,65):
        d.line((35,y,690,y),fill=(24,34,53,255),width=1)
    d.text((45,55),"JACK  /  TECH EXPLAINER",font=font(22),fill="#b7c5de")
    d.line((45,100,675,100),fill="#f68b45",width=3)
    # Kinetic headline, changing as the narration advances.
    headlines = [
        ("YOUR DATA CHANGED.", "BUT DID OTHER SYSTEMS KNOW?"),
        ("SALESFORCE CDC", "PUBLISHES CHANGE EVENTS"),
        ("SUBSCRIBERS REACT", "WITHOUT CONSTANT POLLING"),
    ]
    idx = 0 if t<4 else 1 if t<8 else 2
    local = t % 4
    alpha = ease(local/.55)
    yoffset = int((1-alpha)*42)
    headline,sub = headlines[idx]
    d.text((47,160+yoffset),headline,font=font(49),fill="#ffffff")
    d.rounded_rectangle((47,255+yoffset,666,335+yoffset),radius=14,fill="#ff873f")
    d.text((64,273+yoffset),sub,font=font(26),fill="#111629")
    # Cards and directional connection.
    cards=[("SALESFORCE","Record updated"),("CDC EVENT","Change published"),("SUBSCRIBER","External system")]
    coords=[(65,450),(65,670),(65,890)]
    for j,((title,detail),(x,y)) in enumerate(zip(cards,coords)):
        active=ease((t-j*2.3-.5)/.7)
        fill=(28+int(14*active),42+int(25*active),66+int(24*active),255)
        d.rounded_rectangle((x,y,x+590,y+145),radius=24,fill=fill,
                            outline="#ff9853" if active>.6 else "#49617f",width=3)
        d.ellipse((x+22,y+39,x+80,y+97),fill="#ff914a" if active>.6 else "#4a6384")
        d.text((x+105,y+25),title,font=font(34),fill="#ffffff")
        d.text((x+105,y+83),detail,font=font(26),fill="#b7c5de")
    for j in (0,1):
        y=595+j*220
        d.line((360,y,360,y+75),fill="#526c8d",width=5)
        p=(t-(1.8+j*2.3))/.85
        if 0<=p<=1:
            cy=y+75*ease(p)
            d.ellipse((349,cy-11,371,cy+11),fill="#ff9a54")
    d.text((47,1122),"CONCEPTUAL DEMO  •  NOT LIVE SALESFORCE UI",
           font=font(19),fill="#9bb1cd")
    d.text((47,1170),"EVENT-DRIVEN INTEGRATION",font=font(29),fill="#ffffff")
    return im.convert("RGB")


def run(output_dir: Path, voice: str | None = None):
    output_dir.mkdir(parents=True,exist_ok=True)
    narration=("A Salesforce record changes. How does another system find out? "
               "Change Data Capture publishes change events. "
               "Subscribers can process those events without constant polling.")
    audio=output_dir/"jack_v08_voice.aiff"
    cmd=["say"]
    if voice:
        cmd+=["-v",voice]
    subprocess.run(cmd+["-o",str(audio),narration],check=True,timeout=90)
    silent=output_dir/"jack_v08_motion_silent.mp4"
    proc=subprocess.Popen(["ffmpeg","-hide_banner","-loglevel","error","-y",
         "-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),
         "-i","-","-an","-c:v","libx264","-preset","veryfast",
         "-crf","21","-pix_fmt","yuv420p",str(silent)],stdin=subprocess.PIPE)
    try:
        for n in range(FPS*SECONDS):
            proc.stdin.write(frame(n/FPS).tobytes())
        proc.stdin.close()
        if proc.wait(timeout=120)!=0:
            raise RuntimeError("FFmpeg animation encode failed")
    except BaseException:
        if proc.stdin and not proc.stdin.closed:
            proc.stdin.close()
        proc.kill()
        raise
    output=output_dir/"jack_v08_cdc_motion.mp4"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
        "-i",str(silent),"-i",str(audio),"-filter_complex",
        "[1:a]apad,atrim=duration=12[a]",
        "-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac",
        "-b:a","160k","-t","12","-movflags","+faststart",str(output)],
        check=True,timeout=120)
    manifest={"schema_version":"jack-v0.8","output":str(output),
      "duration_seconds":SECONDS,"fps":FPS,"resolution":[W,H],
      "narration_origin":"macos_say_synthetic",
      "graphics":"original_animated_conceptual_diagram",
      "audio_alignment":"not_word_aligned","claims_verified":False,
      "creative_director_approved":False,"publish_authorized":False}
    (output_dir/"jack_v08_manifest.json").write_text(json.dumps(manifest,indent=2))
    print("Rendered:",output)


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output-dir",required=True)
    p.add_argument("--voice")
    args=p.parse_args()
    run(Path(args.output_dir).expanduser(),args.voice)
