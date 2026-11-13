"""Write the claims UI's fixtures: each sample claim as the UI receives it.

The fixtures let you build and check the claim screens at
http://localhost:3000/?fixture=CLM-2026-847291 without a call. They are the
same masked view the agent sends after verification. Rerun this whenever the
records in kb-data/claims/ or claims.to_client_view change.

Usage: .venv/bin/python scripts/export_claim_fixtures.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from claims import parse_claim, to_client_view  # noqa: E402

OUT = ROOT / "client" / "src" / "fixtures" / "claims.json"

views = {
    path.stem: to_client_view(parse_claim(path.read_text()))
    for path in sorted((ROOT / "kb-data" / "claims").glob("CLM-*.txt"))
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(views, indent=1, ensure_ascii=False) + "\n")
print(f"Wrote {len(views)} claims to {OUT.relative_to(ROOT)}")
