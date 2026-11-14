"""Persona tests: who's on the call decides the prompt and the tools. Run: .venv/bin/python -m unittest discover tests"""

import asyncio
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import (  # noqa: E402
    EMPLOYEE,
    GREETINGS,
    POLICYHOLDER,
    build_system_instruction,
    on_screen_view,
    persona_from_body,
    tools_for,
)
from claims import parse_claim  # noqa: E402
from tests.test_claims import CLAIMS_DIR  # noqa: E402
from voices import DEFAULT_VOICE  # noqa: E402

TODAY = "Friday, November 13, 2026"


def on_screen(claim_id: str) -> tuple[dict, dict]:
    """A sample claim's record, and what the prompt gets of it when it's open."""
    record = parse_claim((CLAIMS_DIR / f"{claim_id}.txt").read_text())
    return record, asyncio.run(on_screen_view(record))


def tool_names(persona: str) -> set[str]:
    return {tool.name for tool in tools_for(persona).standard_tools}


class PersonaFromBodyTests(unittest.TestCase):
    def test_only_employee_selects_the_employee(self):
        self.assertEqual(persona_from_body({"persona": "employee"}), EMPLOYEE)
        for body in [None, {}, {"persona": "policyholder"}, {"persona": "admin"}, "employee", []]:
            with self.subTest(body=body):
                self.assertEqual(persona_from_body(body), POLICYHOLDER)


class PromptTests(unittest.TestCase):
    def test_only_policyholders_are_verified(self):
        policyholder = build_system_instruction(POLICYHOLDER, DEFAULT_VOICE, TODAY)
        employee = build_system_instruction(EMPLOYEE, DEFAULT_VOICE, TODAY)
        self.assertIn("VERIFICATION:", policyholder)
        self.assertNotIn("VERIFICATION:", employee)
        self.assertNotIn("search_knowledge_base", employee)
        self.assertNotIn("search_claims", policyholder)

    def test_policyholder_follow_ups_go_through_the_lookup(self):
        # The full record is in the conversation after the first lookup, and
        # the lookup is what points the screen at the answer
        prompt = build_system_instruction(POLICYHOLDER, DEFAULT_VOICE, TODAY)
        self.assertIn("follow-ups included", prompt)

    def test_both_personas_share_the_speaking_and_privacy_rules(self):
        for persona in (POLICYHOLDER, EMPLOYEE):
            prompt = build_system_instruction(persona, DEFAULT_VOICE, TODAY)
            with self.subTest(persona):
                for section in ["HOW TO SPEAK:", "PRIVACY:", "VOICE AND LANGUAGE:"]:
                    self.assertIn(section, prompt)
                self.assertIn(TODAY, prompt)

    def test_staff_prompt_holds_the_claim_on_screen(self):
        _, view = on_screen("CLM-2026-847291")
        prompt = build_system_instruction(EMPLOYEE, DEFAULT_VOICE, TODAY, view)
        self.assertIn("ON SCREEN:", prompt)
        self.assertIn("claim CLM-2026-847291 open", prompt)
        self.assertIn("'what I'm looking at'", prompt)
        self.assertIn("without calling search_claims", prompt)
        # It shows the answer on screen rather than saying where to look
        self.assertIn("call show_on_screen", prompt)
        self.assertIn("Never name a card", prompt)
        self.assertIn("Daniel Mitchell", prompt)
        # Amounts are ready to speak, as in the policyholder's lookup
        self.assertNotRegex(prompt.split("ON SCREEN:")[1], r"\$\d")

    def test_staff_prompt_gets_only_the_masked_record(self):
        for path in sorted(CLAIMS_DIR.glob("CLM-*.txt")):
            record, view = on_screen(path.stem)
            prompt = build_system_instruction(EMPLOYEE, DEFAULT_VOICE, TODAY, view)
            holder, vehicle = record["policyholder"], record["vehicle"]
            secrets = [holder["address"], holder["phone"], holder["email"],
                       vehicle["vin"], vehicle["plate"], record["location"]["coordinates"]]
            if record["other_party"]:
                secrets.append(record["other_party"]["policy_number"])
            # Placeholders like "Unknown" aren't secrets; real ones have a digit or an @
            secrets = [x for x in secrets if re.search(r"[\d@]", x)]
            with self.subTest(path.name):
                self.assertTrue(secrets)
                for secret in secrets:
                    self.assertNotIn(secret, prompt)
                self.assertNotRegex(prompt, r"photo-\d+")

    def test_no_claim_open_means_no_on_screen_section(self):
        prompt = build_system_instruction(EMPLOYEE, DEFAULT_VOICE, TODAY)
        self.assertNotIn("ON SCREEN:", prompt)
        self.assertNotIn("CLM-2026-847291", prompt)
        # Staff are told to say so when they ask about "this claim" anyway
        self.assertIn("say no claim is open", prompt)

    def test_policyholder_prompt_ignores_the_screen(self):
        # A policyholder only ever sees the claim they were verified for
        _, view = on_screen("CLM-2026-847291")
        self.assertEqual(
            build_system_instruction(POLICYHOLDER, DEFAULT_VOICE, TODAY, view),
            build_system_instruction(POLICYHOLDER, DEFAULT_VOICE, TODAY),
        )

    def test_every_persona_has_a_greeting(self):
        self.assertEqual(set(GREETINGS), {POLICYHOLDER, EMPLOYEE})


class ToolTests(unittest.TestCase):
    def test_each_persona_gets_its_own_claim_tools(self):
        voice_tools = {"set_voice", "list_voices", "reset_voice"}
        self.assertEqual(tool_names(POLICYHOLDER), {"search_knowledge_base"} | voice_tools)
        self.assertEqual(
            tool_names(EMPLOYEE), {"search_claims", "show_on_screen"} | voice_tools
        )


if __name__ == "__main__":
    unittest.main()
