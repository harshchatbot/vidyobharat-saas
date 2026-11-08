"""Original, local-only HarshVerse Warm Explainer style pack.

Purposefully separate from the neutral HarshVerse render engine so future
creators can plug in other visual packs. All illustrations and the square buddy
are drawn deterministically with Pillow (no model calls, third-party assets,
or screenshots extracted from the Gemini reference). Each asset is 2x
supersampled and downscaled for crisp 720x640 split-screen plates.

This first iteration uses 2.5D/isometric illustration, not generated 3D footage.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont

STYLE_ID = "harshverse_warm"
PALETTE = {
    "cream": "#F8F3E9",
    "paper": "#FFFDF8",
    "charcoal": "#30302E",
    "peach": "#E7AB7E",
    "orange": "#CF8154",
    "dusty_blue": "#849DB0",
    "sage": "#A6B6A4",
    "sunflower": "#F0C976",
    "subtle": "#8F877E",
    "outline": "#E9E0D3",
}
_FONT_CANDIDATES = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
)
SCALE = 2
ART_SIZE = (720, 640)
CAPTION_RESERVED_START = 475  # top-panel caption strip, never paint over it


def _v(number: float) -> int:
    return int(round(number * SCALE))


def _rect(box):
    return tuple(_v(z) for z in box)


def _font(size: int):
    for item in _FONT_CANDIDATES:
        try:
            if Path(item).is_file():
                return ImageFont.truetype(item, _v(size))
        except OSError:
            continue
    return ImageFont.load_default(size=_v(size))


def _rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(_rect(box), radius=_v(radius), fill=fill,
                           outline=outline, width=_v(width))


def _text(draw, xy, text, size=26, fill=None, anchor="lt"):
    draw.text((_v(xy[0]), _v(xy[1])), text, fill=fill or PALETTE["charcoal"],
              font=_font(size), anchor=anchor, stroke_width=0)


def _line(draw, points, color, width=4, joint="curve"):
    draw.line([(_v(x), _v(y)) for x, y in points], fill=color,
              width=_v(width), joint=joint)


def _shadow(image, box, radius=28, blur=15, alpha=34):
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(_rect(box), radius=_v(radius), fill=(65, 46, 24, alpha))
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(_v(blur))))


def _card(draw, box, base, depth="#BFB2A3", radius=20):
    x1, y1, x2, y2 = box
    # Left/bottom projection creates a low-key isometric paper-object edge.
    _rounded(draw, (x1+3, y1+10, x2+3, y2+10), radius, depth)
    _rounded(draw, box, radius, base, PALETTE["outline"], 1)


def _arrow(draw, x1, y, x2, color):
    _line(draw, [(x1,y), (x2-12,y)], color, 5)
    _line(draw, [(x2-22,y-9), (x2-10,y), (x2-22,y+9)], color, 5)


def _sparkle(draw, x, y, color, r=10):
    _line(draw, [(x-r,y),(x+r,y)], color, 2)
    _line(draw, [(x,y-r),(x,y+r)], color, 2)


def draw_buddy(image: Image.Image, *, x=551, y=303, scale=1.0, mood="curious") -> None:
    """Our original rounded-square companion, not traced from the reference."""
    if image.mode != "RGBA":
        raise ValueError("Buddy overlay requires RGBA image")
    d = ImageDraw.Draw(image)
    def pt(xx,yy): return (_v(x+xx*scale),_v(y+yy*scale))
    def line(points, color, weight):
        d.line([pt(a,b) for a,b in points], fill=color, width=max(1,_v(weight*scale)), joint="curve")
    orange, dark = PALETTE["orange"], PALETTE["charcoal"]
    # Foot pads, flexible legs, open arms and hands.
    line([(42,99),(38,118)],orange,7)
    line([(82,99),(88,118)],orange,7)
    d.ellipse((*pt(28,114),*pt(46,122)),fill=orange)
    d.ellipse((*pt(80,114),*pt(98,122)),fill=orange)
    line([(12,67),(-2,55)],orange,6)
    line([(111,64),(128,48)],orange,6)
    d.ellipse((*pt(-8,48),*pt(4,61)),fill=orange)
    d.ellipse((*pt(123,42),*pt(135,54)),fill=orange)
    # Isometric bevel and face panel.
    d.polygon([pt(19,10),pt(28,0),pt(109,2),pt(118,12),pt(111,100),pt(19,99)],
              fill="#C67C51")
    d.rounded_rectangle((*pt(15,9),*pt(113,101)),radius=_v(16*scale),
                        fill="#F0B58B",outline="#B96E44",width=_v(3*scale))
    d.rounded_rectangle((*pt(25,19),*pt(104,89)),radius=_v(13*scale),
                        fill="#FFF9E9",outline="#E7C7A4",width=_v(2*scale))
    # Eyes with highlights, cheeks, small expressive brow.
    if mood == "surprised":
        for ex in (48,83):
            d.ellipse((*pt(ex-9,40),*pt(ex+9,61)),fill=dark)
            d.ellipse((*pt(ex-4,42),*pt(ex,47)),fill="white")
        d.ellipse((*pt(62,66),*pt(70,76)),fill="#82472D")
    else:
        for ex in (48,83):
            d.ellipse((*pt(ex-7,45),*pt(ex+7,61)),fill=dark)
            d.ellipse((*pt(ex-4,47),*pt(ex,51)),fill="white")
        line([(56,69),(61,74),(72,74),(77,68)], "#784B3E", 2)
    d.ellipse((*pt(31,64),*pt(43,70)),fill="#F3C7AC")
    d.ellipse((*pt(88,64),*pt(100,70)),fill="#F3C7AC")


def make_buddy_sticker(path: Path, *, mood="curious") -> Path:
    """Small transparent buddy for face-safe presenter cameo overlays."""
    image = Image.new("RGBA", (_v(165),_v(166)), (0,0,0,0))
    draw_buddy(image, x=15, y=16, mood=mood, scale=1.0)
    path = Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    image.resize((165,166),Image.Resampling.LANCZOS).save(path)
    return path


def _data_flow(draw, reveal_step=3):
    nodes = ((82,"#F2E1CB","INPUT"),(285,"#D9E4E6","PATTERNS"),(488,"#EED2B8","OUTPUT"))
    for i, (x, tone, title) in enumerate(nodes):
        if i >= reveal_step:
            continue
        _card(draw,(x,226,x+148,352),tone, radius=18)
        _rounded(draw,(x+17,245,x+58,285),10,PALETTE["paper"])
        for i in range(3):
            _line(draw,[(x+24,255+i*10),(x+48,255+i*10)],PALETTE["dusty_blue"],2)
        _text(draw,(x+18,308),title,16)
    if reveal_step >= 2:
        _arrow(draw,238,288,276,PALETTE["orange"])
    if reveal_step >= 3:
        _arrow(draw,441,288,479,PALETTE["orange"])


def _source_stack(draw, reveal_step=3):
    for i,(name,tone) in enumerate((
        ("SOURCES","#D6E1E5"),("SIGNALS","#EFD6B8"),("CONTEXT","#E0E5D6"))):
        if i >= reveal_step:
            continue
        xx=128+i*80
        yy=175+i*57
        _card(draw,(xx,yy,xx+320,yy+78),tone,radius=18)
        _rounded(draw,(xx+18,yy+22,xx+55,yy+57),8,PALETTE["paper"])
        _text(draw,(xx+73,yy+26),name,19)
        _line(draw,[(xx+74,yy+56),(xx+225,yy+56)],"#AAABA2",2)


def _human_ai(draw, reveal_step=3):
    for i,(x,label,tone) in enumerate(((97,"HUMAN","#F4D3B9"),(381,"AI","#D6E6EA"))):
        if i >= reveal_step:
            continue
        _card(draw,(x,194,x+245,376),tone,radius=22)
        if label=="HUMAN":
            d=(x+120,264)
            draw.ellipse(_rect((d[0]-24,d[1]-46,d[0]+24,d[1]+2)), fill=PALETTE["orange"])
            _rounded(draw,(d[0]-40,d[1]+7,d[0]+40,d[1]+55),20,"#B58E77")
        else:
            _rounded(draw,(x+83,218,x+162,309),20,"#F9F8F2",PALETTE["dusty_blue"],3)
            draw.ellipse(_rect((x+102,252,x+112,262)),fill=PALETTE["charcoal"])
            draw.ellipse(_rect((x+132,252,x+142,262)),fill=PALETTE["charcoal"])
            _line(draw,[(x+112,284),(x+136,284)],PALETTE["orange"],3)
        _text(draw,(x+122,333),label,19,anchor="mt")
    if reveal_step >= 3:
        _sparkle(draw,363,282,PALETTE["orange"],16)


def _keyword(draw, reveal_step=3):
    _card(draw,(105,189,615,384),"#F4DFC9",radius=28)
    _rounded(draw,(128,214,180,265),11,PALETTE["paper"])
    _sparkle(draw,154,238,PALETTE["orange"],13)
    if reveal_step >= 2:
        _text(draw,(200,223),"THE BIG IDEA",33)
    if reveal_step >= 3:
        _text(draw,(200,278),"explained visually",21,PALETTE["subtle"])
        _line(draw,[(200,328),(430,328)],PALETTE["orange"],5)


_ILLUSTRATIONS = {
    "data_flow": _data_flow,
    "source_stack": _source_stack,
    "human_vs_ai": _human_ai,
    "keyword_card": _keyword,
}
_TITLES = {
    "data_flow":"HOW IT WORKS",
    "source_stack":"CONNECTING THE SOURCES",
    "human_vs_ai":"TWO WAYS TO THINK",
    "keyword_card":"ONE IMPORTANT IDEA",
}


def make_explainer_panel(path: Path, *, template: str, ordinal: int=1,
                         reveal_step: int=3) -> Path:
    """Render one graphic panel. Source subtitles are added separately."""
    if template not in _ILLUSTRATIONS:
        raise ValueError(f"Unsupported warm explainer template: {template}")
    if reveal_step not in (1, 2, 3):
        raise ValueError("Warm explainer reveal_step must be 1, 2, or 3")
    image=Image.new("RGBA",(_v(720),_v(640)),PALETTE["cream"])
    d=ImageDraw.Draw(image)
    # Asymmetric soft pastel decoration plus a quiet baseline.
    d.ellipse(_rect((-140,-165,292,260)),fill="#F7E5D2")
    d.ellipse(_rect((540,-110,885,240)),fill="#E3ECEC")
    d.ellipse(_rect((-86,420,170,690)),fill="#EBEBDE")
    _shadow(image,(46,120,678,430),radius=34,blur=19)
    _card(d,(42,111,678,438),PALETTE["paper"],"#DED7CB",28)
    _rounded(d,(49,33,63,62),6,PALETTE["orange"])
    _text(d,(79,37),f"HARSHVERSE  /  {ordinal:02d}",16,PALETTE["subtle"])
    _text(d,(48,74),_TITLES[template],30)
    _ILLUSTRATIONS[template](d, reveal_step=reveal_step)
    # Brand buddy appears inside each explainer; never covered by captions.
    draw_buddy(image,x=543,y=315,scale=.66,mood="curious" if ordinal%2 else "surprised")
    _line(d,[(50,470),(668,470)],"#E4D9CB",2)
    # A dedicated 470..640 caption reserve keeps spoken subtitles visible.
    _text(d,(57,486),"YOUR WORDS  ·  HIGHLIGHTED BELOW",13,PALETTE["subtle"])
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    image.resize(ART_SIZE,Image.Resampling.LANCZOS).convert("RGB").save(path,quality=95)
    return path
