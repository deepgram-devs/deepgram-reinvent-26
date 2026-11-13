"""Persona tests: who's on the call decides the prompt and the tools. Run: .venv/bin/python -m unittest discover tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import (  # noqa: E402
    EMPLOYEE,
    GREETINGS,
    POLICYHOLDER,
    build_system_instruction,
    persona_from_body,
    tools_for,
)
from voices import DEFAULT_VOICE  # noqa: E402

TODAY = "Friday, November 13, 2026"


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

    def test_every_persona_has_a_greeting(self):
        self.assertEqual(set(GREETINGS), {POLICYHOLDER, EMPLOYEE})


class ToolTests(unittest.TestCase):
    def test_each_persona_gets_its_own_claim_tool(self):
        voice_tools = {"set_voice", "list_voices", "reset_voice"}
        self.assertEqual(tool_names(POLICYHOLDER), {"search_knowledge_base"} | voice_tools)
        self.assertEqual(tool_names(EMPLOYEE), {"search_claims"} | voice_tools)


if __name__ == "__main__":
    unittest.main()
