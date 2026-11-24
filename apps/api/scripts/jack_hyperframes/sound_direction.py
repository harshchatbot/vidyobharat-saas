"""Deterministic visual-event sound scheduling with minimum cue spacing."""
def direct_sound(shots,sounds):
    aliases={"whip":"short_whoosh","glitch":"glitch_tick","zoom":"short_whoosh","light":"sparkle"}
    last=-100
    for shot in shots:
        start,end=shot["start_frame"],shot["end_frame"]
        cues=list(shot["events"])
        cue=aliases.get(shot.get("transition"))
        if not cue and shot.get("typography")=="word_slam": cue="soft_impact"
        if cue in sounds: cues.append({"frame":start+2,"type":"pulse","sfx":cue})
        if shot["template"]=="workflow":
            for i in range(len(shot["items"])):
                frame=start+round((.15+i*.22)*30)
                if "interface_click" in sounds: cues.append({"frame":frame,"type":"pulse","sfx":"interface_click"})
        if shot["template"]=="reaction" and "comic_pop" in sounds:
            cues.append({"frame":start+4,"type":"pulse","sfx":"comic_pop"})
        kept=[]
        for event in sorted(cues,key=lambda e:e["frame"]):
            if event["sfx"]=="none": kept.append(event);continue
            if start<=event["frame"]<end and event["frame"]-last>=6 and event["sfx"] in sounds:
                kept.append(event);last=event["frame"]
        shot["events"]=kept
