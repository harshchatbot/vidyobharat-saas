"""Compile the normal JACK object storyboard into deterministic renderer tracks."""
import math

from capabilities import REGISTRY, validate_action, validate_scene

DYNAMIC = {"move", "assemble", "disassemble", "rotate", "unlock", "transform", "path",
           "data_flow", "dissolve", "reassemble", "explode", "stagger"}
RENDER_OPTION_BOUNDS = {
    "caption_left": (60, 360), "caption_width": (480, 960), "caption_bottom": (80, 420),
    "title_scale": (.6, 1.1), "exposure": (.25, 1.5), "subject_offset_x": (-3, 3),
    "camera_jump_x": (-8, 8), "camera_jump_scene": (0, 100),
}


def _validate_render_options(options):
    if not isinstance(options, dict):
        raise ValueError("render_options must be an object")
    allowed = set(RENDER_OPTION_BOUNDS) | {"transition_flash", "audio_gain_db", "audio_cue_offsets_ms", "restored_assets", "visibility_lead_in"}
    if set(options) - allowed:
        raise ValueError("Unsupported render option")
    for key, bounds in RENDER_OPTION_BOUNDS.items():
        if key in options and (not isinstance(options[key], (int, float)) or not bounds[0] <= options[key] <= bounds[1]):
            raise ValueError("Render option outside safe bounds: " + key)
    if "transition_flash" in options and type(options["transition_flash"]) is not bool:
        raise ValueError("transition_flash must be boolean")
    if "audio_gain_db" in options and (not isinstance(options["audio_gain_db"], (int, float)) or not -12 <= options["audio_gain_db"] <= 12):
        raise ValueError("audio_gain_db outside safe bounds")


def _scene_center(ids):
    if len(ids) == 1:
        return [0, 0, 0]
    slots = [(-1.55, .25, 0), (1.55, .25, 0), (-1.55, -1.2, -.3), (1.55, -1.2, -.3)]
    used = slots[:len(ids)]
    return [sum(point[index] for point in used) / len(used) for index in range(3)]


def _camera_pose(scene, center, phase):
    x, y, z = center
    offsets = {
        "static": (0, .5, 15), "dolly_in": (0, .55, 16 - 1.8 * phase),
        "pull_back": (0, .55, 13.5 + 2 * phase), "orbit": (-2.2 + 4.4 * phase, .8, 17.7),
        "pan_left": (2.2 - 2.8 * phase, .6, 15), "pan_right": (-2.2 + 2.8 * phase, .6, 15),
        "track": (-1.8 + 3.6 * phase, .45, 14.5), "crane": (0, 2.2 - 1.6 * phase, 15.3),
    }
    dx, dy, dz = offsets[scene["camera"]]
    return [x + dx, y + dy, z + dz]


def compile_camera(scenes, options=None):
    """Compile stable scene anchors. Visible bounds never drive camera placement."""
    options = options or {}
    keys = []
    previous = None
    for index, scene in enumerate(scenes):
        center = _scene_center(scene["active_ids"])
        start = _camera_pose(scene, center, 0)
        end = _camera_pose(scene, center, 1)
        if previous is not None and scene["transition"] in ("continuous", "match_cut"):
            start = previous[:]
        keys.append({"frame": scene["start_frame"], "position": start, "look_at": center, "fov": 42})
        if options.get("camera_jump_x") and index == int(options.get("camera_jump_scene", 1)) and scene["end_frame"]-scene["start_frame"]>3:
            jumped = start[:]; jumped[0] += options["camera_jump_x"]
            keys.extend([{"frame": scene["start_frame"]+1, "position": jumped, "look_at": center, "fov": 42},
                         {"frame": scene["start_frame"]+2, "position": start, "look_at": center, "fov": 42}])
        keys.append({"frame": scene["end_frame"] - 1, "position": end, "look_at": center, "fov": 42})
        previous = end
    return keys


def sample_camera(keys, frame):
    if frame <= keys[0]["frame"]:
        return dict(keys[0])
    if frame >= keys[-1]["frame"]:
        return dict(keys[-1])
    for left, right in zip(keys, keys[1:]):
        if left["frame"] <= frame <= right["frame"]:
            span = max(1, right["frame"] - left["frame"])
            amount = (frame - left["frame"]) / span
            amount = amount * amount * (3 - 2 * amount)
            return {"frame": frame,
                    "position": [a + (b - a) * amount for a, b in zip(left["position"], right["position"])],
                    "look_at": [a + (b - a) * amount for a, b in zip(left["look_at"], right["look_at"])],
                    "fov": left["fov"] + (right["fov"] - left["fov"]) * amount}
    raise ValueError("Camera frame is outside its track")


def _derived(action, previous):
    spread = previous["spreadTo"] if previous else (1 if action["action"] in ("assemble", "reassemble") else 0)
    rotation = previous["rotationTo"] if previous else 0
    morph = previous["morphTo"] if previous else 0
    flow = previous["flowTo"] if previous else 0
    particle = previous["particleTo"] if previous else 0
    stagger = previous["staggerTo"] if previous else 0
    name = action["action"]
    return {
        "spreadFrom": spread,
        "spreadTo": 1 if name in ("disassemble", "explode", "dissolve") else 0 if name in ("assemble", "reassemble") else spread,
        "rotationFrom": rotation,
        "rotationTo": rotation + math.tau if name == "rotate" else rotation + math.pi / 2 if name == "unlock" else rotation,
        "morphFrom": morph, "morphTo": 1 - morph if name == "transform" else morph,
        "flowFrom": flow, "flowTo": flow + 1 if name in ("data_flow", "path") else flow,
        "particleFrom": particle, "particleTo": 1 if name == "dissolve" else 0 if name == "reassemble" else particle,
        "staggerFrom": stagger, "staggerTo": 1 - stagger if name == "stagger" else stagger,
        "pathArc": .8 if name == "path" else 0,
        "anticipation": .14 if name in DYNAMIC else 0,
        "followThrough": .1 if name in DYNAMIC else 0,
    }


def compile_motion(plan):
    if plan["fps"] != 30 or not 0 < plan["total_frames"] <= 2700:
        raise ValueError("Expected 30fps, max 90 seconds")
    render_options = plan.get("render_options", {})
    _validate_render_options(render_options)
    objects = {item["id"]: dict(item, tracks=[]) for item in plan["objects"]}
    if len(objects) != len(plan["objects"]):
        raise ValueError("Duplicate object")
    cursor = 0
    scenes = []
    for sequence in plan["sequences"]:
        if sequence["start_frame"] != cursor or not cursor < sequence["end_frame"] <= plan["total_frames"]:
            raise ValueError("Invalid sequence coverage")
        validate_scene(sequence["camera"], sequence["transition"], sequence["lighting"])
        cursor = sequence["end_frame"]
        ids = list(dict.fromkeys(action["object_id"] for action in sequence["actions"]))
        if not ids or len(ids) > REGISTRY["max_objects"]:
            raise ValueError("Scene requires one to four objects")
        scene = {key: sequence[key] for key in ("title", "spoken_text", "start_frame", "end_frame", "camera", "transition", "lighting")}
        scene.update(active_ids=ids, primary_id=max(ids, key=lambda oid: sum(
            action["end_frame"] - action["start_frame"] for action in sequence["actions"] if action["object_id"] == oid)))
        scenes.append(scene)
        for action in sequence["actions"]:
            if action["object_id"] not in objects:
                raise ValueError("Unknown object")
            item = objects[action["object_id"]]
            validate_action(item["kind"], action["action"])
            if not scene["start_frame"] <= action["start_frame"] < action["end_frame"] <= cursor:
                raise ValueError("Invalid action bounds")
            tracks = item["tracks"]
            previous = tracks[-1] if tracks else None
            if previous and (previous["end_frame"] > action["start_frame"] or any(
                    previous["to_" + key] != action["from_" + key] for key in ("position", "scale", "opacity"))):
                raise ValueError("Discontinuous track")
            tracks.append(dict(action, **_derived(action, previous), execution="renderer_v3"))
    if cursor != plan["total_frames"] or any(not item["tracks"] for item in objects.values()):
        raise ValueError("Incomplete plan")
    camera = compile_camera(scenes, render_options)
    return {"version": 3, "fps": 30, "total_frames": cursor, "background": plan["background"],
            "art_direction": plan.get("art_direction", {}), "render_options": render_options,
            "capabilities": REGISTRY, "objects": list(objects.values()), "scenes": scenes, "camera": camera,
            "limitations": ["Procedural illustrative geometry", "Particles are bounded to 48 points",
                            "Lighting and bloom use performance-aware approximations"]}


def preview(plan, seconds):
    import copy
    result = copy.deepcopy(plan)
    end = min(result["total_frames"], round(seconds * 30))
    if end < 1:
        raise ValueError("Empty preview")
    result["total_frames"] = end
    result["scenes"] = [dict(scene, end_frame=min(scene["end_frame"], end))
                        for scene in result["scenes"] if scene["start_frame"] < end]
    result["camera"] = [key for key in result["camera"] if key["frame"] < end]
    if result["camera"][-1]["frame"] != end - 1:
        result["camera"].append(sample_camera(plan["camera"], end - 1))
    return result


def diagnostics(plan):
    findings = []
    for index, scene in enumerate(plan["scenes"]):
        tracks = [track for item in plan["objects"] for track in item["tracks"]
                  if scene["start_frame"] <= track["start_frame"] < scene["end_frame"]]
        if all(track["action"] in ("hold", "reveal", "fade") for track in tracks):
            findings.append({"scene": index, "issue": "Limited choreography", "revision": "Add meaningful movement or transformation"})
        if scene["end_frame"] - scene["start_frame"] > 180:
            findings.append({"scene": index, "issue": "Long scene", "revision": "Consider shorter visual beats"})
    return {"findings": findings, "status": "advisory_not_creative_approval"}
