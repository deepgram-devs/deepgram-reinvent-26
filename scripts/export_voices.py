"""Write the claims UI's voice catalog: the languages and voices in voices.py.

The Settings panel's voice picker reads it, so the browser offers exactly the
voices the agent can switch to. Rerun this whenever voices.py changes;
tests/test_voices.py fails until you do.

Usage: .venv/bin/python scripts/export_voices.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from voices import client_catalog  # noqa: E402

OUT = ROOT / "client" / "src" / "lib" / "voices.json"

catalog = client_catalog()
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n")
print(f"Wrote {len(catalog['voices'])} voices to {OUT.relative_to(ROOT)}")
