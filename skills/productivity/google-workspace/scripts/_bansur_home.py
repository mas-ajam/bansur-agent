"""Resolve BANSUR_HOME for standalone skill scripts.

Skill scripts may run outside the Bansur process (e.g. system Python,
nix env, CI) where ``bansur_constants`` is not importable.  This module
provides the same ``get_bansur_home()`` and ``display_bansur_home()``
contracts as ``bansur_constants`` without requiring it on ``sys.path``.

When ``bansur_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``bansur_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``BANSUR_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from bansur_constants import display_bansur_home
    from bansur_constants import get_bansur_home
except (ModuleNotFoundError, ImportError):

    def get_bansur_home() -> Path:
        """Return the Bansur home directory (default: ~/.bansur).

        Mirrors ``bansur_constants.get_bansur_home()``."""
        val = os.environ.get("BANSUR_HOME", "").strip()
        return Path(val) if val else Path.home() / ".bansur"

    def display_bansur_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``bansur_constants.display_bansur_home()``."""
        home = get_bansur_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
