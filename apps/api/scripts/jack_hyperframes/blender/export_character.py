"""Run inside Blender with --python export_character.py -- --input model.blend --output model.glb."""
import argparse
import json
import sys
from pathlib import Path
import bpy

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True)
    p.add_argument("--output",required=True)
    p.add_argument("--mouth-morph",default="mouth_open")
    p.add_argument("--idle-action",default="idle")
    a=p.parse_args(sys.argv[sys.argv.index("--")+1:])
    src=Path(a.input).expanduser().resolve()
    out=Path(a.output).expanduser().resolve()
    if out.exists() or out.suffix.lower()!=".glb":
        raise ValueError("Choose a new GLB output path")
    bpy.ops.wm.open_mainfile(filepath=str(src))
    rigs=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    if not rigs or not meshes:
        raise ValueError("Character requires a mesh and armature")
    if not any(m.type=="ARMATURE" and m.object in rigs for o in meshes for m in o.modifiers):
        raise ValueError("No mesh bound to character armature")
    morphs=sorted({k.name for o in meshes if o.data.shape_keys for k in o.data.shape_keys.key_blocks})
    actions=sorted(x.name for x in bpy.data.actions)
    if a.mouth_morph not in morphs or a.idle_action not in actions:
        raise ValueError("Missing required mouth morph or idle action")
    out.parent.mkdir(parents=True,exist_ok=True)
    result=bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_animations=True,export_skins=True,export_morph=True,export_animation_mode="ACTIONS")
    if "FINISHED" not in result or not out.is_file():
        raise RuntimeError("GLB export failed")
    import hashlib
    report={"path":str(out),"sha256":hashlib.sha256(out.read_bytes()).hexdigest(),"approved":False,"bones":sorted({b.name for r in rigs for b in r.data.bones}),"source_actions":actions,"morphs":morphs,"requires_runtime_validation":True}
    out.with_suffix(".report.json").write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
if __name__=="__main__":
    main()
