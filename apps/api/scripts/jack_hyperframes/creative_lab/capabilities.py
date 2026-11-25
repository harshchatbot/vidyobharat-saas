import json
from pathlib import Path
REGISTRY=json.loads(Path(__file__).with_name("capabilities.json").read_text())
KINDS=tuple(REGISTRY["kinds"])
ACTIONS=tuple(REGISTRY["actions"])
def validate_action(kind,action):
    if kind not in KINDS or action not in ACTIONS or (action=="unlock" and kind!="key"):
        raise ValueError("Unsupported geometry/action: "+kind+"/"+action)
