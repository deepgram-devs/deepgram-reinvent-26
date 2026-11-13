"""Claim parsing and privacy tests for the claims UI and the LLMs. Run: .venv/bin/python -m unittest discover tests"""

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from claims import last4, parse_claim, spoken_view, to_client_view  # noqa: E402
from tests.test_claims import CLAIMS_DIR, EXTERIOR_AREAS, INTERIOR_AREAS  # noqa: E402

CLAIM_FILES = sorted(CLAIMS_DIR.glob("CLM-*.txt"))


def dollars(value: str) -> int:
    return int(re.sub(r"[^\d]", "", value.split()[0]))


class ParseClaimTests(unittest.TestCase):
    def test_every_record_parses(self):
        self.assertEqual(len(CLAIM_FILES), 10)
        for path in CLAIM_FILES:
            with self.subTest(path.name):
                claim = parse_claim(path.read_text())
                self.assertEqual(claim["claim_id"], path.stem)
                for value in [
                    claim["policyholder"]["name"],
                    claim["status"],
                    claim["claim_type"],
                    claim["vehicle"]["make"],
                    claim["incident"]["date"],
                    claim["location"]["address"],
                    claim["damage"]["condition"],
                    claim["adjuster"]["name"],
                    claim["adjuster"]["next_review"],
                ]:
                    self.assertTrue(value)
                self.assertTrue(claim["coverage"])
                self.assertTrue(claim["financials"])
                self.assertTrue(claim["notes"])
                self.assertLessEqual(set(claim["damage"]["exterior_areas"]), EXTERIOR_AREAS)
                self.assertLessEqual(set(claim["damage"]["interior_areas"]), INTERIOR_AREAS)
                self.assertEqual(claim["damage"]["photo_count"], len(claim["damage"]["photos"]))

    def test_estimate_items_add_up_to_the_total(self):
        for path in CLAIM_FILES:
            estimate = parse_claim(path.read_text())["estimate"]
            if estimate:
                with self.subTest(path.name):
                    total = sum(dollars(item["value"]) for item in estimate["items"])
                    self.assertEqual(total, dollars(estimate["total"]))

    def test_sample_claim_fields(self):
        claim = parse_claim((CLAIMS_DIR / "CLM-2026-847291.txt").read_text())
        self.assertEqual(claim["policyholder"]["name"], "Daniel Mitchell")
        self.assertEqual(
            claim["damage"]["exterior_areas"], ["Front", "Hood", "Passenger Front", "Rear"]
        )
        self.assertEqual(claim["damage"]["interior_areas"], [])
        self.assertEqual(claim["other_party"]["driver"], "Kyle Brennan")
        self.assertTrue(claim["location"]["description"].startswith("Traffic stopped"))
        self.assertEqual(claim["notes"][0]["date"], "2026-11-10")

    def test_stolen_vehicle_has_no_damage_areas(self):
        claim = parse_claim((CLAIMS_DIR / "CLM-2026-159827.txt").read_text())
        self.assertEqual(claim["damage"]["exterior_areas"], [])
        self.assertEqual(claim["damage"]["areas_note"], "Vehicle not recovered")
        self.assertIsNone(claim["estimate"])
        self.assertIsNone(claim["other_party"])
        labels = [row["label"] for row in claim["valuation"]]
        self.assertIn("Settlement offer", labels)


class ClientViewTests(unittest.TestCase):
    def test_masks_what_the_agent_may_not_say(self):
        for path in CLAIM_FILES:
            with self.subTest(path.name):
                claim = parse_claim(path.read_text())
                view = json.dumps(to_client_view(claim), ensure_ascii=False)
                forbidden = [
                    claim["policyholder"]["address"],
                    claim["policyholder"]["phone"],
                    claim["policyholder"]["email"],
                    claim["vehicle"]["vin"],
                    claim["vehicle"]["plate"],
                    claim["location"]["coordinates"],
                ]
                if claim["other_party"]:
                    forbidden.append(claim["other_party"]["policy_number"])
                # Placeholders like "Unknown" aren't identifiers
                placeholders = {"", "unknown", "none", "not applicable"}
                for value in (v for v in forbidden if v.lower() not in placeholders):
                    self.assertNotIn(value, view)
                self.assertNotIn("photo-", view)
                self.assertNotRegex(view, r"FICTIONAL-VIN")
                self.assertNotRegex(view, r"\bplate KY\b")

    def test_claim_at_home_hides_the_address(self):
        view = to_client_view(parse_claim((CLAIMS_DIR / "CLM-2026-738450.txt").read_text()))
        self.assertEqual(view["location"]["address"], "Driveway at the policyholder's home")

    def test_last_four(self):
        self.assertEqual(last4("KY ABC-4829"), "•••• 4829")
        self.assertEqual(last4("FICTIONAL-VIN-847291"), "•••• 7291")
        self.assertEqual(last4(""), "")

    def test_other_vehicle_keeps_its_description(self):
        view = to_client_view(parse_claim((CLAIMS_DIR / "CLM-2026-847291.txt").read_text()))
        self.assertEqual(view["other_party"]["vehicle"], "2016 Chevrolet Silverado")
        self.assertNotIn("policy_number", view["other_party"])


class SpokenViewTests(unittest.TestCase):
    """What the LLMs read: the masked view, so they can't say what it hides."""

    def test_hides_what_the_agent_may_not_say(self):
        for path in CLAIM_FILES:
            claim = parse_claim(path.read_text())
            spoken = spoken_view(claim)
            holder, vehicle = claim["policyholder"], claim["vehicle"]
            secrets = [holder["address"], holder["phone"], holder["email"],
                       vehicle["vin"], vehicle["plate"], claim["location"]["coordinates"]]
            if claim["other_party"]:
                secrets.append(claim["other_party"]["policy_number"])
            # Placeholders like "Unknown" aren't secrets; real ones have a digit or an @
            secrets = [x for x in secrets if re.search(r"[\d@]", x)]
            with self.subTest(path.name):
                for secret in secrets:
                    self.assertNotIn(secret, spoken)
                self.assertNotRegex(spoken, r"photo-\d+")

    def test_dates_are_ready_to_speak(self):
        for path in CLAIM_FILES:
            spoken = spoken_view(parse_claim(path.read_text()))
            with self.subTest(path.name):
                self.assertNotRegex(spoken, r"\b\d{4}-\d{2}-\d{2}\b")
                self.assertEqual(json.loads(spoken)["claim_id"], path.stem)


if __name__ == "__main__":
    unittest.main()
