"""Claim ID and sample data tests. Run: .venv/bin/python -m unittest discover tests"""

import re
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agent import claim_id_pattern, normalize_claim_id  # noqa: E402

CLAIMS_DIR = ROOT / "kb-data" / "claims"

# The same pattern verify_policyholder uses to read the name off a record
POLICYHOLDER = re.compile(r"Policyholder:\s*([^\n]+?)\s*(?:Policy number:|\n|$)")

EXTERIOR_AREAS = {
    "Driver Front", "Front", "Passenger Front", "Driver Side", "Passenger Side",
    "Driver Rear", "Rear", "Passenger Rear", "Hood", "Roof", "Windshield",
    "Rear Window",
}
INTERIOR_AREAS = {
    "Dashboard", "Airbags", "Front Seats", "Rear Seats", "Headliner",
    "Ignition/Steering Column",
}

# Louisville and the surrounding counties
LAT_RANGE = (37.9, 38.5)
LONG_RANGE = (-86.0, -85.3)


def field(text: str, name: str) -> str:
    match = re.search(rf"^{re.escape(name)}: (.+)$", text, re.MULTILINE)
    return match.group(1) if match else ""


class ClaimIdTests(unittest.TestCase):
    def test_normalizes_spoken_and_written_forms(self):
        for heard in [
            "CLM-2026-847291",
            "clm 2026 847291",
            "C L M 2026 847291",
            "2026847291",
            "२०२६८४७२९१",  # Devanagari digits
        ]:
            self.assertEqual(normalize_claim_id(heard), "CLM-2026-847291", heard)

    def test_incomplete_ids_are_rejected(self):
        for heard in ["847291", "CLM-847291", "CLM-2026-84729", "", "CLM-2026-8472911"]:
            self.assertEqual(normalize_claim_id(heard), "", heard)

    def test_pattern_does_not_match_a_prefix(self):
        pattern = claim_id_pattern("CLM-2026-84729")
        self.assertIsNone(pattern.search("Claim ID CLM-2026-847291"))
        self.assertIsNotNone(claim_id_pattern("CLM-2026-847291").search("Claim ID CLM-2026-847291:"))


class SampleDataTests(unittest.TestCase):
    def setUp(self):
        self.records = {p: p.read_text() for p in sorted(CLAIMS_DIR.glob("*.txt"))}

    def test_there_are_ten_records(self):
        self.assertEqual(len(self.records), 10)

    def test_filename_matches_claim_id(self):
        ids = []
        for path, text in self.records.items():
            match = re.search(r"^Claim ID (CLM-\d{4}-\d{6})$", text, re.MULTILINE)
            self.assertIsNotNone(match, path.name)
            self.assertEqual(path.stem, match.group(1))
            self.assertEqual(normalize_claim_id(match.group(1)), match.group(1))
            ids.append(match.group(1))
        self.assertEqual(len(ids), len(set(ids)))

    def test_first_block_verifies_the_policyholder(self):
        # verify_policyholder needs the Claim ID and Policyholder lines in the
        # same passage, so both belong in the record's opening block
        for path, text in self.records.items():
            first_block = text.split("\n\n")[1]
            self.assertTrue(claim_id_pattern(path.stem).search(first_block), path.name)
            match = POLICYHOLDER.search(first_block)
            self.assertIsNotNone(match, path.name)
            self.assertEqual(match.group(1), field(text, "Name"), path.name)
            self.assertEqual(text.count("Policyholder:"), 1, path.name)

    def test_every_section_header_names_the_claim(self):
        # Any passage cut from the record must carry its claim ID, or the
        # verified lookup filters it out
        for path, text in self.records.items():
            headers = [line for line in text.splitlines() if line.endswith(":")]
            self.assertGreater(len(headers), 5, path.name)
            for header in headers:
                self.assertIn(f"for Claim ID {path.stem}:", header, path.name)

    def test_no_other_claim_id_appears(self):
        for path, text in self.records.items():
            self.assertEqual(set(re.findall(r"CLM-\d{4}-\d{6}", text)), {path.stem}, path.name)

    def test_dates_are_iso_and_valid(self):
        for path, text in self.records.items():
            self.assertIsNone(re.search(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", text), path.name)
            for iso in re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text):
                date.fromisoformat(iso)

    def test_rates_are_spoken_per_day(self):
        for path, text in self.records.items():
            self.assertNotIn("/day", text, path.name)

    def test_damage_areas_use_the_diagram_vocabulary(self):
        for path, text in self.records.items():
            for name, vocabulary in [
                ("Exterior damage areas", EXTERIOR_AREAS),
                ("Interior damage areas", INTERIOR_AREAS),
            ]:
                value = field(text, name)
                self.assertTrue(value, f"{path.name}: {name}")
                if value.startswith("None"):
                    continue
                for area in value.split(", "):
                    self.assertIn(area, vocabulary, f"{path.name}: {name}")

    def test_photo_count_matches_listed_photos(self):
        for path, text in self.records.items():
            count = re.search(r"^Damage photos: (\d+) on file$", text, re.MULTILINE)
            self.assertIsNotNone(count, path.name)
            listed = re.findall(r"^- photo-\d+: ", text, re.MULTILINE)
            self.assertEqual(int(count.group(1)), len(listed), path.name)

    def test_coordinates_are_in_the_louisville_area(self):
        for path, text in self.records.items():
            lat, long = (float(v) for v in field(text, "Map coordinates").split(", "))
            self.assertTrue(LAT_RANGE[0] < lat < LAT_RANGE[1], path.name)
            self.assertTrue(LONG_RANGE[0] < long < LONG_RANGE[1], path.name)


if __name__ == "__main__":
    unittest.main()
