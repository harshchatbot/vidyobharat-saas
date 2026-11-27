"""Parse a JACK ``post-pack.md`` into the fields each platform needs."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

IG_CAPTION_MAX = 2200
IG_HASHTAGS_MAX = 5  # channel rule: 3-5 hashtags
YT_TITLE_MAX = 100
YT_DESCRIPTION_MAX = 5000


class PostPackError(ValueError):
    pass


@dataclass
class PostPack:
    ig_captions: dict[str, str]
    hashtags: list[str]
    yt_title: str
    yt_description: str
    pinned_comment: str = ""
    extra: dict[str, str] = field(default_factory=dict)

    def ig_caption(self, option: str = "A", hashtags: int = IG_HASHTAGS_MAX) -> str:
        key = option.upper()
        if key not in self.ig_captions:
            raise PostPackError(f"caption option {key} not in post pack (have {sorted(self.ig_captions)})")
        text = self.ig_captions[key].strip()
        tags = " ".join(self.hashtags[:hashtags])
        caption = f"{text}\n\n{tags}".strip()
        if len(caption) > IG_CAPTION_MAX:
            raise PostPackError(f"Instagram caption is {len(caption)} chars (max {IG_CAPTION_MAX})")
        return caption

    def yt_tags(self) -> list[str]:
        return [t.lstrip("#") for t in re.findall(r"#\w+", self.yt_description) if t.lower() != "#shorts"]


def _sections(md: str) -> dict[str, str]:
    out: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in md.splitlines():
        m = re.match(r"^##\s+(.*)$", line)
        if m:
            if current is not None:
                out[current] = "\n".join(buf).strip()
            current, buf = m.group(1).strip(), []
        elif current is not None:
            buf.append(line)
    if current is not None:
        out[current] = "\n".join(buf).strip()
    return out


def _field(block: str, name: str) -> str:
    """Return the text after ``**Name:**`` up to the next ``**Field:**`` line."""
    m = re.search(rf"\*\*{name}:\*\*\s*(.*?)(?=\n\*\*[A-Z][\w ]*:\*\*|\Z)", block, re.S)
    return m.group(1).strip() if m else ""


def parse(md: str) -> PostPack:
    sections = _sections(md)
    captions: dict[str, str] = {}
    hashtags: list[str] = []
    title = description = pinned = ""
    for name, body in sections.items():
        low = name.lower()
        opt = re.search(r"caption.*option\s+([a-z])\b", low)
        if opt:
            captions[opt.group(1).upper()] = body
        elif low.startswith("hashtag"):
            hashtags = list(dict.fromkeys(re.findall(r"#\w+", body)))
        elif "youtube" in low:
            title, description = _field(body, "Title"), _field(body, "Description")
        elif "pinned comment" in low:
            pinned = body
    if not captions:
        raise PostPackError("no '## Instagram Reel caption, option X' section found")
    if not hashtags:
        raise PostPackError("no hashtags found under '## Hashtags'")
    if not title:
        raise PostPackError("no '**Title:**' under '## YouTube Shorts'")
    if len(title) > YT_TITLE_MAX:
        raise PostPackError(f"YouTube title is {len(title)} chars (max {YT_TITLE_MAX})")
    if len(description) > YT_DESCRIPTION_MAX:
        raise PostPackError(f"YouTube description is {len(description)} chars (max {YT_DESCRIPTION_MAX})")
    if re.search(r"[<>]", title + description):
        raise PostPackError("YouTube title/description may not contain < or >")
    return PostPack(captions, hashtags, title, description, pinned)
