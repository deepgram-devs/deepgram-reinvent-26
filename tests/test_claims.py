"""Claim ID, claim lookup, claim search, and sample data tests. Run: .venv/bin/python -m unittest discover tests"""

import io
import re
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agent import (  # noqa: E402
    BedrockKnowledgeBaseClient,
    ClaimHit,
    claim_id_pattern,
    normalize_claim_id,
    s3_object,
)
from claims import parse_claim, policyholder_matches  # noqa: E402

CLAIMS_DIR = ROOT / "kb-data" / "claims"

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

    def test_header_and_policyholder_section_agree_on_the_name(self):
        # Verification reads the parsed name, which prefers the Policyholder
        # section's Name line, so the header must say the same
        for path, text in self.records.items():
            self.assertEqual(field(text, "Policyholder"), field(text, "Name"), path.name)
            self.assertEqual(text.count("Policyholder:"), 1, path.name)

    def test_every_policyholder_verifies_by_last_name(self):
        for path, text in self.records.items():
            claim = parse_claim(text)
            last = claim["policyholder"]["name"].split()[-1]
            with self.subTest(path.name):
                self.assertTrue(policyholder_matches(claim, last))
                self.assertTrue(policyholder_matches(claim, "-".join(last.upper())))
                self.assertFalse(policyholder_matches(claim, "Nobody"))

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


BUCKET = "kb-claims"


def result(claim_file: str, text: str) -> dict:
    """One retrieve result: a passage and the file it came from."""
    return {
        "content": {"text": text},
        "location": {
            "type": "S3",
            "s3Location": {"uri": f"https://{BUCKET}.s3.amazonaws.com/{claim_file}"},
        },
    }


class FakeS3:
    """Serves the sample claim files as if they were in the bucket."""

    def __init__(self, files: dict[str, str] | None = None):
        self.files = files
        self.reads: list[tuple[str, str]] = []

    def get_object(self, Bucket: str, Key: str) -> dict:
        self.reads.append((Bucket, Key))
        text = self.files[Key] if self.files else (CLAIMS_DIR / Key).read_text()
        return {"Body": io.BytesIO(text.encode("utf-8"))}


def kb_client(results: list[dict], s3: FakeS3) -> BedrockKnowledgeBaseClient:
    """A knowledge base client with search and S3 stubbed out, so no AWS calls."""
    client = object.__new__(BedrockKnowledgeBaseClient)
    client._retrieve = lambda text, search_type, max_results: {"retrievalResults": results}
    client.s3 = s3
    return client


class S3ObjectTests(unittest.TestCase):
    def test_reads_every_s3_location_style(self):
        cases = {
            "s3://kb-claims/CLM-2026-847291.txt": ("kb-claims", "CLM-2026-847291.txt"),
            "https://kb-claims.s3.amazonaws.com/CLM-2026-847291.txt": ("kb-claims", "CLM-2026-847291.txt"),
            "https://kb-claims.s3.us-west-2.amazonaws.com/claims/CLM-2026-847291.txt": ("kb-claims", "claims/CLM-2026-847291.txt"),
            "https://s3.us-east-1.amazonaws.com/kb-claims/CLM-2026-847291.txt": ("kb-claims", "CLM-2026-847291.txt"),
            "https://my.s3data.bucket.s3.amazonaws.com/a%20b.txt": ("my.s3data.bucket", "a b.txt"),
        }
        for uri, expected in cases.items():
            with self.subTest(uri):
                self.assertEqual(s3_object(uri), expected)

    def test_other_locations_are_not_s3(self):
        for uri in [
            "",
            "https://example.com/CLM-2026-847291.txt",
            "http://kb-claims.s3.amazonaws.com/CLM-2026-847291.txt",
            "https://kb-claims.s3.amazonaws.com/",
            "s3://kb-claims",
        ]:
            with self.subTest(uri):
                self.assertIsNone(s3_object(uri))


class PolicyholderMatchTests(unittest.TestCase):
    def claim(self, name: str) -> dict:
        return {"policyholder": {"name": name}}

    def test_multi_word_surnames(self):
        claim = self.claim("Ana De La Cruz")
        for heard in ["De La Cruz", "delacruz", "D-E-L-A-C-R-U-Z", "Cruz"]:
            with self.subTest(heard):
                self.assertTrue(policyholder_matches(claim, heard))

    def test_accents_and_case_are_ignored(self):
        self.assertTrue(policyholder_matches(self.claim("Chloé Lefèvre"), "LEFEVRE"))

    def test_first_name_or_other_scripts_do_not_match(self):
        claim = self.claim("Daniel Mitchell")
        for heard in ["Daniel", "", "Митчелл", "Mitchel"]:
            with self.subTest(heard):
                self.assertFalse(policyholder_matches(claim, heard))


class LoadClaimTests(unittest.TestCase):
    def test_reads_the_whole_file_of_the_matching_passage(self):
        s3 = FakeS3()
        client = kb_client(
            [
                # The top result is another claim, so it must be skipped
                result("CLM-2026-527613.txt", "Coverage for Claim ID CLM-2026-527613:"),
                result("CLM-2026-847291.txt", "Incident for Claim ID CLM-2026-847291:"),
            ],
            s3,
        )
        claim = client.load_claim("CLM-2026-847291")
        self.assertEqual(claim, parse_claim((CLAIMS_DIR / "CLM-2026-847291.txt").read_text()))
        self.assertEqual(s3.reads, [(BUCKET, "CLM-2026-847291.txt")])

    def test_no_matching_passage_reads_nothing(self):
        s3 = FakeS3()
        client = kb_client(
            [result("CLM-2026-847291.txt", "Incident for Claim ID CLM-2026-847291:")], s3
        )
        # One digit short: never matches the full claim ID
        self.assertIsNone(client.load_claim("CLM-2026-84729"))
        self.assertEqual(s3.reads, [])

    def test_file_without_the_claim_is_rejected(self):
        s3 = FakeS3({"CLM-2026-847291.txt": "Some other record for Claim ID CLM-2026-527613:"})
        client = kb_client(
            [result("CLM-2026-847291.txt", "Incident for Claim ID CLM-2026-847291:")], s3
        )
        self.assertIsNone(client.load_claim("CLM-2026-847291"))

    def test_record_keeps_passages_without_a_claim_id_line(self):
        # The last adjuster note of this claim sits in a passage with no
        # "Claim ID" line; reading the whole file keeps it
        claim_id = "CLM-2026-364902"
        client = kb_client(
            [result(f"{claim_id}.txt", f"Adjuster Notes for Claim ID {claim_id}:")], FakeS3()
        )
        notes = " ".join(note["text"] for note in client.load_claim(claim_id)["notes"])
        self.assertIn("Storage fees at the tow yard", notes)
        self.assertIn("Policyholder advised to move the vehicle", notes)


class SearchClaimsTests(unittest.TestCase):
    def test_claims_in_rank_order_once_each(self):
        client = kb_client(
            [
                result("CLM-2026-527613.txt", "Notes for Claim ID CLM-2026-527613:"),
                result("CLM-2026-847291.txt", "Incident for Claim ID CLM-2026-847291:"),
                result("CLM-2026-527613.txt", "Coverage for Claim ID CLM-2026-527613:"),
            ],
            FakeS3(),
        )
        self.assertEqual(
            client.search_claims("waiting on a title"),
            [
                ClaimHit("CLM-2026-527613", BUCKET, "CLM-2026-527613.txt"),
                ClaimHit("CLM-2026-847291", BUCKET, "CLM-2026-847291.txt"),
            ],
        )

    def test_a_passage_without_a_claim_line_is_named_by_its_file(self):
        client = kb_client(
            [result("claims/CLM-2026-364902.txt", "Storage fees at the tow yard")], FakeS3()
        )
        self.assertEqual(
            [hit.claim_id for hit in client.search_claims("tow yard fees")],
            ["CLM-2026-364902"],
        )

    def test_passages_naming_no_claim_are_skipped(self):
        client = kb_client([result("notes.txt", "Storage fees at the tow yard")], FakeS3())
        self.assertEqual(client.search_claims("tow yard fees"), [])

    def test_a_misnamed_file_is_rejected_when_read(self):
        # The passage claims one ID, the file holds another
        s3 = FakeS3({"CLM-2026-847291.txt": (CLAIMS_DIR / "CLM-2026-527613.txt").read_text()})
        client = kb_client(
            [result("CLM-2026-847291.txt", "Incident for Claim ID CLM-2026-847291:")], s3
        )
        [hit] = client.search_claims("anything")
        self.assertIsNone(client.read_claim_file(hit))


if __name__ == "__main__":
    unittest.main()
