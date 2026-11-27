"""JACK V0.9: original cinematic CDC micro-scene; FFmpeg/Pillow only.

Seven-second 9:16 motion-graphics benchmark. Optional approved narration.
Not a recording of Salesforce UI; no creative or publication approval.
"""
from __future__ import annotations
import argparse
import json
import math
import random
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H,FPS,DURATION=720,1280,24,7

def font(size,bold=False):
    names=(
        ["/System/Library/Fonts/Supplemental/Arial Bold.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if bold else
        ["/System/Library/Fonts/Supplemental/Arial.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    )
    for name in names:
        if Path(name).exists():return ImageFont.truetype(name,size)
    return ImageFont.load_default()

def ease(x):
    x=max(0,min(1,x))
    return x*x*(3-2*x)

def card(d,rect,title,details,accent):
    x,y,x2,y2=map(int,rect)
    d.rounded_rectangle((x+9,y+15,x2+9,y2+15),radius=24,fill=(0,0,0,95))
    d.rounded_rectangle((x,y,x2,y2),radius=24,fill=(20,35,57,245),outline=(*accent,255),width=3)
    d.rounded_rectangle((x+20,y+20,x+31,y+55),radius=5,fill=(*accent,255))
    d.text((x+50,y+19),title,font=font(27,True),fill="white")
    for i,s in enumerate(details):
        d.text((x+30,y+85+35*i),s,font=font(24),fill="#c3d4ed")

def render_frame(t):
    base=Image.new("RGBA",(W,H),(8,14,27,255))
    d=ImageDraw.Draw(base,"RGBA")
    drift=int(12*math.sin(t*.6))
    for i in range(-8,14):
        d.line((360,420,360+i*90+drift,1280),fill=(50,76,112,45),width=2)
    for j in range(8):
        y=int(510+(j/8)**1.6*760)
        d.line((0,y,720,y),fill=(50,76,112,32),width=2)
    glow=Image.new("RGBA",(W,H))
    g=ImageDraw.Draw(glow,"RGBA")
    g.ellipse((-250,430,510,1190),fill=(244,92,37,60))
    g.ellipse((250,130,1040,920),fill=(35,100,252,65))
    base=Image.alpha_composite(base,glow.filter(ImageFilter.GaussianBlur(105)))
    d=ImageDraw.Draw(base,"RGBA")
    d.text((46,56),"JACK  /  DATA IN MOTION",font=font(22,True),fill="#bed3ee")
    d.line((45,99,675,99),fill="#ff8545",width=3)
    phase=0 if t<2.2 else 1 if t<4.65 else 2
    headings=[("ONE RECORD","CHANGES"),("AN EVENT","IS PUBLISHED"),("AN APP","REACTS")]
    start=[0,2.2,4.65][phase]
    shift=int(35*(1-ease((t-start)/.36)))
    d.text((46,165+shift),headings[phase][0],font=font(61,True),fill="white")
    d.text((46,247+shift),headings[phase][1],font=font(61,True),fill="#ff9a5b")
    d.text((48,345),"SALESFORCE CHANGE DATA CAPTURE",font=font(21),fill="#9dbaDF")
    if t<4.65:
        y=480-int(15*ease(t/.8))
        card(d,(42,y,678,y+224),"CUSTOMER RECORD",
             ["Status: Active","Last modified: Just now"],(76,169,255))
        if t>.85:
            d.rounded_rectangle((326,y+145,619,y+194),radius=12,fill="#238f74")
            d.text((345,y+155),"UPDATED  ✓",font=font(22,True),fill="white")
    if t>=2.25:
        u=ease((t-2.25)/2.9)
        x=350+int(110*math.sin(u*math.pi))
        y=770+int(205*u)
        trail=Image.new("RGBA",(W,H))
        td=ImageDraw.Draw(trail,"RGBA")
        for k in range(17,0,-1):
            prev=max(0,u-k*.013)
            px=350+int(110*math.sin(prev*math.pi))
            py=770+int(205*prev)
            r=max(3,int(15-k*.5))
            td.ellipse((px-r,py-r,px+r,py+r),fill=(255,133,66,max(0,125-k*7)))
        base=Image.alpha_composite(base,trail.filter(ImageFilter.GaussianBlur(8)))
        d=ImageDraw.Draw(base,"RGBA")
        d.ellipse((x-20,y-20,x+20,y+20),fill="#ff9b4f",outline="#ffe1b1",width=4)
        if t<5.6:
            d.rounded_rectangle((130,798,590,875),radius=20,fill="#21304c",outline="#ff9451",width=2)
            d.text((161,818),"CDC  •  CHANGE EVENT",font=font(24,True),fill="white")
    if t>=4.65:
        y=936-int(ease((t-4.65)/.5)*25)
        card(d,(42,y,678,y+204),"EXTERNAL SUBSCRIBER",
             ["Receives change event","Processes update"],(255,135,70))
        if t>5.55:
            d.rounded_rectangle((420,y+145,628,y+185),radius=13,fill="#24755f")
            d.text((443,y+150),"SYNCED  ✓",font=font(19,True),fill="white")
    rng=random.Random(407)
    for _ in range(55):
        x=rng.randint(0,W);y=rng.randint(0,H)
        r=rng.choice((1,1,2,3))
        yy=(y-int(t*(8+r*4)))%H
        d.ellipse((x,yy,x+r,yy+r),fill=(137,178,240,rng.randint(25,100)))
    d.text((46,1220),"CONCEPTUAL ILLUSTRATION  /  NOT LIVE UI",
           font=font(17),fill="#879ec0")
    return base.convert("RGB")

def render(output_dir,narration=None):
    output_dir=Path(output_dir)
    output_dir.mkdir(parents=True,exist_ok=True)
    output=output_dir/"jack_v09_cinematic_scene.mp4"
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-f","rawvideo",
         "-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-"]
    if narration:cmd+=["-i",str(narration)]
    cmd+=["-map","0:v:0"]
    if narration:cmd+=["-map","1:a:0"]
    cmd+=["-c:v","libx264","-preset","veryfast","-crf","21","-pix_fmt","yuv420p"]
    if narration:cmd+=["-c:a","aac","-b:a","160k","-af","apad"]
    else:cmd+=["-an"]
    cmd+=["-t",str(DURATION),"-movflags","+faststart",str(output)]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for n in range(FPS*DURATION):
            proc.stdin.write(render_frame(n/FPS).tobytes())
        proc.stdin.close()
        if proc.wait(timeout=180):
            raise RuntimeError("FFmpeg encode failed")
    except BaseException:
        if proc.stdin and not proc.stdin.closed:proc.stdin.close()
        proc.kill()
        raise
    manifest={"schema_version":"jack-v0.9","video":str(output),
              "duration_seconds":DURATION,"narration_included":bool(narration),
              "audio_alignment_verified":False,"creative_approved":False,
              "publish_authorized":False,"original_procedural_artwork":True}
    (output_dir/"jack_v09_manifest.json").write_text(json.dumps(manifest,indent=2))
    print(output)
    return output

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output-dir",required=True)
    parser.add_argument("--narration",type=Path)
    args=parser.parse_args()
    render(args.output_dir,args.narration)
