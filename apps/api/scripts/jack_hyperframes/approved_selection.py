"""Local rights and integrity gate shared by JACK visual and audio selection."""
import hashlib
import json
from pathlib import Path
import re

VISUAL = {"product_visual", "illustration"}
MUSIC = {"music"}
# ND terms do not authorize adapting the file for this composition. Private
# permission and other reviewed terms can be stated through a local LicenseRef.
LICENSE = re.compile(r"(?:CC0-1\.0|CC-BY(?:-SA)?-(?:2\.0|2\.5|3\.0|4\.0)|MIT|Apache-2\.0|BSD-[23]-Clause|Unlicense|0BSD|LicenseRef-[A-Za-z0-9][A-Za-z0-9.-]*)")


def tokens(text):
    return set(re.findall(r"[a-z0-9]+", text.lower())) - {"the", "a", "an", "and", "of", "for", "to", "in"}


def approved_candidates(manifest, kinds):
    if not manifest:
        return {}
    manifest = Path(manifest).expanduser().resolve()
    approved = {}
    for key, asset in json.loads(manifest.read_text())["assets"].items():
        if not isinstance(asset, dict) or asset.get("approved") is not True or asset.get("kind") not in kinds:
            continue
        if not all(isinstance(asset.get(k), str) and asset[k].strip()
                   for k in ("license", "source", "sha256", "evidence", "path")):
            continue
        if not LICENSE.fullmatch(asset["license"].strip()):
            continue
        if asset["kind"] == "music" and asset.get("instrumental") is not True:
            continue
        if Path(asset["path"]).is_absolute() or ".." in Path(asset["path"]).parts:
            continue
        path = (manifest.parent / asset["path"]).resolve()
        if asset["kind"]=="music" and path.suffix.lower() not in (".wav",".mp3",".m4a",".aac",".ogg",".flac"):
            continue
        if not path.is_relative_to(manifest.parent) or not path.is_file():
            continue
        try:
            with path.open("rb") as handle:
                if hashlib.file_digest(handle, "sha256").hexdigest() != asset["sha256"].lower():
                    continue
        except OSError:
            continue
        raw_tags = asset.get("tags", [])
        tags = re.findall(r"\w+", raw_tags) if isinstance(raw_tags,str) else raw_tags if isinstance(raw_tags,list) else []
        approved[key] = dict(asset, path=path, id=key, title=asset.get("title", key), tags=[str(t) for t in tags])
    return approved


def select(manifest, query, kinds, used=(), minimum=.4):
    q = tokens(query)
    ranked = []
    for key, asset in approved_candidates(manifest, kinds).items():
        if key in used:
            continue
        tags = tokens(str(asset.get("tags", "")) + " " + str(asset.get("description", "")))
        score = len(q & tags) / max(1, len(q))
        if score >= minimum:
            ranked.append((score, key, dict(asset, path=str(asset["path"]), relevance=score)))
    return sorted(ranked, key=lambda item: (-item[0], item[1]))[0][2] if ranked else None


def automatic_music(manifest, scenes, script, duration, bible=None):
    """Choose an approved instrumental bed from mood, pace and narration density."""
    creative=(bible or {}).get("creative",bible or {})
    art=(bible or {}).get("art",{})
    mood = " ".join(str(creative.get(k, "")) for k in ("tone", "mood", "emotional_arc", "pacing", "motion_language"))
    mood += " " + str(art.get("lighting",""))
    mood += " " + " ".join(str(scene.get(k, "")) for scene in scenes for k in ("mood", "lighting", "spoken_text", "template"))
    text = tokens(mood)
    dense = len(script.split()) * 60 / max(duration, 1) > 145
    desired = {"ambient", "minimal", "restrained"} if dense else {"technology", "ambient", "steady"}
    if text & {"tense", "dramatic", "breach", "risk", "danger"}:
        desired |= {"tense", "cinematic"}
    if text & {"celebrate", "breakthrough", "exciting", "uplifting", "energetic"}:
        desired |= {"uplifting", "energetic"}
    ranked = []
    for key, asset in approved_candidates(manifest, MUSIC).items():
        tags = tokens(" ".join(asset["tags"]) + " " + str(asset.get("description","")))
        fit = len(tags & desired)
        if not fit:
            continue
        bpm = asset.get("bpm")
        suitable_tempo = type(bpm) in (int,float) and (55 <= bpm <= 110 if dense else 65 <= bpm <= 145)
        seconds = asset.get("duration_seconds")
        suitable_length = type(seconds) in (int,float) and seconds >= duration
        ranked.append((-(fit*3 + suitable_tempo + suitable_length), key, dict(asset,path=str(asset["path"]))))
    return min(ranked)[2] if ranked else None



def authorized_music(manifest, explicit):
    requested=Path(explicit).expanduser().resolve()
    for item in approved_candidates(manifest,MUSIC).values():
        if item["path"]==requested:
            return dict(item,path=str(requested))
    raise ValueError("Explicit music must match an approved instrumental asset in the manifest")

def music_bed(index, duration, gain=.16):
    return [
        f"[{index}:a]aresample=48000,volume={gain},afade=t=in:st=0:d=0.35,"
        f"afade=t=out:st={max(0,duration-.65)}:d=0.65[bed]",
        "[bed][side]sidechaincompress=threshold=0.018:ratio=10:attack=12:release=350[music]",
    ]
