import sys
import unittest
from pathlib import Path

from pipecat.frames.frames import InputAudioRawFrame
from pipecat.tests.utils import run_test

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import MIC_OPEN_GATE_MS, MicGate  # noqa: E402

RATE = 16000
# 20 ms of 16-bit mono audio, none of it silent
SPEECH = bytes(range(1, 256)) * 2 + bytes(range(1, 131))
assert len(SPEECH) == RATE // 50 * 2


def audio() -> InputAudioRawFrame:
    return InputAudioRawFrame(audio=SPEECH, sample_rate=RATE, num_channels=1)


class MicGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_the_first_moment_is_silenced(self):
        gated = MIC_OPEN_GATE_MS // 20
        frames = [audio() for _ in range(gated + 3)]
        down, _ = await run_test(
            MicGate(),
            frames_to_send=frames,
            expected_down_frames=[InputAudioRawFrame] * len(frames),
        )
        # The click's window is silence of the same length
        for frame in down[:gated]:
            self.assertEqual(frame.audio, bytes(len(SPEECH)))
            self.assertEqual(frame.num_frames, len(SPEECH) // 2)
        # After it, the caller is heard as they are
        for frame in down[gated:]:
            self.assertEqual(frame.audio, SPEECH)

    async def test_the_window_is_counted_in_audio(self):
        # One long frame covers the whole window, so the next is heard
        long = InputAudioRawFrame(
            audio=bytes(1) * (RATE * 2 * MIC_OPEN_GATE_MS // 1000),
            sample_rate=RATE,
            num_channels=1,
        )
        down, _ = await run_test(
            MicGate(),
            frames_to_send=[long, audio()],
            expected_down_frames=[InputAudioRawFrame, InputAudioRawFrame],
        )
        self.assertEqual(down[1].audio, SPEECH)


if __name__ == "__main__":
    unittest.main()
