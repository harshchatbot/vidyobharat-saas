"""One executable capability registry shared by planning, compilation and rendering."""
import json
from pathlib import Path

REGISTRY = json.loads(Path(__file__).with_name("capabilities.json").read_text())
KINDS = tuple(REGISTRY["kinds"])
ACTIONS = tuple(REGISTRY["actions"])
CAMERAS = tuple(REGISTRY["cameras"])
TRANSITIONS = tuple(REGISTRY["transitions"])
LIGHTING = tuple(REGISTRY["lighting"])

KIND_ACTIONS = {
    "connector": {"hold", "reveal", "move", "scale", "fade", "rotate", "path", "data_flow", "dissolve", "reassemble"},
    "key": {"hold", "reveal", "move", "scale", "fade", "rotate", "path", "unlock", "dissolve", "reassemble"},
    "particle_field": {"hold", "reveal", "move", "scale", "fade", "path", "data_flow", "dissolve", "reassemble", "stagger"},
}


def validate_action(kind, action):
    if kind not in KINDS or action not in ACTIONS:
        raise ValueError("Unsupported geometry/action: " + kind + "/" + action)
    allowed = KIND_ACTIONS.get(kind)
    if allowed is not None and action not in allowed:
        raise ValueError("Unsupported geometry/action: " + kind + "/" + action)
    if action == "unlock" and kind != "key":
        raise ValueError("Unsupported geometry/action: " + kind + "/" + action)


def validate_scene(camera, transition, lighting):
    if camera not in CAMERAS:
        raise ValueError("Unsupported camera: " + camera)
    if transition not in TRANSITIONS:
        raise ValueError("Unsupported transition: " + transition)
    if not any(token in lighting.lower() for token in LIGHTING):
        raise ValueError("Lighting must name an executable preset")
