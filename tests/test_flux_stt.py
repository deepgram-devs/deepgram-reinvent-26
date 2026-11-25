import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from websockets.protocol import State

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import voices  # noqa: E402
from agent import FluxSTT  # noqa: E402

ENGLISH = voices.find_voice("brooke")
SPANISH = voices.find_voice("carmen")
FRENCH = voices.find_voice("camille")


class FluxSTTTests(unittest.IsolatedAsyncioTestCase):
    """FluxSTT through Pipecat's own connect and reconnect, the network faked.

    FluxSTT overrides Pipecat's private methods, so these run the real
    _connect, _reconnect, and _reconnect_websocket of the pinned version.
    Only the socket itself, and the tasks and frames a pipeline would carry,
    are stand-ins.
    """

    def socket(self):
        return SimpleNamespace(
            state=State.OPEN, response=None, send=AsyncMock(), close=AsyncMock(), ping=AsyncMock()
        )

    async def connected(self, voice) -> FluxSTT:
        """A FluxSTT connected in the voice's language."""
        stt = FluxSTT(
            api_key="test", settings=FluxSTT.Settings(**voices.listen_settings(voice))
        )
        self.sockets = []

        async def connect(uri, **kwargs):
            self.sockets.append(self.socket())
            return self.sockets[-1]

        stt._websocket_connect = AsyncMock(side_effect=connect)
        # No pipeline: nothing to run the receive loop, or take frames and metrics
        stt._receive_task = object()
        stt.cancel_task = AsyncMock()
        stt.create_task = lambda coroutine, *args, **kwargs: coroutine.close() or object()
        stt.push_error = AsyncMock()
        stt.stop_all_metrics = AsyncMock()
        await stt._connect()
        return stt

    def speaking(self, stt: FluxSTT):
        """The caller is mid-turn, so Pipecat holds any reconnect."""
        stt._can_reconnect = False

    async def stopped_speaking(self, stt: FluxSTT):
        """What Pipecat does when the caller's turn ends."""
        stt._can_reconnect = True
        if stt._need_reconnect:
            await stt._reconnect()

    async def switch(self, stt: FluxSTT, old, new):
        for step in voices.listen_steps(old, new):
            await stt._update_settings(FluxSTT.Settings(**step))

    def urls(self, stt: FluxSTT) -> list[str]:
        """The URL of each connection made, oldest first."""
        return [call.args[0] for call in stt._websocket_connect.await_args_list]

    def configures(self) -> list[dict]:
        """Each Configure sent, on any connection, oldest first."""
        sent = [json.loads(call.args[0]) for s in self.sockets for call in s.send.await_args_list]
        return [message for message in sent if message["type"] == "Configure"]

    def assert_hints(self, url: str, *codes: str):
        self.assertIn("model=flux-general-multi", url)
        hints = [param for param in url.split("&") if param.startswith("language_hint=")]
        self.assertEqual(hints, [f"language_hint={code}" for code in codes])

    async def test_hints_wait_for_a_held_reconnect_out_of_english(self):
        stt = await self.connected(ENGLISH)
        self.speaking(stt)
        await self.switch(stt, ENGLISH, SPANISH)

        self.assertEqual(len(self.urls(stt)), 1)
        self.assertEqual(self.configures(), [])
        self.assertEqual(stt._connected_model, "flux-general-en")

        # The reconnect carries the hints instead
        await self.stopped_speaking(stt)
        self.assertEqual(len(self.urls(stt)), 2)
        self.assert_hints(self.urls(stt)[-1], "es", "en")
        self.assertEqual(self.configures(), [])
        self.assertEqual(stt._connected_model, "flux-general-multi")

    async def test_a_second_switch_while_held_still_sends_no_hints(self):
        stt = await self.connected(ENGLISH)
        self.speaking(stt)
        await self.switch(stt, ENGLISH, SPANISH)
        await self.switch(stt, SPANISH, FRENCH)

        self.assertEqual(self.configures(), [])
        await self.stopped_speaking(stt)
        self.assert_hints(self.urls(stt)[-1], "fr", "en")

    async def test_hints_change_on_an_open_multilingual_connection(self):
        stt = await self.connected(SPANISH)
        self.assert_hints(self.urls(stt)[0], "es", "en")
        await self.switch(stt, SPANISH, FRENCH)

        self.assertEqual(len(self.urls(stt)), 1)
        self.assertEqual(self.configures(), [{"type": "Configure", "language_hints": ["fr", "en"]}])

    async def test_hints_clear_before_leaving_multilingual(self):
        stt = await self.connected(SPANISH)
        await self.switch(stt, SPANISH, ENGLISH)

        self.assertEqual(self.configures(), [{"type": "Configure", "language_hints": []}])
        self.assertEqual(len(self.urls(stt)), 2)
        self.assertIn("model=flux-general-en", self.urls(stt)[-1])
        self.assertNotIn("language_hint", self.urls(stt)[-1])

    async def test_other_fields_still_reach_an_english_connection(self):
        stt = await self.connected(ENGLISH)
        await stt._update_settings(FluxSTT.Settings(eot_threshold=0.8))

        self.assertEqual(
            self.configures(), [{"type": "Configure", "thresholds": {"eot_threshold": 0.8}}]
        )

    async def test_a_dropped_connection_reconnects_with_the_current_hints(self):
        # Not held: Pipecat reconnects to multi first, then sends the hints
        stt = await self.connected(ENGLISH)
        await self.switch(stt, ENGLISH, SPANISH)
        self.assertNotIn("language_hint", self.urls(stt)[-1])
        self.assertEqual(self.configures(), [{"type": "Configure", "language_hints": ["es", "en"]}])

        # The receive loop's reconnect, after the network drops
        await stt._reconnect_websocket(1)
        self.assert_hints(self.urls(stt)[-1], "es", "en")

        await self.switch(stt, SPANISH, FRENCH)
        await stt._reconnect_websocket(2)
        self.assert_hints(self.urls(stt)[-1], "fr", "en")

    async def test_a_failed_connection_retries_with_the_hints(self):
        stt = await self.connected(ENGLISH)
        working = stt._websocket_connect.side_effect
        stt._websocket_connect.side_effect = OSError("network down")
        await self.switch(stt, ENGLISH, SPANISH)

        # No connection, so the hints had nowhere to go
        self.assertIsNone(stt._connected_model)
        self.assertEqual(self.configures(), [])

        stt._websocket_connect.side_effect = working
        await stt._connect_websocket()
        self.assert_hints(self.urls(stt)[-1], "es", "en")
        self.assertEqual(stt._connected_model, "flux-general-multi")

    async def test_a_late_hints_clear_is_not_sent_as_an_empty_configure(self):
        stt = await self.connected(SPANISH)
        self.speaking(stt)
        # The French hints are still waiting for their ack when the caller
        # picks an English voice, so the clear queues up behind them
        await self.switch(stt, SPANISH, FRENCH)
        await self.switch(stt, FRENCH, ENGLISH)
        await stt._on_configure_acked()

        self.assertEqual(self.configures(), [{"type": "Configure", "language_hints": ["fr", "en"]}])
        await self.stopped_speaking(stt)
        self.assertIn("model=flux-general-en", self.urls(stt)[-1])

    async def test_switching_back_while_held_drops_the_reconnect(self):
        stt = await self.connected(ENGLISH)
        self.speaking(stt)
        await self.switch(stt, ENGLISH, SPANISH)
        self.assertTrue(stt._need_reconnect)
        await self.switch(stt, SPANISH, ENGLISH)
        self.assertFalse(stt._need_reconnect)

        await self.stopped_speaking(stt)
        self.assertEqual(len(self.urls(stt)), 1)
        self.assertEqual(self.configures(), [])


if __name__ == "__main__":
    unittest.main()
