"""Disk cache for real provider responses (makes demo re-runs free and offline)."""

import hashlib
import json
from pathlib import Path
from typing import Any


def key(*parts: Any) -> str:
    blob = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:32]


def get(root: Path, namespace: str, k: str) -> Any | None:
    path = root / namespace / f"{k}.json"
    return json.loads(path.read_text()) if path.exists() else None


def put(root: Path, namespace: str, k: str, value: Any) -> None:
    path = root / namespace / f"{k}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1))
    tmp.replace(path)
