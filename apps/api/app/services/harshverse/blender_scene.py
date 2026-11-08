"""Headless Blender scene for original HarshVerse warm 3D motion.

Invoked only by blender_motion.py, through a narrow validated local JSON job.
This file is deliberately pure bpy + Python standard library. It uses no
downloaded meshes, rigs, textures, audio, online providers, or references.
All props are actual beveled 3D meshes with lighting, shadows and keyframes.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

C = {
    "cream": "#F8F3E9",
    "paper": "#FFFDF8",
    "charcoal": "#30302E",
    "peach": "#E7AB7E",
    "orange": "#CF8154",
    "dusty_blue": "#849DB0",
    "sage": "#A6B6A4",
    "sunflower": "#F0C976",
    "outline": "#E9E0D3",
    "rust": "#A7654A",
    "blue_dark": "#5B7789",
}


def color(value: str):
    value = value.lstrip("#")
    srgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # Convert sRGB to scene-linear for Blender material base colors.
    return tuple(
        c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
        for c in srgb
    ) + (1.0,)


def mat(name: str, hex_value: str, *, roughness: float = .65):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color(hex_value)
    m.use_nodes = True
    shader = m.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color(hex_value)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = 0.0
    return m


M = {}


def material(name: str):
    return M[name]


def parent_obj(obj, parent):
    if parent is not None:
        obj.parent = parent
    return obj


def container(name: str, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .15
    parent_obj(obj, parent)
    return obj


def block(name, center, dimensions, surface, *, radius=.13, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Soft rounded edges", "BEVEL")
    bevel.width = min(radius, min(dimensions) / 2.5)
    bevel.segments = 5
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(material(surface))
    return parent_obj(obj, parent)


def ball(name, center, radius, surface, *, parent=None, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12,
                                        radius=radius, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material(surface))
    for p in obj.data.polygons:
        p.use_smooth = True
    return parent_obj(obj, parent)


def text(name, value, position, size, surface, *, parent=None, align="CENTER"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = value[:54]
    curve.size = size
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.extrude = .008
    curve.bevel_depth = .002
    curve.bevel_resolution = 2
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.data.materials.append(material(surface))
    return parent_obj(obj, parent)


def rod(name, start, end, radius, surface, *, parent=None):
    a, b = Vector(start), Vector(end)
    center = (a + b) / 2
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius,
                                        depth=delta.length, location=center)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    o.data.materials.append(material(surface))
    return parent_obj(o, parent)


def ease_motion(obj, start_f: int, target_f: int, end_f: int,
                *, target_scale=(1, 1, 1), intro_location=None,
                final_location=None, leave_f=None):
    """Animate only a prop's own transform, preserving all child geometry."""
    base = Vector(final_location if final_location is not None else obj.location)
    off = Vector(intro_location if intro_location is not None
                 else (base.x, base.y - .32, base.z - .4))
    for frame, location, scale in (
        (max(1, start_f - 1), off, (0.001, 0.001, 0.001)),
        (max(1, start_f), off, (.55, .55, .55)),
        (max(1, target_f), base, target_scale),
        (max(target_f, end_f), base, target_scale),
    ):
        obj.location = location
        obj.scale = scale
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="scale", frame=frame)
    if leave_f is not None:
        obj.location = base
        obj.scale = (0.001, 0.001, 0.001)
        obj.keyframe_insert(data_path="location", frame=leave_f)
        obj.keyframe_insert(data_path="scale", frame=leave_f)
    if obj.animation_data and obj.animation_data.action:
        for curve in obj.animation_data.action.fcurves:
            for keyframe in curve.keyframe_points:
                keyframe.interpolation = "BEZIER"


def build_node(name, location, title, surface, *, family="card"):
    anchor = container(name, location)
    block(name + "_depth", (0, -.09, -.10), (2.32, 1.67, .38),
          "outline", radius=.18, parent=anchor)
    block(name + "_body", (0, 0, .12), (2.34, 1.62, .43),
          surface, radius=.16, parent=anchor)
    block(name + "_icon_plate", (-.63, .30, .39), (.72, .61, .09),
          "paper", radius=.10, parent=anchor)
    if family == "card":
        for i in range(3):
            block(f"{name}_line_{i}", (-.63, .42 - i * .15, .46),
                  (.45 - i * .06, .034, .017),
                  "dusty_blue", radius=.007, parent=anchor)
    elif family == "ai":
        ball(name + "_left_eye", (-.76, .32, .48), .07, "charcoal", parent=anchor)
        ball(name + "_right_eye", (-.50, .32, .48), .07, "charcoal", parent=anchor)
    text(name + "_label", title, (.20, -.28, .39), .38, "charcoal", parent=anchor)
    return anchor


def build_arrow(name, center):
    root = container(name, center)
    rod(name + "_stem", (-.32, 0, .23), (.24, 0, .23),
        .062, "orange", parent=root)
    rod(name + "_head_up", (.18, .19, .23), (.36, 0, .23),
        .054, "orange", parent=root)
    rod(name + "_head_down", (.18, -.19, .23), (.36, 0, .23),
        .054, "orange", parent=root)
    return root


def make_buddy(root):
    """Fully modeled original square companion, no 2D cutout or downloaded rig."""
    body = container("Buddy_body", (0, 0, 0), parent=root)
    block("Buddy_shell", (0, 0, .63), (1.44, 1.54, .54), "orange",
          radius=.22, parent=body)
    block("Buddy_screen", (0, .02, .95), (1.17, 1.17, .10), "paper",
          radius=.17, parent=body)
    for x in (-.29, .29):
        eye = ball("Buddy_eye", (x, .20, 1.06), .105, "charcoal", parent=body)
        eye.scale = (1, .90, .45)
        ball("Buddy_eye_glint", (x - .025, .25, 1.135), .026, "paper", parent=body)
        ball("Buddy_cheek", (x * 1.52, -.15, 1.065), .09, "peach", parent=body)
    block("Buddy_smile", (0, -.26, 1.04), (.26, .034, .024),
          "rust", radius=.01, parent=body)
    left_arm = container("Buddy_left_arm", (-.76, 0, .46), parent=body)
    right_arm = container("Buddy_right_arm", (.76, 0, .46), parent=body)
    for sign, arm in ((-1, left_arm), (1, right_arm)):
        rod(f"Buddy_arm_{sign}", (0, 0, 0),
            (sign * .37, -.16, -.18), .08, "orange", parent=arm)
        ball(f"Buddy_hand_{sign}", (sign * .42, -.18, -.19),
             .13, "peach", parent=arm)
        rod(f"Buddy_leg_{sign}", (sign * .37, -.64, .38),
            (sign * .37, -.88, .12), .09, "orange", parent=body)
        block(f"Buddy_foot_{sign}", (sign * .40, -.91, .11),
              (.36, .22, .13), "orange", parent=body)
    return body, left_arm, right_arm


def keyed_pose(body, left, right, start, end, fps):
    """Real 3D character animation: body bob, arm point/wave, subtle squash."""
    start_f = max(1, int(round(start * fps)) + 1)
    end_f = max(start_f + 1, int(round(end * fps)))
    for idx, t in enumerate((start, start + .24, start + .48, start + .75,
                             max(start + .78, end - .30), end)):
        t = min(t, end)
        frame = max(1, int(round(t * fps)) + 1)
        body.location.z = (.08 if idx in (1, 3) else 0)
        body.rotation_euler.z = (-.05 if idx == 1 else .04 if idx == 3 else 0)
        body.scale = (1.04, .96, .96) if idx == 2 else (1, 1, 1)
        for obj in (body,):
            obj.keyframe_insert("location", frame=frame)
            obj.keyframe_insert("rotation_euler", frame=frame)
            obj.keyframe_insert("scale", frame=frame)
        left.rotation_euler.z = -.25 if idx % 2 else 0
        right.rotation_euler.z = .72 if idx in (1, 2, 3) else 0
        left.keyframe_insert("rotation_euler", frame=frame)
        right.keyframe_insert("rotation_euler", frame=frame)


def build_sequence(seq, fps, index):
    start, end = float(seq["start"]), float(seq["end"])
    kind = seq["template"]
    root = container(f"Editorial_sequence_{index}")
    root.location.z = .01
    # Intro and exit maintain visual continuity; group stays alive over
    # all words assigned to this validated same-template narrative beat.
    first = max(1, round(start * fps) + 1)
    last = max(first + 1, round(end * fps))
    root.scale = (.001, .001, .001)
    root.keyframe_insert("scale", frame=max(1, first - 1))
    root.scale = (1, 1, 1)
    root.keyframe_insert("scale", frame=first)
    root.keyframe_insert("scale", frame=last)
    root.scale = (.001, .001, .001)
    root.keyframe_insert("scale", frame=last + 1)

    text(f"{kind}_section_{index}", {
        "data_flow": "HOW IT WORKS",
        "source_stack": "CONNECT THE IDEAS",
        "human_vs_ai": "HUMAN  +  AI",
        "keyword_card": "THE BIG IDEA",
    }[kind], (0, 3.44, .31), .47, "charcoal", parent=root)

    duration = end - start
    def timing(step):
        offset = min((step + 1) * .43, duration * (step + 1) / 4)
        entered = min(end - .14, start + offset)
        return (max(first, round(entered * fps) + 1),
                max(first + 1, round((min(end - .1, entered + .35)) * fps) + 1))

    def animate(prop, order):
        entrance, reached = timing(order)
        ease_motion(prop, entrance, reached, last - 1)

    if kind == "data_flow":
        for i,(x,title,tone) in enumerate((
            (-3.45,"INPUT","peach"),(0,"PATTERNS","dusty_blue"),
            (3.45,"OUTPUT","sage"),
        )):
            animate(build_node(f"Flow_{index}_{title}",(x,.15,0),title,tone),i)
            if i:
                animate(build_arrow(f"Flow_arrow_{index}_{i}",(x-1.71,.15,0)),i + .1)
    elif kind == "source_stack":
        for i, (title,tone) in enumerate((
            ("SOURCES","dusty_blue"),("SIGNALS","peach"),("CONTEXT","sage")
        )):
            x = -.60 + .32 * i
            y = 1.25 - 1.23 * i
            animate(build_node(f"Stack_{index}_{i}",(x,y,.02*i),title,tone),i)
    elif kind == "human_vs_ai":
        animate(build_node(f"Human_{index}",(-2.05,.10,0),"HUMAN","peach"),0)
        animate(build_node(f"AI_{index}",(2.05,.10,0),"AI","dusty_blue",family="ai"),1)
        animate(build_arrow(f"Comparison_{index}",(0,.10,0)),2)
    else:
        animate(build_node(f"Idea_{index}",(0,.35,0),"BIG IDEA","peach"),0)
        for i, x in enumerate((-2.2, 2.2)):
            ob = container(f"Floating_concept_{index}_{i}",(x,-1.6,.15))
            block(f"Concept_diamond_{i}",(0,0,0),(.42,.42,.44),"sunflower",
                  radius=.06,parent=ob)
            ob.rotation_euler.z = .78
            animate(ob,i+1)

    # Buddy has a coherent, repeatable appearance and motions for all templates.
    mascot = container(f"Buddy_rig_{index}", (4.50,-2.30,.15), parent=root)
    body, arm_l, arm_r = make_buddy(mascot)
    entered = max(first, int((start + min(.22, duration * .16)) * fps))
    ease_motion(mascot, entered, min(last - 1, entered + max(2,round(.20*fps))),
                last - 1)
    keyed_pose(body, arm_l, arm_r, start, end, fps)
    return root


def stage_background():
    block("Cream_base", (0,0,-.80), (30,26,.45), "cream", radius=.20)
    # Elevated paper stage creates measurable 3D depth and soft shadows.
    block("Editorial_backplate", (0,.1,-.32), (11.4,9.60,.45),
          "paper", radius=.31)
    block("Peach_accent", (-4.66,4.28,-.01), (.13,.68,.08),
          "orange",radius=.025)
    block("Header_bar", (0,4.40,-.02), (9.0,.025,.06),
          "outline",radius=.004)
    text("HarshVerse_mark", "HARSHVERSE  /  MOTION STUDIO",
         (-4.51, 4.65, .08), .20, "rust", align="LEFT")
    block("Caption_divider", (0,-4.02,.08), (10.6,.028,.045),
          "outline",radius=.009)
    # Avoid extra text in the caption-safe bottom 22% of the top panel.


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", type=Path, required=True)
    parser.add_argument("--frames", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    job = json.loads(args.job.read_text(encoding="utf-8"))
    if job.get("contract") != "harshverse-blender-3d-v1":
        raise ValueError("Unrecognized or unsafe Blender job contract")
    duration = float(job["duration"])
    fps = int(job["fps"])
    if not (0 < duration <= 60 and fps in (16, 30) and 0 < len(job["sequences"]) <= 12):
        raise ValueError("Untrusted Blender job dimensions or duration")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.data.materials.clear()
    for key, value in C.items():
        M[key] = mat(f"HV_{key}", value)

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = int(job["samples"])
    scene.render.resolution_x = int(job["width"])
    scene.render.resolution_y = int(job["height"])
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.fps = fps
    scene.frame_start = 1
    scene.frame_end = math.ceil(duration * fps)
    scene.render.filepath = str(args.frames.resolve() / "frame_")
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        scene.view_settings.view_transform = "Standard"
    scene.world.color = color(C["cream"])

    bpy.ops.object.camera_add(location=(0,-2.1,19.3))
    camera = bpy.context.object
    direction = Vector((0,0,0)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z","Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.9
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(-3.8,-2.6,8.4))
    key = bpy.context.object
    key.name = "Warm_softbox"
    key.data.energy = 1150
    key.data.shape = "DISK"
    key.data.size = 10
    bpy.ops.object.light_add(type="AREA", location=(4.1,4.7,7.8))
    fill = bpy.context.object
    fill.name = "Cool_fill"
    fill.data.energy = 660
    fill.data.shape = "DISK"
    fill.data.size = 8
    stage_background()
    ordered = sorted(job["sequences"], key=lambda s: s["start"])
    for i, sequence in enumerate(ordered):
        if sequence["template"] not in ("data_flow","source_stack","human_vs_ai","keyword_card"):
            raise ValueError("Invalid template in Blender render job")
        build_sequence(sequence,fps,i)
    args.frames.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
