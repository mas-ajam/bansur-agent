from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


def test_platform_modules_only_import_stdlib_and_bansur_platform() -> None:
    root = Path(__file__).resolve().parents[2]
    code = """
import sys
before = set(sys.modules)
import bansur_platform.host.facts
import bansur_platform.host.gpu_adapters
import bansur_platform.host.runtime
import bansur_platform.host.products
import bansur_platform.host.summary
import bansur_platform.declaration
import bansur_platform.resolver
import bansur_platform.resolver.app
import bansur_platform.resolver.availability
import bansur_platform.resolver.known_dirs
new_top_levels = {name.partition('.')[0] for name in set(sys.modules) - before}
unexpected = sorted(
    name
    for name in new_top_levels
    if name not in sys.stdlib_module_names and not name.startswith('bansur_platform')
)
assert not unexpected, unexpected
"""
    env = os.environ.copy()
    env["PYTHONPATH"] = "."

    subprocess.run(
        [sys.executable, "-c", code],
        cwd=root,
        env=env,
        check=True,
    )
