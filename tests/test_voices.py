"""Catalog tests for voices.py. Run: .venv/bin/python -m unittest discover tests"""

import re
import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import voices  # noqa: E402
from voices import DEFAULT_VOICE, LANGUAGES, VOICES  # noqa: E402

# Languages flux-general-multi accepts as language hints (others fail with 400)
FLUX_MULTI_LANGUAGES = {"en", "es", "fr", "de", "hi", "ru", "pt", "ja", "it", "nl"}

# Bedrock tool descriptions are kept well under this to keep the prompt small
MAX_TOOL_DESCRIPTION = 1024


class CatalogTests(unittest.TestCase):
    def test_short_names_and_models_are_unique(self):
        keys = Counter(k for v in VOICES for k in (v.name, v.model))
        self.assertEqual([k for k, n in keys.items() if n > 1], [])

    def test_models_follow_flux_name_lang(self):
        for v in VOICES:
            self.assertEqual(v.model, f"flux-{v.name}-{v.lang}")
            self.assertRegex(v.name, r"^[a-z]+$")

    def test_every_voice_language_can_be_heard(self):
        for v in VOICES:
            self.assertIn(v.lang, LANGUAGES)
        self.assertLessEqual(set(LANGUAGES), FLUX_MULTI_LANGUAGES)
        for code in LANGUAGES:
            self.assertTrue(voices.voices_for(code), f"no voices for {code}")

    def test_one_featured_voice_per_non_english_language(self):
        for code, language in LANGUAGES.items():
            featured = [v for v in VOICES if v.lang == code and v.featured]
            if code == "en":
                self.assertGreaterEqual(len(featured), 2)
            else:
                self.assertEqual(len(featured), 1, language.name)

    def test_every_language_has_its_own_filler(self):
        fillers = [language.filler for language in LANGUAGES.values()]
        self.assertTrue(all(fillers))
        self.assertEqual(len(set(fillers)), len(fillers))

    def test_default_is_english_and_unknown_names_are_refused(self):
        self.assertEqual(DEFAULT_VOICE.lang, "en")
        self.assertIsNone(voices.find_voice("no-such-voice"))

    def test_lookup_by_name_or_model_ignores_case(self):
        carmen = voices.find_voice("Carmen")
        self.assertIsNotNone(carmen)
        self.assertIs(voices.find_voice(" FLUX-CARMEN-ES "), carmen)

    def test_lookup_tolerates_wrapped_names(self):
        # Seen in a live test: the transcript said "the Voice Kit"
        kit = voices.find_voice("kit")
        self.assertIs(voices.find_voice("Voice Kit"), kit)
        self.assertIs(voices.find_voice("Kit, please"), kit)
        # Two names, or none, is still no match
        self.assertIsNone(voices.find_voice("kit or carmen"))
        self.assertIsNone(voices.find_voice("a deep voice"))

    def test_lookup_ignores_accents(self):
        self.assertIs(voices.find_voice("Chloé"), voices.find_voice("chloe"))
        self.assertIs(voices.find_voice("Véronique"), voices.find_voice("veronique"))
        self.assertIs(voices.find_voice("Benoît, please"), voices.find_voice("benoit"))
        # Names in other scripts can't be matched; the tool asks for Latin letters
        self.assertIsNone(voices.find_voice("Наталья"))
        self.assertIsNone(voices.find_voice("अंजलि"))

    def test_ascii_fold(self):
        self.assertEqual(voices.ascii_fold("Núñez"), "nunez")
        self.assertEqual(voices.ascii_fold("Wałęsa"), "wałesa")  # ł has no decomposition
        self.assertEqual(voices.ascii_fold("Наталья"), "наталья")

    def test_article(self):
        self.assertEqual(voices.article("European Portuguese woman"), "a")
        self.assertEqual(voices.article("Italian woman"), "an")
        self.assertEqual(voices.article("English"), "an")
        self.assertEqual(voices.article("Spanish"), "a")
        self.assertIn("a European Portuguese woman", voices.voice_intro(voices.find_voice("benedita")))

    def test_listen_settings(self):
        en = voices.listen_settings(DEFAULT_VOICE)
        self.assertEqual(en, {"model": "flux-general-en", "language_hints": None})
        es = voices.listen_settings(voices.find_voice("carmen"))
        # English stays in the hints, so "switch back to English" is heard
        self.assertEqual(es, {"model": "flux-general-multi", "language_hints": ["es", "en"]})

    def test_listen_steps_keep_configure_off_flux_general_en(self):
        en, es, fr, es2 = (voices.find_voice(n) for n in ("heather", "carmen", "camille", "pilar"))
        multi = "flux-general-multi"
        # English to multi: reconnect first, then set hints on the multi connection
        self.assertEqual(voices.listen_steps(en, es), [{"model": multi}, {"language_hints": ["es", "en"]}])
        # Multi to English: clear hints while still on multi, then reconnect
        self.assertEqual(voices.listen_steps(es, en), [{"language_hints": None}, {"model": "flux-general-en"}])
        # One multi language to another: hints only, no reconnect
        self.assertEqual(voices.listen_steps(es, fr), [{"language_hints": ["fr", "en"]}])
        # Same language: nothing to change
        self.assertEqual(voices.listen_steps(es, es2), [])
        self.assertEqual(voices.listen_steps(en, voices.find_voice("kit")), [])

    def test_tool_text_fits(self):
        description = voices.set_voice_description()
        self.assertLess(len(description), MAX_TOOL_DESCRIPTION)
        for v in VOICES:
            if v.featured:
                self.assertIn(v.name, description)
        for code in LANGUAGES:
            text = voices.list_voices_text(code)
            self.assertTrue(text.startswith(f"{LANGUAGES[code].name} voices: "))
        self.assertEqual(
            voices.list_voices_text("bg"), "This line does not have voices in that language."
        )

    def test_no_unexpanded_placeholders(self):
        for v in [DEFAULT_VOICE, voices.find_voice("carmen"), voices.find_voice("bianca")]:
            for text in (voices.voice_intro(v), voices.confirmation(v, True), voices.confirmation(v, False)):
                self.assertIsNone(re.search(r"[{}<>]", text), text)


if __name__ == "__main__":
    unittest.main()
