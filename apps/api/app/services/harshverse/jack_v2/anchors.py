"""Resolve narration anchors without rescaling semantic timing."""
import copy
import math

def resolve(plan, words, duration, fps=30):
    if not math.isfinite(duration) or duration <= 0 or fps != 30:
        raise ValueError("Invalid duration or fps")
    total = round(duration * fps)
    onsets = []
    previous = -1
    for w in words:
        s, e = float(w["start"]), float(w["end"])
        if not (math.isfinite(s) and math.isfinite(e) and 0 <= s <= e <= duration and s >= previous):
            raise ValueError("Invalid Whisper alignment")
        onsets.append(round(s * fps))
        previous = s
    result = copy.deepcopy(plan)
    shots = result["shots"]
    if not shots or not words:
        raise ValueError("Missing shots or words")
    indices = [s["anchor"]["from_word"] for s in shots]
    if indices[0] != 0 or any(type(i) is not int or not 0 <= i < len(words) for i in indices) or indices != sorted(set(indices)):
        raise ValueError("Invalid shot anchors")
    starts = [0] + [max(1, onsets[i]-2) for i in indices[1:]] + [total]
    errors = []
    for j, shot in enumerate(shots):
        a,b = starts[j:j+2]
        shot.update(start_frame=a,end_frame=b)
        if b <= a:
            errors.append(f"Shot {j}: empty frame interval")
        for event in shot.get("events", []):
            i = event["at"]["word"]
            if type(i) is not int or not indices[j] <= i < (indices[j+1] if j+1<len(indices) else len(words)):
                errors.append(f"Shot {j}: event outside semantic interval")
                continue
            f = onsets[i]
            if not a <= f < b:
                errors.append(f"Shot {j}: event outside frame interval")
            event["frame"] = f
    if errors:
        raise ValueError("; ".join(errors))
    result.update(needs_review=True,ready_to_publish=False,render_ready=False,publish_authorized=False)
    return result
