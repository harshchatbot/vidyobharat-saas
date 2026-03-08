from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _shared_config_path(relative_path: str) -> Path:
    return _repo_root() / relative_path


@lru_cache(maxsize=16)
def load_shared_json(relative_path: str) -> dict[str, Any]:
    path = _shared_config_path(relative_path)
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)
