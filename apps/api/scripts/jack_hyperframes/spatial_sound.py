def synchronize(plan, spatial, sounds):
    """Keep existing cues, add sparse accents to actual object entrances."""
    occupied=[e["frame"] for s in plan["shots"] for e in s["events"] if e["sfx"]!="none"]
    for s in plan["shots"]:
        for o in spatial["objects"]:
            if o["kind"] not in ("stat","panel","terminal","media") or not s["start_frame"]<=o["start"]<s["end_frame"]:
                continue
            frame=max(s["start_frame"],o["start"]+3)
            key={"stat":"soft_impact","panel":"comic_pop","terminal":"interface_click","media":"short_whoosh"}[o["kind"]]
            if frame<s["end_frame"] and key in sounds and all(abs(frame-f)>=30 for f in occupied):
                s["events"].append({"frame":frame,"type":"pulse","sfx":key})
                occupied.append(frame)
        s["events"].sort(key=lambda e:e["frame"])
