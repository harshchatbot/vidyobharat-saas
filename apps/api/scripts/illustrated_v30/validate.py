"""Fail-closed validator for RangManch illustrated v3.0 storyboard."""
from __future__ import annotations

import json
from pathlib import Path

ACTORS = {"founder", "critic_hook", "critic_story", "critic_visuals", "critic_cta", "critic_trust"}
POSES = {"neutral", "happy", "angry", "thinking", "worried", "out"}
PROPS = {"stage_sign", "ticker_live", "idea_card", "chat_ui", "speech_bubble", "stat_card", "fix_board", "comment_box", "envelope", "calculator", "register", "prompt_card"}
EVENTS = {"stamp", "type_text", "counter", "shake", "pop", "confetti"}
SFX = {"whoosh", "pop", "stamp", "type_tick", "ding", "buzz", "paper_flip", "confetti"}
ROLES = ["hook", "setup", "proof", "reveal", "demo", "resolution", "cta"]
ENTRANCES = {"slide_up", "pop", "drop_in", "slide_left", "fade", "none"}


def words(s: str) -> int:
    return len(s.split())


def validate(doc: dict) -> dict:
    if doc.get("schema") != "rangmanch_illustrated_v30" or str(doc.get("version")) != "3.0":
        raise ValueError("Not a RangManch illustrated v3.0 storyboard")
    if doc.get("fps") != 30 or doc.get("width") != 1080 or doc.get("height") != 1920:
        raise ValueError("Expected 1080x1920 at 30fps")
    if doc.get("needs_review") is not True or doc.get("ready_to_publish") is not False:
        raise ValueError("Review and publishing gates must be locked")
    duration = doc.get("duration_seconds")
    if not isinstance(duration, (int, float)) or not 15 <= duration <= 30 or duration * 30 != int(duration * 30):
        raise ValueError("Duration must be 15-30 seconds, frame aligned")
    beats = doc.get("beats")
    if not isinstance(beats, list) or not beats:
        raise ValueError("No beats")
    cursor, roles, ids, sfx_total, events_total = 0, [], set(), 0, 0
    for beat in beats:
        bid = beat.get("id")
        if not isinstance(bid, str) or not bid or bid in ids:
            raise ValueError("Missing/duplicate beat ID")
        ids.add(bid)
        start, end, count = (beat.get(k) for k in ("start_frame", "end_frame", "duration_frames"))
        if not all(type(v) is int for v in (start, end, count)) or not 45 <= count <= 105 or start != cursor or end != start + count:
            raise ValueError(f"{bid}: frame counts invalid or discontinuous")
        cursor = end
        role = beat.get("role")
        if role not in ROLES:
            raise ValueError(f"{bid}: invalid story role")
        roles.append(role)
        h, c = beat.get("headline", {}), beat.get("caption", {})
        if not isinstance(h.get("text"), str) or not 1 <= words(h["text"]) <= 5:
            raise ValueError(f"{bid}: headline exceeds five words")
        if not isinstance(h.get("emphasis_word"), str) or h["emphasis_word"].lower() not in h["text"].lower():
            raise ValueError(f"{bid}: emphasis word absent")
        if not isinstance(c.get("text"), str) or not 1 <= words(c["text"]) <= 7:
            raise ValueError(f"{bid}: caption exceeds seven words")
        if h["text"].strip().casefold() == c["text"].strip().casefold():
            raise ValueError(f"{bid}: repetitive headline/caption")
        stagger = c.get("stagger_frames")
        if type(stagger) is not int or not 3 <= stagger <= 5 or words(c["text"]) * 8 > count:
            raise ValueError(f"{bid}: caption is unreadable")
        highlights = c.get("highlight_words")
        if not isinstance(highlights, list) or not 1 <= len(highlights) <= 2 or any(not isinstance(t, str) or t.lower().strip('.,!?') not in c["text"].lower().replace('.', '').replace('?', '').replace('!', '').replace(',', '').split() for t in highlights):
            raise ValueError(f"{bid}: caption highlight words invalid")
        stage = beat.get("stage")
        if not isinstance(stage, dict) or not isinstance(stage.get("actors"), list) or not isinstance(stage.get("props"), list):
            raise ValueError(f"{bid}: missing stage")
        actors = stage["actors"]
        group_shot = role == "hook" and len(actors) == 6 and {a.get("id") for a in actors} == ACTORS
        if len(actors) > 3 and not group_shot:
            raise ValueError(f"{bid}: too many actors")
        for actor in actors:
            if (actor.get("id") not in ACTORS or actor.get("pose") not in POSES
                    or not isinstance(actor.get("x"), (int, float)) or not 0.05 <= actor["x"] <= .95
                    or actor.get("enter", "none") not in ENTRANCES):
                raise ValueError(f"{bid}: invalid actor")
        for prop in stage["props"]:
            if prop.get("id") not in PROPS or prop.get("enter", "none") not in ENTRANCES:
                raise ValueError(f"{bid}: unknown prop or entrance")
            if prop.get("text") is not None and (not isinstance(prop["text"], str) or len(prop["text"]) > 100):
                raise ValueError(f"{bid}: invalid prop text")
        events = beat.get("events", [])
        sfx = beat.get("sfx", [])
        if not events or not sfx:
            raise ValueError(f"{bid}: must have visible events and SFX")
        for event in events:
            frame = event.get("at_frame")
            if type(frame) is not int or not 0 <= frame < count or event.get("type") not in EVENTS:
                raise ValueError(f"{bid}: invalid event time/type")
            target = event.get("target")
            if target not in ACTORS | PROPS | {"stage"}:
                raise ValueError(f"{bid}: invalid event target {target}")
            if event["type"] == "counter":
                value = event.get("value")
                if (not isinstance(value, dict) or value.get("illustrative") is not True
                        or not all(isinstance(value.get(k), (int, float)) for k in ("from", "to"))):
                    raise ValueError(f"{bid}: numerical counters require explicit illustrative flag")
        for sound in sfx:
            if sound.get("id") not in SFX or type(sound.get("at_frame")) is not int or not 0 <= sound["at_frame"] < count:
                raise ValueError(f"{bid}: invalid SFX")
        # Every beat must have an actual SFX aligned to an on-screen event.
        if not any(abs(e["at_frame"] - fx["at_frame"]) <= 2 for e in events for fx in sfx):
            raise ValueError(f"{bid}: missing synchronized event sound")
        events_total += len(events)
        sfx_total += len(sfx)
    if cursor != duration * 30:
        raise ValueError("Total beat frames do not equal duration")
    # Fixed narrative order; multiple demo beats allowed.
    rank = [ROLES.index(r) for r in roles]
    if roles[0] != "hook" or roles[-1] != "cta" or rank != sorted(rank) or not {"setup", "proof", "reveal", "demo", "resolution"}.issubset(set(roles)):
        raise ValueError("Story arc missing or unordered")
    cta = beats[-1]
    if not any(e["type"] == "type_text" and e["target"] == "comment_box" and isinstance(e.get("value"), str) and 1 <= len(e["value"]) <= 8 and e["value"].isupper() for e in cta["events"]):
        raise ValueError("CTA needs comment_box uppercase keyword")
    if not any(p["id"] == "envelope" for p in cta["stage"]["props"]):
        raise ValueError("CTA needs envelope")
    return {"schema": doc["schema"], "valid": True, "frames": cursor,
            "beats": len(beats), "events": events_total, "sfx": sfx_total,
            "publish_gate": "blocked_review_required"}


def load_and_validate(path: Path) -> tuple[dict, dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc, validate(doc)
