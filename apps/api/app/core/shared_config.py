from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    current = Path(__file__).resolve()

    for parent in [current.parent, *current.parents]:
        if (parent / "apps" / "web" / "src" / "config").exists():
            return parent
        if (parent / "shared" / "config").exists():
            return parent
        if (parent / "pyproject.toml").exists():
            return parent

    return current.parents[2] if len(current.parents) > 2 else current.parent


def _shared_config_path(relative_path: str) -> Path:
    return _repo_root() / relative_path


@lru_cache(maxsize=16)
def load_shared_json(relative_path: str) -> dict[str, Any]:
    path = _shared_config_path(relative_path)
    if not path.exists():
        raise FileNotFoundError(f"Shared config not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)