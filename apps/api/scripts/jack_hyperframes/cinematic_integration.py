"""Opt-in RAG conceptual motion adapter. Never represents a real product demo."""
import re, json, subprocess, sys
from pathlib import Path

PHASES = [
    ("documents", r"\b(?:documents?|pdfs?|knowledge base|upload)\b", 0),
    ("chunking", r"\b(?:chunks?|chunking|split|fragment)\b", 2),
    ("vectors", r"\b(?:embeddings?|vectors?|semantic search)\b", 4),
    ("retrieval", r"\b(?:retriev\w*|relevant passages|search context)\b", 6),
    ("answer", r"\b(?:answer\w*|grounded response)\b", 8),
]

def select_scenes(shots, words):
    result=[]
    for i,shot in enumerate(shots):
        start,end=shot["start_frame"],shot["end_frame"]
        spoken=" ".join(w["word"] for w in words if start<=round(w["start"]*30)<end)
        if shot.get("product_asset","none")!="none" or shot["template"]=="github_reveal" or re.search(r"\bcomment\b",spoken,re.I): continue
        matches=[(m.start(),name,offset) for name,pattern,offset in PHASES if (m:=re.search(pattern,spoken,re.I))]
        if matches and end-start>=45:
            _,name,offset=min(matches)
            result.append({"shot":i,"start":start,"end":end,"phase":name,"offset":offset,"spoken":spoken})
    return result

def stage_cinematic(workspace, project, out, shots, words):
    scenes=select_scenes(shots,words)
    if not scenes: return []
    lab=out/"cinematic-lab"
    subprocess.run([sys.executable,str(Path(__file__).parent/"creative_lab"/"benchmark.py"),"--workspace",str(workspace),"--output",str(lab),"--version","3"],check=True)
    # Crop only the illustrative 3D stage, excluding lab headings and subtitles.
    target=project/"assets"/"jack-cinematic"/out.name
    target.mkdir(parents=True,exist_ok=False)
    for offset in sorted({s["offset"] for s in scenes}):
        folder=target/str(offset)
        folder.mkdir()
        subprocess.run(["ffmpeg","-v","error","-ss",str(offset),"-i",str(lab/"base.mp4"),"-t","2","-vf","crop=1080:1000:0:520,fps=15,scale=864:800","-an",str(folder/"%04d.jpg")],check=True)
        frames=sorted(folder.glob("*.jpg"))
        if not frames: raise ValueError("No cinematic frames for phase "+str(offset))
        for scene in scenes:
            if scene["offset"]==offset:
                scene["frames"]=[str(p.relative_to(project)) for p in frames]
    (out/"cinematic_scenes.json").write_text(json.dumps(scenes,indent=2))
    return scenes
