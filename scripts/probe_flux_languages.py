"""Probe Deepgram Flux speak and listen for every language in voices.py.

For each language: synthesise a sentence with the featured voice on /v2/speak,
then stream that audio in real time into /v2/listen on flux-general-multi with
language hints [code, "en"], and report what came back. A language should ship
only if both directions work.

Also checks that an unsupported hint is refused, and that English still works
on flux-general-en.

Usage: .venv/bin/python scripts/probe_flux_languages.py [codes...]
Reads DEEPGRAM_API_KEY from .env. The key is never printed.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import websockets
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voices import LANGUAGES, VOICES, listen_settings  # noqa: E402

RATE = 16000
CHUNK_MS = 80

SENTENCES = {
    "en": "Can you tell me the status of my claim, please?",
    "es": "¿Puede decirme el estado de mi reclamación, por favor?",
    "fr": "Pouvez-vous me dire où en est ma déclaration de sinistre, s'il vous plaît ?",
    "de": "Können Sie mir bitte den Stand meiner Schadensmeldung sagen?",
    "hi": "क्या आप मुझे मेरे क्लेम की स्थिति बता सकते हैं?",
    "ru": "Подскажите, пожалуйста, статус моего страхового случая.",
    "pt": "Você pode me dizer o status do meu sinistro, por favor?",
    "it": "Può dirmi lo stato della mia richiesta di risarcimento, per favore?",
    "nl": "Kunt u mij de status van mijn schadeclaim vertellen, alstublieft?",
}


def headers():
    return {"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"}


def describe_error(e: Exception) -> str:
    status = getattr(getattr(e, "response", None), "status_code", None)
    return f"HTTP {status}" if status else f"{type(e).__name__}: {e}"


async def speak(model: str, text: str, timeout: float = 10.0) -> tuple[bytes, str]:
    """Synthesise text on /v2/speak. Returns (audio, status)."""
    url = "wss://api.deepgram.com/v2/speak?" + urlencode(
        {"model": model, "encoding": "linear16", "sample_rate": RATE}
    )
    audio = bytearray()
    try:
        async with websockets.connect(url, additional_headers=headers()) as ws:
            await ws.send(json.dumps({"type": "Speak", "text": text}))
            await ws.send(json.dumps({"type": "Flush"}))
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                try:
                    msg = await asyncio.wait_for(ws.recv(), deadline - time.monotonic())
                except asyncio.TimeoutError:
                    break
                if isinstance(msg, bytes):
                    audio.extend(msg)
                else:
                    data = json.loads(msg)
                    if data.get("type") == "SpeechMetadata":
                        return bytes(audio), "ok"
                    if data.get("type") in ("Error", "Warning"):
                        return bytes(audio), f"{data.get('type')}: {data.get('description') or data}"
            return bytes(audio), "ok (no SpeechMetadata)" if audio else "timeout, no audio"
    except Exception as e:
        return bytes(audio), describe_error(e)


async def listen(audio: bytes, model: str, hints: list[str]) -> tuple[str, list, str]:
    """Stream audio in real time to /v2/listen. Returns (transcript, languages, status)."""
    params = [("model", model), ("encoding", "linear16"), ("sample_rate", RATE)]
    params += [("language_hint", h) for h in hints]
    url = "wss://api.deepgram.com/v2/listen?" + urlencode(params)
    turns: list[str] = []
    languages: list = []
    status = "ok"
    try:
        async with websockets.connect(url, additional_headers=headers()) as ws:

            async def send():
                step = RATE * 2 * CHUNK_MS // 1000
                # Real-time pacing: a little lead-in silence, the speech, then
                # trailing silence so Flux ends the turn
                for buf in (b"\x00" * RATE, audio, b"\x00" * RATE * 2 * 2):
                    for i in range(0, len(buf), step):
                        await ws.send(buf[i : i + step])
                        await asyncio.sleep(CHUNK_MS / 1000)
                await ws.send(json.dumps({"type": "CloseStream"}))

            sender = asyncio.create_task(send())
            try:
                async for msg in ws:
                    if isinstance(msg, bytes):
                        continue
                    data = json.loads(msg)
                    kind = data.get("type")
                    if kind == "TurnInfo" and data.get("event") == "EndOfTurn":
                        turns.append(data.get("transcript", ""))
                        languages = data.get("languages") or languages
                    elif kind in ("Error", "Warning"):
                        status = f"{kind}: {data.get('description') or data.get('code') or data}"
                        if kind == "Error":
                            break
            finally:
                sender.cancel()
    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError as e:
        # A server-side close with an error code is a refusal, not a pass
        close = e.rcvd
        status = f"closed {close.code}: {close.reason}" if close else f"closed: {e}"
    except Exception as e:
        status = describe_error(e)
    return " ".join(t for t in turns if t).strip(), languages, status


async def probe_language(code: str) -> bool:
    language = LANGUAGES[code]
    voice = next(v for v in VOICES if v.lang == code and v.featured)
    sentence = SENTENCES[code]

    audio, speak_status = await speak(voice.model, sentence)
    secs = len(audio) / (RATE * 2)
    print(f"\n[{code}] {language.name}: speak {voice.model}: {speak_status}, {len(audio)} bytes ({secs:.1f}s)")

    for filler in language.fillers:
        filler_audio, filler_status = await speak(voice.model, filler)
        print(f"[{code}]   filler: {filler_status}, {len(filler_audio) / (RATE * 2):.1f}s  {filler}")

    if not audio:
        return False

    # Probe exactly what the agent sends for this voice
    settings = listen_settings(voice)
    model = settings["model"]
    hints = [str(h) for h in settings["language_hints"] or []]
    transcript, languages, listen_status = await listen(audio, model, hints)
    print(f"[{code}]   listen {model} hints={hints}: {listen_status}")
    print(f"[{code}]   sent:  {sentence}")
    print(f"[{code}]   heard: {transcript or '(nothing)'}   languages={languages}")
    return speak_status.startswith("ok") and listen_status == "ok" and bool(transcript)


async def main():
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)
    if not os.environ.get("DEEPGRAM_API_KEY"):
        sys.exit("DEEPGRAM_API_KEY is not set")

    codes = sys.argv[1:] or list(LANGUAGES)
    results = {code: await probe_language(code) for code in codes}

    # English must also still be heard by multi, since "English, please" is
    # how a caller gets back from another language
    audio, _ = await speak("flux-heather-en", SENTENCES["en"])
    transcript, languages, status = await listen(audio, "flux-general-multi", ["es", "en"])
    print(f"\n[multi hearing English, hints es+en]: {status}: {transcript!r} languages={languages}")

    # A hint outside flux-general-multi's languages should be refused
    audio, _ = await speak("flux-carmen-es", SENTENCES["es"])
    _, _, status = await listen(audio, "flux-general-multi", ["bg", "en"])
    print(f"[unsupported hint bg]: {status}")

    print("\nSUMMARY: " + ", ".join(f"{c}={'PASS' if ok else 'FAIL'}" for c, ok in results.items()))


if __name__ == "__main__":
    asyncio.run(main())
