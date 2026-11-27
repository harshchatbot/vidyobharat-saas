def synchronize(plan, spatial, sounds):
    """Keep existing cues, add sparse accents to actual object entrances."""
    cta=spatial.get("cta")
    if cta:
        for shot in plan["shots"]:
            for frame,key in ((cta["start"],"interface_click"),(cta["start"]+len(cta["keyword"])*2+8,"paper_swipe")):
                if shot["start_frame"]<=frame<shot["end_frame"] and key in sounds:
                    shot["events"]=[e for e in shot["events"] if e["sfx"]=="none" or abs(e["frame"]-frame)>=15]
                    shot["events"].append({"frame":frame,"type":"pulse","sfx":key})
            shot["events"].sort(key=lambda e:e["frame"])
    occupied=[e["frame"] for s in plan["shots"] for e in s["events"] if e["sfx"]!="none"]
    for s in plan["shots"]:
        for o in spatial["objects"]:
            if o["kind"] not in ("stat","panel","terminal","media") or not s["start_frame"]<=o["start"]<s["end_frame"]:
                continue
            frame=max(s["start_frame"],o["start"]+1)
            key={"stat":"soft_impact","panel":"comic_pop","terminal":"interface_click","media":"short_whoosh"}[o["kind"]]
            if frame<s["end_frame"] and key in sounds and all(abs(frame-f)>=30 for f in occupied):
                s["events"].append({"frame":frame,"type":"pulse","sfx":key})
                occupied.append(frame)
        s["events"].sort(key=lambda e:e["frame"])

    # Prefer semantic library variants when their approved IDs describe the cue.
    import re
    families={"soft_impact":("impact","hit","thump"),"comic_pop":("pop","bubble"),"interface_click":("click","tap","button"),"short_whoosh":("whoosh","swoosh","swipe"),"digital_ping":("ping","chime"),"sparkle":("sparkle","shimmer"),"riser":("riser","rise")}
    synthetic={"soft_impact","deep_hit","short_whoosh","paper_swipe","digital_ping","glitch_tick","interface_click","comic_pop","comic_drop","riser","sparkle","shutter"}
    recent=[]
    last=-100
    for shot in plan["shots"]:
        kept=[]
        for e in shot["events"]:
            key=e["sfx"]
            if key=="none":
                kept.append(e)
                continue
            if e["frame"]-last<15: continue
            terms=families.get(key,())
            candidates=sorted(k for k in sounds if k not in synthetic and any(t in re.split(r"[^a-z]+",k.lower()) for t in terms))
            fresh=[k for k in candidates if k not in recent[-3:]]
            if fresh: key=fresh[0]
            elif candidates: key=min(candidates,key=lambda k:recent.count(k))
            if recent[-2:]==[key,key]: continue
            kept.append({**e,"sfx":key})
            recent.append(key)
            last=e["frame"]
        shot["events"]=kept
