"""Load .env from common locations (project root, backend dir, cwd)."""

from __future__ import annotations

from pathlib import Path


def load_project_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    backend = Path(__file__).resolve().parent
    root = backend.parent
    paths = (
        root / ".env",
        root / ".env.local",
        backend / ".env",
        backend / ".env.local",
        Path.cwd() / ".env",
    )

    for path in paths:
        if path.is_file():
            load_dotenv(path, override=True, encoding="utf-8")
