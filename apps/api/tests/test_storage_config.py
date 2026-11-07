"""Isolated configuration checks; no provider calls or application data."""

import os
import subprocess
import sys

import pytest


@pytest.mark.parametrize("vercel", ["1", "0", ""])
def test_storage_defaults(vercel):
    # A new interpreter also checks the import-time selection used by main.py.
    env = os.environ.copy()
    env["VERCEL"] = vercel
    for name in list(env):
        if name.lower() in {"data_dir", "cache_dir"}:
            del env[name]
    subprocess.run(
        [sys.executable, "-c", """
import os
from pathlib import Path
from viraleat_api.config import ROOT, Settings
settings = Settings(_env_file=None)
root = Path('/tmp/viraleat') if os.environ['VERCEL'] == '1' else ROOT
assert settings.data_dir == root / 'data'
assert settings.cache_dir == root / 'cache'
"""],
        env=env,
        check=True,
    )


def test_explicit_paths_and_api_startup(monkeypatch, tmp_path):
    from viraleat_api import cache, config

    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CACHE_DIR", str(tmp_path / "cache"))
    settings = config.Settings(_env_file=None)
    assert settings.data_dir == tmp_path / "data"
    assert settings.cache_dir == tmp_path / "cache"
    monkeypatch.setattr(config, "get_settings", lambda: settings)

    # Execute the entrypoint independently of other tests' main module imports.
    import runpy
    from fastapi.testclient import TestClient

    main = runpy.run_module("viraleat_api.main")
    with TestClient(main["app"]) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/analyses").json() == []
    assert (settings.data_dir / "analyses").is_dir()
    assert (settings.data_dir / "sources").is_dir()
    cache.put(settings.cache_dir, "synthetic", "test", {"fixture": True})
    assert cache.get(settings.cache_dir, "synthetic", "test") == {"fixture": True}
