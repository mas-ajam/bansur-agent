"""Resolve BANSUR_HOME for standalone skill scripts.

Skill scripts may run outside the Bansur process (system Python, nix env,
CI) where ``bansur_constants`` is not importable.  This module provides the
same ``get_bansur_home()`` contract without requiring it on ``sys.path``.

When ``bansur_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from bansur_constants import get_bansur_home
except (ModuleNotFoundError, ImportError):

    def get_bansur_home() -> Path:
        """Return the Bansur home directory (default: ``~/.bansur``)."""
        val = os.environ.get("BANSUR_HOME", "").strip()
        return Path(val) if val else Path.home() / ".bansur"
