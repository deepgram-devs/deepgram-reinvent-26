"""Turn a claim record into what the agent may say and the claims UI shows.

parse_claim reads the sections of a claim file. to_client_view applies the
privacy rules, and it's the only view of a claim any model or screen gets:
spoken_view hands it to the LLMs, so neither can say what the screen hides.
"""

import json
import re
import unicodedata
from datetime import date

RECORD_TITLE = "Tri-County Insurance - Automobile Claim Record"

# "Coverage for Claim ID CLM-2026-847291:"
_SECTION = re.compile(r"^(?P<name>.+?) for Claim ID (?P<id>CLM-\d{4}-\d{6}):\s*$")
_KEY_VALUE = re.compile(r"^(?P<key>[^:]+?):\s*(?P<value>.*)$")
_NOTE = re.compile(r"^(?P<date>\d{4}-\d{2}-\d{2}):\s*(?P<text>.+)$")
_PHOTO = re.compile(r"^photo-\d+:\s*(?P<caption>.+)$")
_PHOTO_COUNT = re.compile(r"(\d+)")


def _sections(text: str) -> tuple[list[str], dict[str, list[str]]]:
    """Split a record into its header lines and its named sections."""
    header: list[str] = []
    sections: dict[str, list[str]] = {}
    current = header
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line == RECORD_TITLE:
            continue
        match = _SECTION.match(line)
        if match:
            current = sections.setdefault(match.group("name").strip(), [])
            continue
        current.append(line)
    return header, sections


def _fields(lines: list[str]) -> dict[str, str]:
    """The "Key: value" lines of a section, bullets excluded."""
    fields = {}
    for line in lines:
        if line.startswith("- "):
            continue
        match = _KEY_VALUE.match(line)
        if match:
            fields[match.group("key").strip()] = match.group("value").strip()
    return fields


def _pairs(lines: list[str]) -> list[dict]:
    """Every "label: value" line, bullet or not, in order."""
    pairs = []
    for line in lines:
        bullet = line.startswith("- ")
        body = line[2:] if bullet else line
        label, sep, value = body.rpartition(": ")
        if sep:
            pairs.append({"label": label.strip(), "value": value.strip(), "sub": bullet})
    return pairs


def _areas(value: str) -> tuple[list[str], str]:
    """Split "Front, Hood" into areas; "None, vehicle not recovered" into a note."""
    if not value:
        return [], ""
    if value.lower().startswith("none"):
        note = value[4:].lstrip(" ,;").strip()
        return [], note[:1].upper() + note[1:]
    return [a.strip() for a in value.split(",") if a.strip()], ""


def parse_claim(text: str) -> dict:
    """Read a claim record into a dict, with every field as written."""
    header, sections = _sections(text)
    head = _fields(header)
    claim_id = next(
        (line.split("Claim ID", 1)[1].strip() for line in header if line.startswith("Claim ID")),
        "",
    )

    holder = _fields(sections.get("Policyholder information", []))
    vehicle = _fields(sections.get("Insured vehicle", []))
    incident = _fields(sections.get("Incident", []))
    where = _fields(sections.get("When and where", []))
    other = _fields(sections.get("Other party", []))
    rep = _fields(sections.get("Claims representative", []))

    damage_lines = sections.get("Vehicle condition and damage", [])
    damage = _fields(damage_lines)
    exterior, exterior_note = _areas(damage.get("Exterior damage areas", ""))
    interior, interior_note = _areas(damage.get("Interior damage areas", ""))
    photos = [
        m.group("caption")
        for line in damage_lines
        if line.startswith("- ") and (m := _PHOTO.match(line[2:]))
    ]
    count = _PHOTO_COUNT.search(damage.get("Damage photos", ""))

    estimate_lines = sections.get("Estimated repair costs", [])
    estimate = None
    if estimate_lines:
        items = [p for p in _pairs(estimate_lines) if p["sub"]]
        estimate = {
            "items": [{"label": p["label"], "value": p["value"]} for p in items],
            "total": _fields(estimate_lines).get("Total estimate", ""),
        }

    valuation = sections.get("Total loss valuation")
    notes = []
    for line in sections.get("Adjuster notes", []):
        match = _NOTE.match(line[2:]) if line.startswith("- ") else None
        if match:
            notes.append({"date": match.group("date"), "text": match.group("text")})
        elif notes:
            # A note that wrapped onto the next line
            notes[-1]["text"] += " " + line

    return {
        "claim_id": claim_id,
        "policyholder": {
            "name": holder.get("Name") or head.get("Policyholder", ""),
            "address": holder.get("Address", ""),
            "phone": holder.get("Phone", ""),
            "email": holder.get("Email", ""),
        },
        "policy_number": head.get("Policy number", ""),
        "claim_type": head.get("Claim type", ""),
        "date_reported": head.get("Date reported", ""),
        "status": head.get("Claim status", ""),
        "coverage": [
            {"name": k, "value": v} for k, v in _fields(sections.get("Coverage", [])).items()
        ],
        "vehicle": {
            "year": vehicle.get("Year", ""),
            "make": vehicle.get("Make", ""),
            "model": vehicle.get("Model", ""),
            "body_style": vehicle.get("Body style", ""),
            "color": vehicle.get("Color", ""),
            "vin": vehicle.get("VIN", ""),
            "plate": vehicle.get("License plate", ""),
            "lienholder": vehicle.get("Lienholder", ""),
        },
        "incident": {
            "type": incident.get("Incident type", ""),
            "detail": incident.get("Incident detail", ""),
            "date": incident.get("Accident date", ""),
            "time": incident.get("Accident time", ""),
            "weather": incident.get("Weather", ""),
            "police_report": incident.get("Police report", ""),
            "injuries": incident.get("Injuries reported", ""),
            "fault": incident.get("Fault determination", ""),
        },
        "location": {
            "address": where.get("Location", ""),
            "coordinates": where.get("Map coordinates", ""),
            "description": where.get("Location description", "").strip('"“”'),
        },
        "other_party": (
            {
                "driver": other.get("Other driver", ""),
                "insurer": other.get("Other driver's insurer", ""),
                "policy_number": other.get("Other driver's policy number", ""),
                "vehicle": other.get("Other driver's vehicle", ""),
            }
            if other
            else None
        ),
        "damage": {
            "condition": damage.get("Condition", ""),
            "exterior_areas": exterior,
            "interior_areas": interior,
            "areas_note": exterior_note or interior_note,
            "description": damage.get("Damage description", ""),
            "photo_count": int(count.group(1)) if count else len(photos),
            "photos": photos,
        },
        "description": " ".join(sections.get("Incident description", [])),
        "estimate": estimate,
        "valuation": (
            [{"label": p["label"], "value": p["value"], "sub": p["sub"]} for p in _pairs(valuation)]
            if valuation
            else None
        ),
        "financials": [
            {"label": p["label"], "value": p["value"]}
            for p in _pairs(sections.get("Claim financial summary", []))
        ],
        "adjuster": {
            "name": rep.get("Adjuster", ""),
            "department": rep.get("Department", ""),
            "reference": rep.get("Adjuster reference", ""),
            "status": rep.get("Status", ""),
            "next_review": rep.get("Next review date", ""),
        },
        "notes": notes,
    }


def last4(value: str) -> str:
    """The last four letters or digits, masked: "KY ABC-4829" becomes "•••• 4829"."""
    chars = re.sub(r"[^A-Za-z0-9]", "", value)
    return f"•••• {chars[-4:]}" if chars else ""


def _vehicle_description(value: str) -> str:
    """The other driver's vehicle without its VIN or plate."""
    return re.split(r",\s*(?:VIN|plate)\b", value, maxsplit=1, flags=re.IGNORECASE)[0].strip()


def _scrub(value, secrets: list[tuple[str, str]]):
    """Replace each secret, wherever it appears in a string, dict, or list."""
    if isinstance(value, str):
        for secret, replacement in secrets:
            value = value.replace(secret, replacement)
        return value
    if isinstance(value, dict):
        return {k: _scrub(v, secrets) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v, secrets) for v in value]
    return value


def to_client_view(claim: dict) -> dict:
    """What the claims UI may show: the agent's privacy rules, applied to the screen.

    No address, phone, or email; the VIN and plate as their last four; the
    other driver's name, insurer, and vehicle but not their policy number,
    VIN, or plate; no map coordinates; photo captions but no photo IDs.
    A claim that happened at home names the home address as its location,
    so the address is replaced wherever it appears.
    """
    address = claim["policyholder"]["address"]
    secrets = [
        (address, "the policyholder's home"),
        (address.split(",")[0], "the policyholder's home"),
    ] if address else []
    return _scrub(_view(claim), secrets)


def _view(claim: dict) -> dict:
    vehicle = claim["vehicle"]
    other = claim["other_party"]
    return {
        "v": 1,
        "claim_id": claim["claim_id"],
        "policyholder": {"name": claim["policyholder"]["name"]},
        "policy_number": claim["policy_number"],
        "claim_type": claim["claim_type"],
        "date_reported": claim["date_reported"],
        "status": claim["status"],
        "coverage": claim["coverage"],
        "vehicle": {
            "year": vehicle["year"],
            "make": vehicle["make"],
            "model": vehicle["model"],
            "body_style": vehicle["body_style"],
            "color": vehicle["color"],
            "vin_last4": last4(vehicle["vin"]),
            "plate_last4": last4(vehicle["plate"]),
            "lienholder": vehicle["lienholder"],
        },
        "incident": claim["incident"],
        "location": {
            "address": claim["location"]["address"],
            "description": claim["location"]["description"],
        },
        "other_party": (
            {
                "driver": other["driver"],
                "insurer": other["insurer"],
                "vehicle": _vehicle_description(other["vehicle"]),
            }
            if other
            else None
        ),
        "damage": claim["damage"],
        "description": claim["description"],
        "estimate": claim["estimate"],
        "valuation": claim["valuation"],
        "financials": claim["financials"],
        "adjuster": claim["adjuster"],
        "notes": claim["notes"],
    }


_ORDINAL = {1: "st", 2: "nd", 3: "rd", 21: "st", 22: "nd", 23: "rd", 31: "st"}
_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def spoken_date(iso: str) -> str:
    """Format an ISO date the way a person says it, e.g. 'Monday, September 14th'.

    The weekday gives the caller a free second chance to catch a misheard date.
    """
    day = date.fromisoformat(iso)
    return f"{day:%A, %B} {day.day}{_ORDINAL.get(day.day, 'th')}"


def speak_dates(text: str) -> str:
    """Rewrite every ISO date in the text as a spoken date."""

    def replace(match: re.Match) -> str:
        try:
            return spoken_date(match.group())
        except ValueError:
            return match.group()

    return _ISO_DATE.sub(replace, text)


def spoken_view(claim: dict) -> str:
    """The claim as an LLM gets it: the client view, with dates ready to speak.

    It's the masked view, never the raw record, so the privacy rules hold in
    code. The prompt only has to keep the answer short.
    """
    return speak_dates(json.dumps(to_client_view(claim), ensure_ascii=False))


def latin_letters(text: str) -> str:
    """Only the letters a to z, accents removed: "W-A-L-S-H" and "walsh" match.

    A name in another script, such as Cyrillic or Devanagari, comes back empty.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    folded = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z]", "", folded)


def policyholder_matches(claim: dict, last_name: str) -> bool:
    """Whether the caller's last name is the policyholder's on this claim.

    Accepts the last word of the name, or everything after the first name for
    multi-word surnames like "De La Cruz". Only letters count, so a spelled
    out "W-A-L-S-H" matches "Walsh".
    """
    heard = latin_letters(last_name)
    names = claim["policyholder"]["name"].split()
    if not heard or len(names) < 2:
        return False
    return heard in {latin_letters(names[-1]), latin_letters("".join(names[1:]))}
