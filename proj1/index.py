"""Vercel entrypoint for GrowRev FastAPI app."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from growrev.web_app import app  # noqa: E402, F401
