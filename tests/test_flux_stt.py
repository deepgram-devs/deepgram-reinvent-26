import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import voices  # noqa: E402
from agent import FluxSTT  # noqa: E402

ENGLISH = voices.find_voice("brooke")
SPANISH = voices.find_voice("carmen")
FRENCH = voices.find_voice("camille")


class FluxSTTTests(unittest.IsolatedAsyncioTestCase):
    def connected(self, voice) -> FluxSTT:
        """A FluxSTT as if connected in the voice's language, sends recorded."""
        stt = FluxSTT(
            api_key="test", settings=FluxSTT.Settings(**voices.listen_settings(voice))
        )
        stt._transport_is_active = lambda: True
        stt._transport_send_json = AsyncMock()
        # Held, as it is while the caller is speaking
        stt._request_reconnect = AsyncMock()
        stt._build_query_string()  # what connecting does
        return stt

    async def switch(self, stt: FluxSTT, old, new):
        for step in voices.listen_steps(old, new):
            await stt._update_settings(FluxSTT.Settings(**step))

    def configures(self, stt: FluxSTT) -> list[dict]:
        return [call.args[0] for call in stt._transport_send_json.await_args_list]

    async def test_hints_wait_for_a_held_reconnect_out_of_english(self):
        stt = self.connected(ENGLISH)
        await self.switch(stt, ENGLISH, SPANISH)

        stt._request_reconnect.assert_awaited_once()
        self.assertEqual(self.configures(stt), [])
        # The reconnect carries the hints instead
        query = stt._build_query_string()
        self.assertIn("model=flux-general-multi", query)
        self.assertIn("language_hint=es", query)
        self.assertIn("language_hint=en", query)

    async def test_hints_change_on_an_open_multilingual_connection(self):
        stt = self.connected(SPANISH)
        await self.switch(stt, SPANISH, FRENCH)

        stt._request_reconnect.assert_not_awaited()
        self.assertEqual(self.configures(stt), [{"type": "Configure", "language_hints": ["fr", "en"]}])

    async def test_hints_clear_before_leaving_multilingual(self):
        stt = self.connected(SPANISH)
        await self.switch(stt, SPANISH, ENGLISH)

        self.assertEqual(self.configures(stt), [{"type": "Configure", "language_hints": []}])
        stt._request_reconnect.assert_awaited_once()
        self.assertNotIn("language_hint", stt._build_query_string())

    async def test_other_fields_still_reach_an_english_connection(self):
        stt = self.connected(ENGLISH)
        await stt._update_settings(FluxSTT.Settings(eot_threshold=0.8))

        self.assertEqual(
            self.configures(stt), [{"type": "Configure", "thresholds": {"eot_threshold": 0.8}}]
        )


if __name__ == "__main__":
    unittest.main()
