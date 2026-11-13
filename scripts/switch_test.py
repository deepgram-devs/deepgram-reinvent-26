"""Drive the real agent pipeline headlessly through a series of voice switches.

The caller's turns are synthesised with Deepgram Flux TTS and streamed into the
pipeline in real time, with silence in between, and the agent's audio is
"played" in real time and recorded. Everything else is the real run_bot:
Flux STT, Bedrock, Flux TTS, and the voice tools.

For each agent turn it reports what the caller said (as transcribed), the voice
tool calls, the reply text, the TTS voice in use, and the median pitch (F0) of
the reply audio. Featured voices of different genders are used, so a voice
that didn't actually change shows up as an unchanged F0.

Usage: .venv/bin/python scripts/switch_test.py
"""

import asyncio
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from loguru import logger

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

import agent  # noqa: E402
from pipecat.frames.frames import (  # noqa: E402
    InputAudioRawFrame,
    StartFrame,
    TranscriptionFrame,
    TTSTextFrame,
)
from pipecat.transports.base_input import BaseInputTransport  # noqa: E402
from pipecat.transports.base_output import BaseOutputTransport  # noqa: E402
from pipecat.transports.base_transport import BaseTransport, TransportParams  # noqa: E402
from probe_flux_languages import speak  # noqa: E402

IN_RATE = 16000
FRAME_MS = 20

# (caller voice, what the caller says, what we expect the agent to switch to)
SCRIPT = [
    ("flux-cole-en", "Can you switch to the voice Kit, please?", "kit"),
    ("flux-cole-en", "Can you speak Spanish?", "carmen"),
    ("flux-alfredo-es", "¿Qué información necesitan para buscar mi reclamación?", None),
    ("flux-cole-en", "Can you speak French, with a man's voice?", "a French man"),
    ("flux-cole-en", "Julien, please.", "julien"),
    ("flux-cole-en", "English, please.", "brooke"),
    # Speech before the switch must not be cut off by the TTS reconnect
    ("flux-cole-en", "Say hello, then switch to Spanish.", "carmen"),
    ("flux-cole-en", "English, please.", "brooke"),
    # A switch batched with a lookup: no filler in the outgoing voice
    ("flux-cole-en", "In Spanish please: what's the status of claim C L M two zero two six five two seven six one three? The last name is Walsh.", "carmen"),
]

events: list[tuple[float, str, str]] = []
t0 = time.monotonic()


def record(kind: str, text: str):
    events.append((time.monotonic() - t0, kind, text))


class HeadlessInput(BaseInputTransport):
    """Streams queued caller audio in real time, and silence otherwise."""

    def __init__(self, params):
        super().__init__(params)
        self.speech: asyncio.Queue[bytes] = asyncio.Queue()
        self.speaking = False
        self._feeder = None

    async def start(self, frame: StartFrame):
        await super().start(frame)
        await self.set_transport_ready(frame)
        self._feeder = self.create_task(self._feed())

    async def cleanup(self):
        if self._feeder:
            await self.cancel_task(self._feeder)
            self._feeder = None
        await super().cleanup()

    async def _feed(self):
        step = IN_RATE * 2 * FRAME_MS // 1000
        silence = b"\x00" * step
        next_at = time.monotonic()
        while True:
            buf = b""
            if not self.speech.empty():
                buf = self.speech.get_nowait()
                self.speaking = True
            chunks = [buf[i : i + step] for i in range(0, len(buf), step)] or [silence]
            for chunk in chunks:
                chunk = chunk.ljust(step, b"\x00")
                await self.push_audio_frame(InputAudioRawFrame(chunk, IN_RATE, 1))
                next_at += FRAME_MS / 1000
                await asyncio.sleep(max(0, next_at - time.monotonic()))
            self.speaking = False


class HeadlessOutput(BaseOutputTransport):
    """Plays the agent's audio in real time and records it per turn."""

    def __init__(self, params):
        super().__init__(params)
        self.last_audio = 0.0
        self.turns: list[dict] = []

    async def start(self, frame: StartFrame):
        await super().start(frame)
        await self.set_transport_ready(frame)

    def _turn(self) -> dict:
        now = time.monotonic()
        if not self.turns or now - self.last_audio > 0.8:
            self.turns.append({"start": now - t0, "audio": bytearray(), "rate": None, "voice": None, "text": []})
        return self.turns[-1]

    async def write_audio_frame(self, frame) -> bool:
        turn = self._turn()
        turn["audio"].extend(frame.audio)
        turn["rate"] = frame.sample_rate
        turn["voice"] = tts_voice()
        self.last_audio = time.monotonic()
        await asyncio.sleep(len(frame.audio) / (frame.sample_rate * 2))
        return True

    async def process_frame(self, frame, direction):
        if isinstance(frame, TTSTextFrame):
            record("said", f"[{tts_voice()}] {frame.text}")
        await super().process_frame(frame, direction)


class HeadlessTransport(BaseTransport):
    def __init__(self):
        super().__init__()
        params = TransportParams(audio_in_enabled=True, audio_out_enabled=True)
        self._in = HeadlessInput(params)
        self._out = HeadlessOutput(params)
        self._register_event_handler("on_client_connected")
        self._register_event_handler("on_client_disconnected")

    def input(self):
        return self._in

    def output(self):
        return self._out


# Record what Flux STT hears, and which voice TTS is using
_services = {}


class RecordingSTT(agent.DeepgramFluxSTTService):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        _services["stt"] = self

    async def push_frame(self, frame, direction=None):
        if isinstance(frame, TranscriptionFrame):
            record("heard", f"{frame.text!r} (lang={frame.language})")
        await (super().push_frame(frame) if direction is None else super().push_frame(frame, direction))


class RecordingTTS(agent.DeepgramFluxTTSService):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        _services["tts"] = self


def tts_voice():
    tts = _services.get("tts")
    return tts._settings.voice if tts else None


agent.DeepgramFluxSTTService = RecordingSTT
agent.DeepgramFluxTTSService = RecordingTTS


def median_f0(pcm: bytes, rate: int) -> float | None:
    """Median pitch of voiced frames, by autocorrelation."""
    x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    if rate is None or len(x) < rate // 4:
        return None
    win, hop = int(rate * 0.04), int(rate * 0.02)
    lo, hi = int(rate / 400), int(rate / 70)  # 70-400 Hz
    rms_floor = 0.1 * np.sqrt(np.mean(x**2))
    pitches = []
    for start in range(0, len(x) - win, hop):
        frame = x[start : start + win]
        frame = frame - frame.mean()
        if np.sqrt(np.mean(frame**2)) < rms_floor:
            continue
        ac = np.correlate(frame, frame, "full")[win - 1 :]
        if ac[0] <= 0:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / ac[0] > 0.45:  # voiced
            pitches.append(rate / lag)
    return float(np.median(pitches)) if len(pitches) > 10 else None


async def wait_for_agent_idle(out: HeadlessOutput, quiet: float = 2.5, timeout: float = 40):
    """Wait until the agent has spoken and then been quiet for a while."""
    started = time.monotonic()
    count = len(out.turns)
    while time.monotonic() - started < timeout:
        await asyncio.sleep(0.25)
        spoke = len(out.turns) > count or (out.turns and out.last_audio > started)
        if spoke and time.monotonic() - out.last_audio > quiet:
            return True
    return False


async def main():
    def sink(message):
        r = message.record
        text = r["message"]
        keep = ("Switching voice", "Configure", "reconnecting", "Connected to Flux", "Waited", "Verified caller", "Calling function")
        if r["level"].name in ("ERROR", "WARNING") or any(k in text for k in keep):
            record(r["level"].name.lower(), text[:220])

    logger.remove()
    logger.add(sink, level="DEBUG")

    print("Synthesising caller turns...")
    caller_audio = []
    for voice, text, _ in SCRIPT:
        audio, status = await speak(voice, text)
        assert audio, f"could not synthesise {text!r}: {status}"
        caller_audio.append(audio)

    transport = HeadlessTransport()
    bot = asyncio.create_task(agent.run_bot(transport, SimpleNamespace(handle_sigint=False)))
    await asyncio.sleep(2)
    await transport._call_event_handler("on_client_connected", None)

    out, inp = transport._out, transport._in
    print("Waiting for the greeting...")
    await wait_for_agent_idle(out)

    for (voice, text, expect), audio in zip(SCRIPT, caller_audio):
        record("caller", f"{text}  [{voice}]")
        print(f"  caller: {text}")
        await inp.speech.put(audio)
        await asyncio.sleep(len(audio) / (IN_RATE * 2))
        ok = await wait_for_agent_idle(out)
        if not ok:
            record("timeout", "agent did not reply within 40 s")

    await transport._call_event_handler("on_client_disconnected", None)
    await asyncio.wait_for(bot, 10)

    print("\n=== Timeline ===")
    turns = [
        (t["start"], "agent", t) for t in out.turns
    ]
    merged = sorted([(e[0], e[1], e[2]) for e in events] + turns, key=lambda e: e[0])
    for at, kind, item in merged:
        if kind == "agent":
            f0 = median_f0(bytes(item["audio"]), item["rate"])
            secs = len(item["audio"]) / (2 * (item["rate"] or 1))
            print(f"{at:6.1f}s  AUDIO    [{item['voice']}] {secs:.1f}s, median F0 {f0 and round(f0)} Hz")
        else:
            print(f"{at:6.1f}s  {kind.upper():8} {item}")


if __name__ == "__main__":
    asyncio.run(main())
