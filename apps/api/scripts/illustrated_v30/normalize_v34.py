"""Conservative compiler for AI-authored storyboard event timing.

Normalizes *unambiguous* formatting defects, never silently replaces unsupported
actions or missing creative content. The strict validator remains authoritative.
"""
from __future__ import annotations

import copy

from validate import EVENTS, SFX


def _integer(value):
    # Accept JSON integer values and their unambiguous string/float equivalents.
    if type(value) is int:
        return value
    if type(value) is float and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _relative_frame(raw, beat, label, changes):
    n = _integer(raw)
    if n is None:
        raise ValueError(f"{beat['id']}: {label} frame {raw!r} is not an integer")
    count = beat["duration_frames"]
    start = beat["start_frame"]
    if 0 <= n < count:
        return n
    # AI frequently writes an absolute timeline position instead of
    # the contract's beat-relative position.
    if start <= n < start + count:
        result = n - start
        changes.append(f"{beat['id']} {label}: absolute frame {n} -> relative {result}")
        return result
    raise ValueError(
        f"{beat['id']}: {label} frame {n} outside relative [0,{count-1}] "
        f"and absolute [{start},{start+count-1}]"
    )


def normalize_storyboard(doc: dict) -> tuple[dict, list[str]]:
    """Return independent copy and audit trail. Never invent event types or SFX."""
    if not isinstance(doc, dict):
        raise ValueError("Storyboard must be an object")
    result = copy.deepcopy(doc)
    changes: list[str] = []
    beats = result.get("beats")
    if not isinstance(beats, list):
        raise ValueError("Storyboard beats must be a list")
    for beat in beats:
        if not isinstance(beat, dict) or not isinstance(beat.get("id"), str):
            raise ValueError("Storyboard beat must be a named object")
        if any(type(beat.get(k)) is not int for k in
               ("start_frame", "end_frame", "duration_frames")):
            raise ValueError(f"{beat['id']}: invalid beat frame range")
        for kind, key, allowed in (("event", "events", EVENTS), ("sfx", "sfx", SFX)):
            entries = beat.get(key)
            if not isinstance(entries, list):
                raise ValueError(f"{beat['id']}: {key} must be an array")
            for idx, entry in enumerate(entries):
                if not isinstance(entry, dict):
                    raise ValueError(f"{beat['id']}: {kind} {idx} must be an object")
                name_key = "type" if kind == "event" else "id"
                name = entry.get(name_key)
                if name not in allowed:
                    raise ValueError(
                        f"{beat['id']}: unsupported {kind} {name_key}={name!r}; "
                        f"allowed={sorted(allowed)}"
                    )
                old = entry.get("at_frame")
                new = _relative_frame(old, beat, f"{kind} {idx}", changes)
                if type(old) is not int or old != new:
                    if new == old:
                        changes.append(
                            f"{beat['id']} {kind} {idx}: converted frame to integer {new}"
                        )
                    entry["at_frame"] = new
    return result, changes
