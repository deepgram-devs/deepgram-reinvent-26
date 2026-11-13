# Pipecat voice agent with Deepgram, AWS Bedrock, and AWS Strands

This is the agent code used in the AWS Workshop [Building intelligent voice AI agents with Amazon Nova Sonic, Amazon Bedrock and Pipecat](https://catalog.workshops.aws/voice-ai-agents/en-US). Follow the instructions in that workshop to configure an AWS environment to use with this code.

## Understanding the Botfile

To learn more about the architecture of a Pipecat botfile, you can read through the [Pipecat Overview](https://docs.pipecat.ai/guides/learn/overview). The rest of this guide will use some basic Pipecat terminology that's explained in those docs.

Let's build the `agent.py` file that contains your agent.

### Starting the botfile

You'll need these imports at the top of `agent.py`. You can add them now, or refer back to this list as you add other code to the file.

```python
import asyncio
import dataclasses
import os
import re
import threading
import time
import unicodedata
from datetime import datetime
from urllib.parse import unquote, urlparse

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import (
    LLMRunFrame,
    LLMUpdateSettingsFrame,
    STTUpdateSettingsFrame,
    TTSSpeakFrame,
    TTSUpdateSettingsFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frameworks.rtvi.frames import RTVIServerMessageFrame
from pipecat.processors.frameworks.rtvi.observer import (
    RTVIFunctionCallReportLevel,
    RTVIObserverParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.aws.llm import AWSBedrockLLMService
from pipecat.services.deepgram.flux.stt import DeepgramFluxSTTService
from pipecat.services.deepgram.flux.tts import DeepgramFluxTTSService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.turns.user_mute import MuteUntilFirstBotCompleteUserMuteStrategy
from pipecat.utils.text.transforms import expand_currency
from pipecat.workers.runner import WorkerRunner
from strands import Agent, tool
from strands.models import BedrockModel

import claims
import voices
from voices import Voice
```

Your bot uses a few different third-party services. The standard security practice is to make the API keys for those services available as environment variables. Here, we'll use a Python library to load a `.env` file with our keys:

```python
load_dotenv(override=True)

# Bedrock Knowledge Base Configuration
KNOWLEDGE_BASE_ID = os.getenv("KB_ID")

# How long a claim lookup runs before the agent says a hold line. A lookup
# that answers sooner goes straight to the answer: a hold line before an
# instant answer is a delay, not a courtesy.
HOLD_LINE_DELAY_SECS = 1.0
```

Rename `example.env` to `.env` and add your keys, as well as your KB_ID.

The knowledge base holds the sample auto claims in [kb-data/claims/](kb-data/claims/), one file per claim, named by claim ID (`CLM-2026-847291.txt`). If your knowledge base still has older sample claims, follow [Reset the knowledge base](docs/reset-knowledge-base.md) to erase them and load these. Uploading the new files on top isn't enough, because the old records stay in the vector store.

If you're using git, make sure to ignore that file in your `.gitignore` file:

```
# .gitignore

(...)
.env
```

Back in your `agent.py` file, we'll create a function called `run_bot`. This function contains the core logic of your bot. We'll use some other functions later in the file to run this function.

`run_bot` accepts three parameters:

* The `transport` parameter describes how your bot should connect to the user. By passing in different transport objects and configurations, you can use this same `run_bot` logic through a direct WebRTC connection using a `SmallWebRTCTransport`, or through Daily's hosted WebRTC service using `DailyTransport`, or through a websocket to Twilio using a `WebsocketTransport`.
* The `runner_args` parameter includes information unique to this bot session. For example, you can use `runner_args` to greet each user by name, or even pass the bot's system prompt in through `runner_args`.
* The `persona` parameter says who's on the call: a policyholder or a Tri-County employee.

### Two personas

Two kinds of people use this agent, and they need different tools, prompts, and screens:

| Persona | Who | What the agent does |
|---|---|---|
| `policyholder` | A customer calling about their own claim | Verifies the caller with a claim number and last name, reads that one claim record, and answers from it directly |
| `employee` | Tri-County staff | Searches every claim on file. The pipeline LLM hands each question to a Strands research agent that runs as many knowledge base searches as it needs |

The persona travels with the call. The claims UI has a **Policyholder / Tri-County staff** toggle on its landing screen, and it sends the choice with the WebRTC offer. Pipecat's runner hands it to the bot as `runner_args.body`, and the `bot()` entry point at the bottom of the file reads it with `persona_from_body` before calling `run_bot`. Anything other than `"employee"`, including no body at all, gets the policyholder persona, so a client that knows nothing about personas still works. Add the persona names just above where `run_bot` will go:

```python
# Who is on the call. The claims UI picks it before the call starts.
POLICYHOLDER = "policyholder"
EMPLOYEE = "employee"

# The tools that look up claims, which can take long enough to need a hold line
CLAIM_TOOLS = {"search_knowledge_base", "search_claims"}


def persona_from_body(body) -> str:
    """The persona the client asked for: employee, or policyholder by default."""
    if isinstance(body, dict) and body.get("persona") == EMPLOYEE:
        return EMPLOYEE
    return POLICYHOLDER
```

`CLAIM_TOOLS` names the tools that look up claims, one per persona. The hold line you'll add later plays for either of them.

```python
async def run_bot(
    transport: BaseTransport, runner_args: RunnerArguments, persona: str = POLICYHOLDER
):
    logger.info(f"Starting Tri-County claims voice agent ({persona})")
```

The heart of your botfile is the **Pipeline**. This is where you define the series of processors that will receive input from the user, process it, and generate output. Let's define our pipeline now, inside the `run_bot` function:

```python
    # Build the pipeline
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )
```

Let's look quickly at each processor in the pipeline.

The `transport.input()` is receiving media from the user and sending it through the pipeline as audio (and possibly video) frames. It's also creating other frames for things like connect/disconnect events, or when the user starts and stops speaking.

The `stt` processor is a speech-to-text service that receives the user's audio frames, sends them to a transcription service, and outputs the received transcription as TextFrames. We're using Deepgram Flux, a conversational speech recognition model with built-in turn detection: along with the transcript, it tells us when the user starts speaking and when they've finished their turn.

The `user_aggregator` processor is collecting text frames from the STT processor and listening for Flux's start-of-turn and end-of-turn events to know when the user has completed a 'turn'. Once Flux reports the end of the turn, this processor emits an LLM context frame to prompt a completion from the LLM processor.

The `llm` sends LLM context frames to an LLM service and returns the responses as a stream of text frames.

The `tts` service collects text frames from the LLM and sends them to a text-to-speech service, and then outputs audio frames with the generated audio.

The `transport.output()` receives the audio frames from the TTS service and plays them for the user.

Finally, the `assistant_aggregator` sees the audio and text frames after the transport has 'played' them, and aggregates them to store the bot's responses. The user and assistant aggregators are created as a pair that shares one `LLMContext`, which is how the user and bot turns are stored together.

If you try to run this botfile right now, you'd get an error, because none of those processors are actually defined yet. Let's add code just above here to define a few of these processors.

```python
    kb = BedrockKnowledgeBaseClient(KNOWLEDGE_BASE_ID)
    # Claim records read on this call, by claim ID, so each is read once
    records: dict[str, dict] = {}
    # Employees research across claims with a Strands agent; policyholders
    # look up one record and don't need one
    research_agent = ClaimsResearchAgent(kb, records) if persona == EMPLOYEE else None

    # The voice is the caller's only language setting: it picks the listen
    # model and the reply language too. Every call starts in English.
    current_voice = voices.DEFAULT_VOICE

    stt = DeepgramFluxSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        settings=DeepgramFluxSTTService.Settings(**voices.listen_settings(current_voice)),
    )

    tts = DeepgramFluxTTSService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        sample_rate=24000,
        settings=DeepgramFluxTTSService.Settings(voice=current_voice.model),
        # The prompt asks for no markdown; this guarantees it is never spoken
        text_transforms=[("*", strip_markup_symbols)],
    )

    # The model has no calendar, so tell it what day it is
    now = datetime.now()
    today = f"{now:%A, %B} {now.day}, {now.year}"

    llm = AWSBedrockLLMService(
        aws_region="us-east-1",
        settings=AWSBedrockLLMService.Settings(
            model="us.anthropic.claude-haiku-5-5",
            system_instruction=build_system_instruction(persona, current_voice, today),
        ),
    )
```

Every call gets its own `BedrockKnowledgeBaseClient` and its own `records` cache, keyed by claim ID, so a claim is read from the knowledge base once per call however many questions the caller asks about it. Only the employee persona gets a `ClaimsResearchAgent`. A policyholder's question is about one verified record, so there's nothing for a second agent to research.

Each service takes its configuration through a `Settings` object. The LLM's `system_instruction` is the system prompt that tells the bot how to behave, and `build_system_instruction` writes it for the persona on the call. Add it, with the greetings, above `run_bot`:

```python
GREETINGS = {
    POLICYHOLDER: (
        "Thanks for calling Tri-County Insurance auto claims. I can look up the "
        "status, repair estimate, payments, or adjuster notes on an existing auto "
        "claim. What's your claim number?"
    ),
    EMPLOYEE: "Tri-County claims desk. What would you like to look up?",
}


def build_system_instruction(persona: str, voice: Voice, today: str) -> str:
    """The system prompt, written for the ear: the agent is heard, not read.

    It's rebuilt whenever the voice changes, since it names the voice and the
    language to reply in. HOW TO SPEAK, PRIVACY, and VOICE AND LANGUAGE are
    the same for both personas.
    """
    if persona == EMPLOYEE:
        role = (
            "You are the internal claims assistant for Tri-County Insurance staff. "
            "You answer questions across every auto claim on file: which claims "
            "match, their status, amounts, adjusters, and notes."
        )
    else:
        role = (
            "You are the auto claims line voice agent for Tri-County Insurance. You "
            "help callers look up existing auto claims: status, repair estimates, "
            "payments, dates, the vehicle, and adjuster notes."
        )

    how_to_speak = (
        "HOW TO SPEAK:\n"
        "- You are being heard, not read. Never use markdown, bullet points, "
        "numbered lists, headings, or emoji.\n"
        "- Keep replies to one or two sentences, and ask one question at a time.\n"
        "- Say dollar amounts in words and dates with their weekday, e.g. "
        "'Monday, September 14th'.\n"
        "- When you repeat a claim ID back, say the letters, then the digits one "
        "at a time, e.g. 'C L M, two zero two six, eight four seven two nine one'.\n"
        "- If you do not know something, say so plainly. Never guess.\n"
    )

    if persona == EMPLOYEE:
        work = (
            "SEARCHING CLAIMS:\n"
            "- For any question about claims, call search_claims. Never answer "
            "claim details from memory.\n"
            "- Pass the question as a standalone question: turn 'what about the "
            "adjuster on that one?' into 'who is the adjuster on Daniel Mitchell's "
            "claim?'.\n"
            "- Say how many claims matched, then the few that matter most. Offer "
            "to go through the rest instead of listing them all.\n"
            "- You may answer general auto insurance questions briefly, in general "
            "terms, without searching.\n"
            "- Never invent a claim, amount, date, or status.\n"
        )
    else:
        work = (
            "CLAIM LOOKUPS:\n"
            "- For any question about a specific claim, call search_knowledge_base. "
            "Never answer claim details from memory.\n"
            "- The lookup returns the whole claim record. Answer only what was "
            "asked, in one or two sentences; leave out the rest of the record.\n"
            "- Call search_knowledge_base for every question about the claim, "
            "follow-ups included, even when its record is already in the "
            "conversation. The call is what shows the caller the answer on their "
            "screen, so pass the sections the question is about.\n"
            "- Claim IDs look like CLM-2026-847291: the letters C L M, a four-digit "
            "year, and a six-digit number. Callers may skip the letters or say the "
            "year as 'twenty twenty-six'; pass the ID as CLM-2026-847291.\n"
            "- If you are missing the year or any of the six digits, ask for them. "
            "Never fill in or change a digit.\n"
            "- You may answer general auto insurance questions, like what a "
            "deductible is or how collision and comprehensive differ, briefly and "
            "in general terms.\n"
            "- Never invent a claim, amount, date, or status.\n"
        )

    privacy = (
        "PRIVACY:\n"
        "- Never read out a policyholder's address, phone number, or email, or "
        "a full VIN or license plate. You may say the last four characters. "
        "Changes to contact details go through the policyholder's Tri-County agent.\n"
        "- You may say the other driver's name and insurer, never their policy "
        "number, VIN, or plate.\n"
        "- Never read map coordinates or photo IDs. You may say how many photos "
        "are on file.\n"
    )

    if persona == EMPLOYEE:
        rules = (
            "ESCALATION:\n"
            "- This desk looks up claims; it can't change them. If asked to update "
            "a claim, say the assigned adjuster makes changes.\n"
        )
    else:
        rules = (
            "VERIFICATION:\n"
            "- Before you share anything about a claim, verify the caller. Once you "
            "have the claim number, ask for the policyholder's last name.\n"
            "- Call search_knowledge_base only when you have both, and pass both.\n"
            "- If the lookup says the details don't match, tell the caller the claim "
            "number and last name don't match our records, and ask them to repeat the "
            "number and spell the last name.\n"
            "- Never say, confirm, or hint at the name on a claim, and never share "
            "details of a claim the caller has not been verified for.\n"
            "\n"
            "ESCALATION:\n"
            "- If the caller wants to file a new claim, dispute a decision, or asks for "
            "a person, say this line can only look up existing claims and their "
            "assigned adjuster can help.\n"
            "- If the caller needs a tow or roadside help, say this line can't send "
            "it and they should call the roadside assistance number on their "
            "insurance card.\n"
            "- If the caller describes an emergency or says someone is hurt, tell them "
            "to hang up and call 911.\n"
        )

    voice_rules = (
        "VOICE AND LANGUAGE:\n"
        "- If the caller asks for another language, or to speak with a different "
        "voice, call set_voice. Every language has its own voices.\n"
        "- Call set_voice before saying anything about the switch; you confirm "
        "after it.\n"
        "- Claim records are in English. Translate what you read from them into "
        "the language you reply in."
    )

    return "\n".join(
        [
            role,
            voices.voice_intro(voice),
            f"Today is {today}.",
            "",
            how_to_speak,
            work,
            privacy,
            rules,
            voice_rules,
        ]
    )
```

The prompt is built from blocks. `HOW TO SPEAK`, `PRIVACY`, and `VOICE AND LANGUAGE` are the same for both personas, because both hear the agent the same way and both get the same masked claim data. The role line, the block that describes the claim tool, and the rules at the end differ. A policyholder gets `CLAIM LOOKUPS`, `VERIFICATION`, and the full `ESCALATION` list. An employee gets `SEARCHING CLAIMS`, which tells the model to rewrite a follow-up like "and the adjuster?" into a standalone question before it searches, and a one-line `ESCALATION`: the desk looks up claims but can't change them. It's written for a listener who hears every word, and the [Prompting for the ear](#prompting-for-the-ear) section below explains each rule in it.

The STT model, the TTS voice, and one line of the prompt all come from `current_voice`, because the caller can change language mid-call by asking for a different voice. [Switching languages by voice](#switching-languages-by-voice) covers how that works.

Our main LLM, the one in the pipeline, is the one that talks to the caller. It reaches claim data through one tool call per persona. Claim records are personal, so the policyholder's tool verifies the caller before it returns anything: the LLM must pass the policyholder's last name with the claim ID. Define the `search_knowledge_base` handler, along with the helpers it uses to message the screen and load a claim:

```python
    # Failed verifications per claim ID, so a caller can't keep guessing names
    max_verification_attempts = 3
    failed_verifications: dict[str, int] = {}

    # The claim on the caller's screen, so it's sent once per verified claim
    shown_claim_id: str | None = None

    async def send_to_client(data: dict):
        """Send a message to the claims UI. task is created below, before any call."""
        await task.queue_frame(RTVIServerMessageFrame(data=data))

    async def send_voice():
        await send_to_client(
            {
                "type": "voice",
                "voice": current_voice.name,
                "language": current_voice.lang,
                "language_name": voices.language_of(current_voice).name,
                "stt_model": voices.listen_settings(current_voice)["model"],
            }
        )

    async def load_claim(claim_id: str) -> dict | None:
        """The claim's record, read once per call: one search and one file read."""
        if claim_id not in records:
            # boto3 blocks, so it runs on a thread: on the event loop it would
            # freeze the whole pipeline, hold line included, until it returned
            record = await asyncio.to_thread(kb.load_claim, claim_id)
            if record is None:
                return None
            records[claim_id] = record
        return records[claim_id]

    async def search_knowledge_base(params: FunctionCallParams):
        nonlocal shown_claim_id
        query = params.arguments.get("query", "")
        claim_id = normalize_claim_id(str(params.arguments.get("claim_id", "")))
        last_name = params.arguments.get("last_name", "")

        if not (query and claim_id and last_name):
            await params.result_callback(
                {
                    "error": "Missing full claim ID or last name",
                    "response": "Ask the caller for their full claim number, the letters C L M followed by the four-digit year and the six-digit number, and the policyholder's last name before looking up a claim.",
                }
            )
            return

        if failed_verifications.get(claim_id, 0) >= max_verification_attempts:
            await send_to_client({"type": "verification", "status": "locked"})
            await params.result_callback(
                {
                    "verified": False,
                    "response": "Too many failed verification attempts for this claim. Tell the caller you can't share details on this claim during this call, and that they can contact their Tri-County agent for help.",
                }
            )
            return

        if not claims.latin_letters(last_name):
            # A name in another script can't match the English records. Ask
            # for a spelling instead of counting it as a failed attempt.
            await params.result_callback(
                {
                    "verified": False,
                    "response": "Ask the caller to spell the policyholder's last name letter by letter, as it is written on the policy.",
                }
            )
            return

        # Verify in code, against the record itself, before any of it reaches
        # the LLM, so no prompt can talk the agent out of it
        if claim_id != shown_claim_id:
            await send_to_client({"type": "verification", "status": "checking"})
        started = time.perf_counter()
        try:
            record = await load_claim(claim_id)
        except Exception as e:
            logger.error(f"Error loading claim {claim_id}: {e}")
            await send_to_client({"type": "verification", "status": "error"})
            await params.result_callback(
                {
                    "verified": False,
                    "response": "The claim lookup failed. Apologize and ask the caller to try again in a moment.",
                }
            )
            return

        if record is None or not claims.policyholder_matches(record, last_name):
            failed_verifications[claim_id] = failed_verifications.get(claim_id, 0) + 1
            locked = failed_verifications[claim_id] >= max_verification_attempts
            # The UI learns only that it failed, never why
            await send_to_client(
                {"type": "verification", "status": "locked" if locked else "failed"}
            )
            logger.info(
                f"Verification failed for claim {claim_id} "
                f"({failed_verifications[claim_id]}/{max_verification_attempts})"
            )
            # The same answer whether the claim doesn't exist or the name is
            # wrong, so a caller can't probe for valid claims or names
            await params.result_callback(
                {
                    "verified": False,
                    "response": "The claim number and last name don't match our records. Share no claim details. Ask the caller to repeat the claim number and spell the policyholder's last name.",
                }
            )
            return

        logger.info(
            f"Verified caller for claim {claim_id} in "
            f"{(time.perf_counter() - started) * 1000:.0f} ms; answering: {query}"
        )
        await send_to_client({"type": "verification", "status": "verified"})
        sections = [
            s for s in params.arguments.get("sections") or [] if s in CLAIM_SECTIONS
        ]
        # Sent before the answer, so the screen points at it as it's spoken
        await send_to_client(
            {"type": "claim-focus", "claim_id": claim_id, "sections": sections or ["overview"]}
        )

        # The masked record, the same one the screen shows: the LLM answers
        # from it directly, with amounts and dates ready to speak
        await params.result_callback(
            {
                "query": query,
                "record": await expand_currency(claims.spoken_view(record), "*"),
            }
        )
        # After the answer is on its way. The record is already loaded, so
        # showing it costs nothing.
        if claim_id != shown_claim_id:
            await send_to_client({"type": "claim-loaded", "claim": claims.to_client_view(record)})
            shown_claim_id = claim_id
```

The verification lives in code, not just in the prompt. A prompt is a request: a determined caller can talk an LLM into skipping a step. Here, `load_claim` reads the claim's whole record, and `claims.policyholder_matches` compares the caller's last name with the policyholder's name on it before any of the record reaches the LLM. If the check fails, the LLM gets nothing from the record, so there's nothing for it to leak. The failure response is identical whether the claim doesn't exist or the name is wrong, so a caller can't use the agent to discover valid claim numbers or the names on them. After three failed attempts on a claim, the agent stops checking it for the rest of the call. The `VERIFICATION` section of the system prompt tells the LLM to ask for the last name and how to respond to a mismatch.

One read serves the whole lookup. `load_claim` costs one knowledge base search and one S3 read the first time a claim comes up, and nothing after that, because the record stays in `records` for the rest of the call. The same record verifies the caller, answers the question, and fills the screen: `claim-loaded` goes out straight from it, with no second fetch.

The LLM answers from the record directly. The tool result is `claims.spoken_view(record)`, the same masked view the screen shows, with dates and amounts already shaped for speech. Because the masking happens in code before the model sees anything, the policyholder's address, phone, and email, the full VIN and plate, and the map coordinates never reach the LLM at all. The prompt's `PRIVACY` rules become a second line of defense instead of the only one, and the `CLAIM LOOKUPS` rule "answer only what was asked" keeps a whole record from turning into a monologue.

Earlier versions of this agent passed the verified question to a Strands sub-agent, which searched for the record again and summarized it for the main LLM to rephrase. Once the record is fixed by verification, that sub-agent has nothing to decide, and it cost two extra model calls on every question. Handing the record to the main LLM removes them.

The employee persona registers a different tool. Its handler hands the question to the research agent and sends the claims the answer names to the screen:

```python
    async def search_claims(params: FunctionCallParams):
        question = str(params.arguments.get("question", "")).strip()
        if not question:
            await params.result_callback(
                {"response": "Ask the staff member what they want to find."}
            )
            return

        started = time.perf_counter()
        try:
            answer, matched = await research_agent.research_async(question)
        except Exception as e:
            logger.error(f"Error researching '{question}': {e}")
            await params.result_callback(
                {
                    "question": question,
                    "response": "The search failed. Apologize and ask them to try again in a moment.",
                }
            )
            return
        logger.info(
            f"Researched '{question}' in {(time.perf_counter() - started) * 1000:.0f} ms; "
            f"answer names {matched}"
        )

        await params.result_callback({"question": question, "answer": answer})
        # The claims the answer names, masked like the voice, for the screen
        await send_to_client(
            {
                "type": "search-results",
                "query": question,
                "claims": [claims.to_client_view(records[c]) for c in matched if c in records],
            }
        )
```

You'll build the `ClaimsResearchAgent` in [The employee persona: research with a Strands agent](#the-employee-persona-research-with-a-strands-agent). Its `research_async` returns the answer and the claim IDs it names, best match first, and the handler turns those IDs into masked views for the screen from the same `records` cache.

Both claim tools can take long enough that the caller deserves a hold line, so the next block adds one, registers the claim tool for the persona on the call, and adds the voice tools:

```python
    # Claim lookups still working, and the hold line waiting to be said
    lookups_running = 0
    hold_line_timer: asyncio.Task | None = None
    last_hold_line: str | None = None

    async def say_hold_line_after_delay():
        nonlocal last_hold_line
        await asyncio.sleep(HOLD_LINE_DELAY_SECS)
        if not lookups_running:
            return
        last_hold_line = voices.pick_filler(current_voice, last=last_hold_line)
        await tts.queue_frame(TTSSpeakFrame(last_hold_line, append_to_context=False))

    def cancel_hold_line():
        nonlocal hold_line_timer
        if hold_line_timer is not None:
            hold_line_timer.cancel()
            hold_line_timer = None

    def holds_the_line(handler):
        """Count a lookup as running until its result is handed back.

        The hold line is cancelled before the result reaches the LLM, so a
        quick answer is never preceded by "one moment".
        """

        async def counted(params: FunctionCallParams):
            nonlocal lookups_running
            lookups_running += 1
            running = True

            def finish():
                nonlocal lookups_running, running
                if running:
                    running = False
                    lookups_running -= 1
                    if not lookups_running:
                        cancel_hold_line()

            async def result_callback(result, **kwargs):
                finish()
                await params.result_callback(result, **kwargs)

            try:
                await handler(dataclasses.replace(params, result_callback=result_callback))
            finally:
                finish()

        return counted

    def reports_timing(handler):
        """Tell the claims UI how long a function took, for its function call row.

        The bot times it, since only the bot knows when the function really
        started and finished. The timing goes out just before the result.
        """

        async def timed(params: FunctionCallParams):
            started = time.perf_counter()

            async def result_callback(result, **kwargs):
                await send_to_client(
                    {
                        "type": "function-timing",
                        "tool_call_id": params.tool_call_id,
                        "ms": round((time.perf_counter() - started) * 1000),
                    }
                )
                await params.result_callback(result, **kwargs)

            await handler(dataclasses.replace(params, result_callback=result_callback))

        return timed

    if persona == EMPLOYEE:
        llm.register_function("search_claims", holds_the_line(reports_timing(search_claims)))
    else:
        llm.register_function(
            "search_knowledge_base", holds_the_line(reports_timing(search_knowledge_base))
        )

    async def apply_voice(voice: Voice, params: FunctionCallParams):
        """Switch voice, and with it the language, in place.

        The prompt, voice, and listen updates are queued before the function
        result, so the confirmation is the first turn in the new voice.
        """
        nonlocal current_voice
        old_voice, current_voice = current_voice, voice
        language_changed = voice.lang != old_voice.lang
        logger.info(f"Switching voice to {voice.model} (language changed: {language_changed})")

        await llm.queue_frame(
            LLMUpdateSettingsFrame(
                delta=AWSBedrockLLMService.Settings(
                    system_instruction=build_system_instruction(persona, voice, today)
                )
            )
        )
        # A voice change reconnects Flux TTS, which would cut off speech still
        # streaming in the old voice, so let that finish first
        waited = 0.0
        while tts.has_active_audio_context() and waited < 3.0:
            await asyncio.sleep(0.1)
            waited += 0.1
        if waited:
            logger.info(f"Waited {waited:.1f}s for speech in progress before switching voice")
        await tts.queue_frame(
            TTSUpdateSettingsFrame(delta=DeepgramFluxTTSService.Settings(voice=voice.model))
        )
        # A model change reconnects Flux STT; a hints change is a Configure on
        # the open connection. listen_steps orders them so a Configure only
        # ever reaches a flux-general-multi connection.
        for step in voices.listen_steps(old_voice, voice):
            await stt.queue_frame(
                STTUpdateSettingsFrame(delta=DeepgramFluxSTTService.Settings(**step))
            )

        await send_voice()
        await params.result_callback(
            {"response": voices.confirmation(voice, language_changed)}
        )

    async def set_voice(params: FunctionCallParams):
        voice = voices.find_voice(str(params.arguments.get("voice", "")))
        if voice is None:
            await params.result_callback(
                {"response": "No voice by that name. Call list_voices for the names."}
            )
            return
        await apply_voice(voice, params)

    async def list_voices(params: FunctionCallParams):
        await params.result_callback(
            {"response": voices.list_voices_text(str(params.arguments.get("language", "")))}
        )

    async def reset_voice(params: FunctionCallParams):
        await apply_voice(voices.DEFAULT_VOICE, params)

    llm.register_function("set_voice", reports_timing(set_voice))
    llm.register_function("list_voices", reports_timing(list_voices))
    llm.register_function("reset_voice", reports_timing(reset_voice))

    # If a claim lookup runs long, say a hold line so the caller isn't left
    # in silence. A lookup that answers within HOLD_LINE_DELAY_SECS skips it.
    # The line isn't added to the LLM context, it's in the current voice's
    # language, and it's never the same line twice in a row. When a voice
    # switch comes in the same batch, the switch's confirmation takes its place.
    @llm.event_handler("on_function_calls_started")
    async def on_function_calls_started(service, function_calls):
        nonlocal hold_line_timer
        names = {fc.function_name for fc in function_calls}
        if not names & CLAIM_TOOLS or names & {"set_voice", "reset_voice"}:
            return
        cancel_hold_line()
        hold_line_timer = asyncio.create_task(say_hold_line_after_delay())

    # The caller interrupted, so the lookup is cancelled: nothing to hold for
    @llm.event_handler("on_function_calls_cancelled")
    async def on_function_calls_cancelled(service, function_calls):
        cancel_hold_line()
```

Everything a lookup does that blocks, the boto3 calls and the Strands agent, runs on a worker thread with `asyncio.to_thread`. That matters more than it looks. Pipecat runs the whole call on one event loop: listening, speaking, and sending audio to the browser. A blocking call in a function handler freezes all of it, so the caller hears silence for the length of the lookup, then everything that queued up behind it at once.

A slow lookup still needs a hold line, because dead air on a phone call feels broken. A fast one doesn't: "One moment, please" followed instantly by the answer just adds a second of delay. So the hold line waits. The `on_function_calls_started` event fires as soon as the LLM decides to call a tool, and starts a timer when the batch includes one of the `CLAIM_TOOLS`. If the lookup is still running after `HOLD_LINE_DELAY_SECS`, the timer queues a `TTSSpeakFrame` straight to the TTS service. `holds_the_line` wraps the handler and cancels the timer the moment a result is ready, before the result reaches the LLM. A caller who interrupts cancels the lookup, and `on_function_calls_cancelled` cancels the timer too.

In practice the two personas behave differently. A policyholder's first lookup reads the record and usually earns a hold line; every follow-up comes from the `records` cache and answers too fast to need one. An employee's research runs several model calls and searches, so it almost always plays the line.

The line itself comes from a short list for the current voice's language, never the same one twice in a row, so the agent doesn't sound like a recording. Setting `append_to_context=False` keeps the hold line out of the conversation history, so it doesn't land between the tool call and its result. It only plays for claim lookups, since the voice tools answer instantly.

The `set_voice`, `list_voices`, and `reset_voice` functions let the caller change the agent's voice and language. They're explained in [Switching languages by voice](#switching-languages-by-voice).

Next, let's create the context and its aggregators. The `LLMContext` stores the user and bot turns, plus the tools the LLM can call: `tools_for(persona)` gives each persona its own claim tool alongside the voice tools. The greeting comes from `GREETINGS`, so a policyholder hears about claim lookups and staff hear the claims desk. We don't need to give the user aggregator a VAD analyzer: Deepgram Flux sends the start-of-turn and end-of-turn signals, and the aggregator uses them automatically. For more on how this works, see Pipecat's documentation on [context management](https://docs.pipecat.ai/guides/learn/context-management).

```python
    context = LLMContext(
        messages=[
            {
                "role": "user",
                "content": f"Start by saying exactly this: '{GREETINGS[persona]}'",
            },
        ],
        tools=tools_for(persona),
    )
    # Flux can turn the click and hiss of a microphone opening into a short
    # word ("two"), which would cut off the greeting and get an answer. The
    # caller has nothing to say before the greeting ends, so ignore their
    # audio until then.
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            user_mute_strategies=[MuteUntilFirstBotCompleteUserMuteStrategy()],
        ),
    )
```

The `MuteUntilFirstBotCompleteUserMuteStrategy` drops what the caller says until the greeting finishes. When the browser opens the microphone, the first audio can hold a click that Flux hears as a short word. Without the mute, that phantom word interrupts the greeting and the agent answers it.

### Prompting for the ear

Your agent is heard, not read, and that changes how you write its prompts. LLMs default to writing for a screen. Leave that unchecked and every answer comes back in markdown, which Flux TTS faithfully pronounces: `**Status:**` comes out as "star star status star star." The prompt `build_system_instruction` writes follows the five rules for voice prompts from the [Deepgram Builder Essentials course](https://github.com/deepgram-devs/deepgram-essentials-course/tree/main/steps/10-final):

| Rule | Why it matters out loud |
|---|---|
| **No markup.** "Never use markdown, bullet points, numbered lists, headings, or emoji." | Otherwise the caller hears every asterisk. Telling the model it's being heard is the instruction that changes its output. "Be conversational" doesn't. |
| **Short turns.** One or two sentences, one question at a time. | A caller can't skim. Ask two questions in one breath and you get one answer, and you won't know which question it answers. |
| **Data for the ear.** Amounts in words, dates with their weekday, claim IDs digit by digit. | A misheard "claim fifty" could be claim 15 or claim 50. Reading the digits back, "five zero," gives the caller a chance to catch it, and a weekday does the same for a date. |
| **Confident phrasing.** Say what you know, and say plainly when you don't. | Hedging sounds evasive in speech. "Never guess" is the line that stops the agent inventing a claim status. |
| **Named escalation triggers.** Spell out the situations the agent hands off. | "Use your judgement" isn't a trigger. "If the caller wants to file a new claim" is. |

The prompt stays short because Pipecat re-sends it on every turn, and a long prompt slows the first reply. The hard constraints sit at the end, where they're least likely to fade after a few turns. The prompt also tells the model today's date, since the model has no calendar of its own.

The greetings follow the same thinking. A greeting is the only thing the agent says before it knows anything about the caller, so it names what the agent can do and asks for the one thing it needs next. The policyholder greeting asks for the claim number. The staff greeting is shorter, because staff already know what the desk is for.

A prompt is a request, not a guarantee. To make sure markdown never reaches the caller, the TTS service runs its text through `strip_markup_symbols` before synthesis. Add it to `agent.py` just below `KNOWLEDGE_BASE_ID`:

```python
_MARKUP_SYMBOLS = re.compile(r"[*#`]")


async def strip_markup_symbols(text: str, text_type: str) -> str:
    """Drop markdown symbols before speech synthesis.

    Flux TTS receives the LLM's output token by token, so this has to work on a
    lone "**" as well as on whole sentences.
    """
    return _MARKUP_SYMBOLS.sub("", text)
```

Flux TTS streams the LLM's output to Deepgram token by token, so a `**` often arrives on its own. Pipecat's built-in `strip_markdown` transform only removes paired markers like `**bold**`, which is why this transform drops the symbols one character at a time instead. Text transforms change only what's sent to TTS; the conversation context keeps the LLM's original text. Hyphens stay, because the claim data uses them in claim IDs like `CLM-2026-847291` and policy numbers like `TCI-AUTO-482977`.

### Switching languages by voice

A caller can ask the agent to speak Spanish, or to use a different voice, and the agent switches mid-call. The design has one rule: **the voice implies the language.** Each Flux TTS voice belongs to exactly one language, so choosing a voice also chooses the listen model and the language the agent replies in. There's no separate language setting that could disagree with the voice.

All of that lives in `voices.py`, next to `agent.py`. Copy it from this repository: most of it is a catalog of about 145 voices. It's built from two tables:

```python
@dataclass(frozen=True)
class Language:
    code: str  # ISO code: the model suffix and the Flux language hint
    name: str  # used in the prompt and tool text
    # Hold lines, one spoken when a claim lookup runs long. Written in the
    # language itself, since the voice would otherwise read the English text
    # with a foreign accent. Each is neutral about the speaker's gender, since
    # any voice in the language may say it.
    fillers: tuple[str, ...]


@dataclass(frozen=True)
class Voice:
    name: str  # the short name the model chooses by
    model: str  # the Flux TTS model id sent to Deepgram
    blurb: str  # e.g. "Spanish woman"
    lang: str  # a code from LANGUAGES
    featured: bool = False  # named in the set_voice description
```

The catalog offers only the languages the agent can *hear*. A voice in a language the STT model can't understand is a voice nobody can talk back to. `flux-general-multi` hears English, Spanish, French, German, Hindi, Russian, Portuguese, Italian, and Dutch, so those nine are offered. (It also hears Japanese, but poorly enough that a Japanese voice would need Nova-3 for listening, a second STT service this agent doesn't run.)

`voices.listen_settings()` picks the STT settings for a voice. English listens with `flux-general-en`. Every other language listens with `flux-general-multi` and the language hints `[code, "en"]`. Keeping English in the hints matters: it's how "English, please" still gets heard after a switch to Spanish.

#### The tools

The LLM gets three functions:

- `set_voice(voice)` changes the voice, and with it the language. Its description names one featured voice per language and a handful of English voices. It has no `enum` of all 145 names, which would bloat every request. An unknown name is answered with "No voice by that name. Call list_voices for the names."
- `list_voices(language)` returns one language's voices with their accent and gender. A voice's name says nothing about either, so the description tells the model to call this first when a caller asks for "a man's voice."
- `reset_voice()` goes back to the default voice, and so to English.

#### The language line

`voices.voice_intro()` adds one sentence to the system prompt, right after the role, in every language including English:

```
Your voice is Carmen, a Spanish woman. Reply only in Spanish; for any other language, call set_voice first.
```

The wording comes from measurements on another Deepgram project, a voice device that switches languages the same way. Without a language line, English sessions answered "Can you speak French?" *in French, in the English voice*, without switching, in 5 of 16 tries. With the line, 0 of 16. A softer "Reply in Spanish unless asked otherwise" missed 1 of 12 language changes. "Reply only in… call set_voice first" missed none.

#### Applying a switch

`apply_voice` makes the switch in place, without dropping the call. It queues three settings updates, one for each service, and then returns the function result:

| Update | What the service does |
|---|---|
| `LLMUpdateSettingsFrame` with a new `system_instruction` | Replaces the system prompt, so the old language line is gone, not just contradicted |
| `TTSUpdateSettingsFrame` with the new `voice` | Flux TTS reconnects with the new voice model |
| One `STTUpdateSettingsFrame` per step from `listen_steps()`, only when the language changes | A change of model (English to or from `flux-general-multi`) reconnects Flux STT once the caller stops speaking. A change of hints alone (Spanish to French) is sent as a `Configure` message on the open connection |

Because the updates are queued before the result, the confirmation the LLM speaks next ("Sí, ahora hablo español") is the first turn in the new voice. The result asks for it in the new language: `Done: you are now Carmen, a Spanish voice. Say so briefly, in Spanish.`

The order of the listen steps matters. Only `flux-general-multi` accepts language hints, so `listen_steps()` sets hints after reconnecting to it and clears them before leaving it. That way a `Configure` never reaches a `flux-general-en` connection. The TTS update waits, for up to three seconds, for any speech still streaming in the old voice, because reconnecting Flux TTS would cut it off mid-word. The prompt also tells the LLM to call `set_voice` before saying anything about the switch.

Every call starts in English with the default voice. Callers are anonymous until they've been verified, so there's no one to remember a preference for.

#### Known limits

- Claim records are in English. The prompt tells the LLM to translate what it reads from them into the reply language.
- `policyholder_matches` compares letters A to Z, with accents removed. A last name the caller says in another script, such as Cyrillic, has to be spelled out in Latin letters.
- A caller who interrupts during the moment Flux STT reconnects may not be heard.

#### Testing it

`tests/test_voices.py` checks the catalog: unique names, the `flux-<name>-<lang>` pattern, one featured voice per language, and that every voice's language can be heard. `scripts/probe_flux_languages.py` checks the live API: for each language it synthesises a sentence with Flux TTS and streams it back through `flux-general-multi`. `scripts/switch_test.py` drives the whole agent through a series of switches with synthesised speech and reports the voice and pitch of every reply.

```bash
.venv/bin/python -m unittest discover tests
.venv/bin/python scripts/probe_flux_languages.py
.venv/bin/python scripts/switch_test.py
```

With the main LLM speaking for the ear, the research agent behind the employee persona needs the same treatment.

### The employee persona: research with a Strands agent

A policyholder asks about one record they've already proved is theirs. Staff ask questions like "which claims are waiting on a title?" or "which claims is Luis Ortega adjusting, and where do they stand?" No single search answers those reliably. The right claims might only match on a second wording, or the answer might combine what two searches found. That's a loop: search, read, decide whether to search again, then answer. It's exactly the job [Strands Agents](https://strandsagents.com/) is built for, so the employee persona hands each question to one. Just above the persona names, create a `ClaimsResearchAgent` class:

```python
class ClaimsResearchAgent:
    """A Strands agent that answers a staff member's question across all claims.

    A question like "which claims are waiting on a title?" can take several
    searches with different wording, and an answer that combines what they
    found. That's an agent loop, so it runs here, behind one tool call, and
    the voice LLM only hears the answer.
    """

    def __init__(self, kb: BedrockKnowledgeBaseClient, records: dict[str, dict]):
        self.kb = kb
        # Shared with the call, so a claim is read from S3 once per call
        self.records = records
        # The claims this question's searches found, best first
        self.matched: list[str] = []
        # One Agent runs one request at a time, so questions take turns
        self._lock = threading.Lock()

        session = boto3.Session(region_name=os.getenv("AWS_REGION", "us-east-1"))
        self.agent = Agent(
            tools=[self.search_claims],
            model=BedrockModel(model_id="us.amazon.nova-2-lite-v1:0", boto_session=session),
            # The answer goes back to the voice LLM; don't print it to the console
            callback_handler=None,
            system_prompt=(
                "You research Tri-County Insurance auto claims for a staff "
                "member. Another assistant speaks your answer, so write plain "
                "sentences: no markdown, bullet points, headings, or emoji. "
                "Call search_claims to find claims. Search as many times as you "
                "need, with different wording, to answer fully, then answer only "
                "from what the searches returned. Name each claim you mention by "
                "its policyholder and claim ID. If nothing matches, say so. "
                "Never invent a claim, amount, date, or status. "
                "Records are already masked: never try to reconstruct contact "
                "details, a full VIN, or a plate."
            ),
        )

    @tool
    def search_claims(self, query: str) -> str:
        """Search every claim record for a question, e.g. 'stolen vehicle not recovered' or 'waiting on title'. Returns the best-matching claims as JSON."""
        logger.info(f"Research search: {query}")
        found = []
        for hit in self.kb.search_claims(query):
            record = self.records.get(hit.claim_id)
            if record is None:
                record = self.kb.read_claim_file(hit)
                if record is None:
                    continue
                self.records[hit.claim_id] = record
            if hit.claim_id not in self.matched:
                self.matched.append(hit.claim_id)
            found.append(claims.spoken_view(record))
        if not found:
            return "No claims matched that search."
        return "[" + ",\n".join(found) + "]"

    def research(self, question: str) -> tuple[str, list[str]]:
        """The agent's answer, and the claims it names, best match first.

        A search returns its best matches whether they fit or not, so the
        screen lists only the claims the answer names, not every one found.
        Each question starts with an empty history: the voice LLM rewrites
        follow-ups as standalone questions, so the answer always comes from
        fresh searches.
        """
        with self._lock:
            self.matched = []
            self.agent.messages.clear()
            answer = str(self.agent(question)).strip()
            return answer, [c for c in self.matched if c in answer]

    async def research_async(self, question: str) -> tuple[str, list[str]]:
        """research on a worker thread.

        The Strands agent blocks until it's done, so on the event loop it
        would stall the voice pipeline. A caller who interrupts cancels the
        wait, not the thread, so the lock lives in research: a question still
        finishing on its thread keeps the next one waiting.
        """
        return await asyncio.to_thread(self.research, question)
```

The agent has one tool, `search_claims`, defined with the `@tool` decorator. Each call runs a knowledge base search, loads the records it found through the same `records` cache the call uses, and returns them as masked, speakable JSON with `claims.spoken_view`. The agent can call it as many times as it likes with different wording, then answers from what came back. Its model is Nova 2 Lite: the research is a reading task, and the pipeline LLM still decides what the caller hears.

`research` clears the agent's history before every question, so an answer always comes from fresh searches. That's safe because the pipeline LLM rewrites follow-ups into standalone questions before it calls the tool, as the `SEARCHING CLAIMS` prompt asks. It also returns only the claims the answer names. A search returns its best matches whether they fit or not, and the screen should list the claims the answer is about, not every claim the agent happened to read. Like the knowledge base calls, the agent blocks until it's done, so `research_async` runs it on a worker thread, and the lock lives in `research` so a question still finishing after an interruption keeps the next one waiting.

The research agent never talks to the caller directly, but its answer becomes the tool result the main LLM reads aloud. Any markdown it writes ends up in the caller's ear, so its `system_prompt` asks for plain sentences too.

Next, define the tools the pipeline LLM can call, just below the `build_system_instruction` function:

```python
# The parts of a claim the UI can point at, for search_knowledge_base's sections
CLAIM_SECTIONS = [
    "overview",
    "progress",
    "coverage",
    "policyholder",
    "vehicle",
    "incident",
    "location",
    "other_party",
    "damage",
    "photos",
    "estimate",
    "payments",
    "adjuster",
    "notes",
]

search_function = FunctionSchema(
    name="search_knowledge_base",
    description=(
        "Look up an existing Tri-County Insurance auto claim by its claim ID. Use "
        "this whenever the caller asks about a specific claim: its status, the "
        "vehicle, the accident, the other driver, the damage, the repair estimate, "
        "the deductible, rental, payments, the police report, the adjuster, or "
        "adjuster notes. Call it only once the caller has given both the full "
        "claim ID and the policyholder's last name; the lookup verifies the name "
        "before it returns any details."
    ),
    properties={
        "claim_id": {
            "type": "string",
            "description": (
                "The full claim ID as CLM-YYYY-NNNNNN, e.g. 'CLM-2026-847291': "
                "the four-digit year and the six-digit number."
            ),
        },
        "last_name": {
            "type": "string",
            "description": (
                "The policyholder's last name in Latin letters, as written on the "
                "policy. If the caller said or spelled it in another script, "
                "transliterate it."
            ),
        },
        "query": {
            "type": "string",
            "description": "The claim ID and what the caller wants to know, e.g. 'claim ID CLM-2026-847291 repair estimate'.",
        },
        "sections": {
            "type": "array",
            "items": {"type": "string", "enum": CLAIM_SECTIONS},
            "description": (
                "The parts of the claim the question is about, e.g. ['damage', "
                "'photos'] for 'where's the damage?'. The caller's screen "
                "highlights them. Use 'overview' when the caller first asks for "
                "the claim."
            ),
        },
    },
    required=["claim_id", "last_name", "query"],
)

set_voice_function = FunctionSchema(
    name="set_voice",
    description=voices.set_voice_description(),
    # No enum: listing ~150 voices would bloat every request
    properties={
        "voice": {
            "type": "string",
            "description": "The voice's short name in Latin letters, as listed, e.g. 'carmen'.",
        }
    },
    required=["voice"],
)

list_voices_function = FunctionSchema(
    name="list_voices",
    description=(
        "List the voices for one language, with each voice's accent and gender. "
        "Use it before set_voice when the caller describes a voice instead of "
        "naming one."
    ),
    properties={
        "language": {
            "type": "string",
            "enum": list(voices.LANGUAGES),
            "description": "ISO language code, e.g. 'es' for Spanish.",
        }
    },
    required=["language"],
)

reset_voice_function = FunctionSchema(
    name="reset_voice",
    description="Go back to the default voice, and so to English.",
    properties={},
    required=[],
)

search_claims_function = FunctionSchema(
    name="search_claims",
    description=(
        "Search every Tri-County auto claim to answer a staff member's question, "
        "e.g. 'which claims are waiting on a title?' or 'who is adjusting Daniel "
        "Mitchell's claim?'. A research agent runs as many searches as it needs "
        "and answers from the claim records."
    ),
    properties={
        "question": {
            "type": "string",
            "description": (
                "The staff member's question as a standalone question. Rewrite a "
                "follow-up like 'and the adjuster?' with the claim or policyholder "
                "it refers to."
            ),
        },
    },
    required=["question"],
)

VOICE_TOOLS = [set_voice_function, list_voices_function, reset_voice_function]


def tools_for(persona: str) -> ToolsSchema:
    """The pipeline LLM's tools: a claim tool for the persona, plus the voice tools."""
    claim_tool = search_claims_function if persona == EMPLOYEE else search_function
    return ToolsSchema(standard_tools=[claim_tool, *VOICE_TOOLS])
```

The tool descriptions are prompts as well. A description is the only thing an LLM reads when it decides whether to call a tool, so each one says *when* to use the tool, not only what it does. "Search the knowledge base" tells the model what a tool is. The `search_function` description tells the model when to reach for it, and the `search_claims_function` description tells it to pass a standalone question. The `@tool` docstring plays the same role for the research agent. `tools_for` gives each persona its own claim tool and the same voice tools, so a policyholder's LLM never sees a tool that searches every claim.

Both personas read claims through a `BedrockKnowledgeBaseClient`. Define it, with the claim ID helpers it needs, right above the `ClaimsResearchAgent` class:

```python
def claim_id_pattern(claim_id: str) -> re.Pattern:
    """Match a claim record's "Claim ID" line for exactly this claim.

    The \b word boundary keeps "Claim ID CLM-2026-84729" from matching
    "Claim ID CLM-2026-847291".
    """
    return re.compile(rf"\bClaim ID {re.escape(claim_id)}\b", re.IGNORECASE)


# The claim a knowledge base passage belongs to: every passage of a claim file
# repeats its claim ID, in the header or in a section title
_ANY_CLAIM_ID = re.compile(r"\bClaim ID (CLM-\d{4}-\d{6})\b", re.IGNORECASE)
# Claim files are named for their claim: claims/CLM-2026-847291.txt
_CLAIM_FILE = re.compile(r"\b(CLM-\d{4}-\d{6})\.txt$", re.IGNORECASE)

# s3.amazonaws.com, s3.us-east-1.amazonaws.com, s3-us-west-2.amazonaws.com
_S3_HOST = r"s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com"
_S3_PATH_STYLE = re.compile(rf"^{_S3_HOST}$")
_S3_VIRTUAL_HOSTED = re.compile(rf"^(?P<bucket>[a-z0-9.-]+)\.{_S3_HOST}$")


def s3_object(uri: str) -> tuple[str, str] | None:
    """The bucket and key of an S3 location, or None if it isn't one.

    Knowledge base results name their source file as s3://bucket/key or as an
    https URL, with the bucket either in the host name or first in the path.
    """
    url = urlparse(uri)
    host = url.hostname or ""
    path = unquote(url.path).lstrip("/")
    if url.scheme == "s3":
        bucket, key = url.netloc, path
    elif url.scheme == "https" and _S3_PATH_STYLE.match(host):
        bucket, _, key = path.partition("/")
    elif url.scheme == "https" and (match := _S3_VIRTUAL_HOSTED.match(host)):
        bucket, key = match.group("bucket"), path
    else:
        return None
    return (bucket, key) if bucket and key else None


def ascii_digits(text: str) -> str:
    """Only the digits, as 0 to 9: Devanagari "१२३४" becomes "1234"."""
    return "".join(str(unicodedata.digit(c)) for c in text if unicodedata.digit(c, None) is not None)


def normalize_claim_id(text: str) -> str:
    """Turn a claim number as heard into "CLM-2026-847291", or "" if incomplete.

    Only the digits count, so "CLM-2026-847291", "c l m 2026 847291", and
    digits transcribed in another script all give the same ID. Anything but a
    four-digit year plus a six-digit number comes back empty, so a partial
    number is never guessed into a full one.
    """
    digits = ascii_digits(text)
    return f"CLM-{digits[:4]}-{digits[4:]}" if len(digits) == 10 else ""


@dataclasses.dataclass(frozen=True)
class ClaimHit:
    """A claim a search found, and the file that holds it."""

    claim_id: str
    bucket: str
    key: str


class BedrockKnowledgeBaseClient:
    """Client for interacting with Amazon Bedrock Knowledge Base"""

    def __init__(self, knowledge_base_id: str):
        self.knowledge_base_id = knowledge_base_id
        # Credentials come from boto3's default chain: AWS_ACCESS_KEY_ID,
        # AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN in .env, or AWS_PROFILE.
        self.bedrock_agent_runtime = boto3.client(
            "bedrock-agent-runtime",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
        # Reads a claim's source file once search has found it
        self.s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))
        logger.info(
            f"Initialized Bedrock Knowledge Base client for KB: {knowledge_base_id}"
        )

    def _retrieve(self, text: str, search_type: str, max_results: int) -> dict:
        try:
            return self.bedrock_agent_runtime.retrieve(
                knowledgeBaseId=self.knowledge_base_id,
                retrievalQuery={"text": text},
                retrievalConfiguration={
                    "vectorSearchConfiguration": {
                        "numberOfResults": max_results,
                        "overrideSearchType": search_type,
                    }
                },
            )
        except ClientError as e:
            # Managed knowledge bases reject vectorSearchConfiguration and
            # take managedSearchConfiguration instead. It picks the search
            # type itself, but still honors the number of results.
            if "vectorSearchConfiguration is not supported" not in str(e):
                raise
            return self.bedrock_agent_runtime.retrieve(
                knowledgeBaseId=self.knowledge_base_id,
                retrievalQuery={"text": text},
                retrievalConfiguration={
                    "managedSearchConfiguration": {"numberOfResults": max_results}
                },
            )

    def _hits(self, response: dict) -> list[ClaimHit]:
        """Each claim the results name, best match first, with its file.

        A passage names its claim in its text, or, for a passage cut from the
        middle of a long section, in its file name. A claim counts once,
        however many of its passages matched. read_claim_file checks the
        claim against the file itself, so a misnamed file can't stand in.
        """
        hits: dict[str, ClaimHit] = {}
        for result in response.get("retrievalResults", []):
            location = s3_object(
                result.get("location", {}).get("s3Location", {}).get("uri", "")
            )
            if location is None:
                continue
            text = result.get("content", {}).get("text", "")
            match = _ANY_CLAIM_ID.search(text) or _CLAIM_FILE.search(location[1])
            if match is None:
                continue
            claim_id = match.group(1).upper()
            if claim_id not in hits:
                hits[claim_id] = ClaimHit(claim_id, *location)
        return list(hits.values())

    def read_claim_file(self, hit: ClaimHit) -> dict | None:
        """A claim's record as fields, read whole from its source file.

        Search returns passages, not records, so the file is read in full:
        the record is exact, whichever of its passages search happened to
        rank. None unless the file is that claim's record, not one that only
        mentions it.
        """
        body = self.s3.get_object(Bucket=hit.bucket, Key=hit.key)["Body"].read()
        record = claims.parse_claim(body.decode("utf-8"))
        return record if record["claim_id"] == hit.claim_id else None

    def load_claim(self, claim_id: str) -> dict | None:
        """One claim's record as fields, found by its exact claim ID.

        One search and one file read. The policyholder lookup verifies the
        caller against this record, then answers from it and shows it, so a
        claim is read once per call.
        """
        response = self._retrieve(f"Claim ID {claim_id}", "HYBRID", 10)
        for hit in self._hits(response):
            if hit.claim_id == claim_id:
                return self.read_claim_file(hit)
        return None

    def search_claims(self, query: str, max_results: int = 10) -> list[ClaimHit]:
        """The claims whose records best match a question, best match first."""
        return self._hits(self._retrieve(query, "HYBRID", max_results))
```

`_retrieve` runs a knowledge base search. A managed knowledge base, like the one the workshop creates, rejects the `vectorSearchConfiguration` setting, so `_retrieve` falls back to `managedSearchConfiguration`, which picks the search type itself.

A search returns passages, not records. `_hits` turns them into claims: one `ClaimHit` per claim, best match first, with the S3 file it came from. Every result names its source file in `location.s3Location.uri`, and `s3_object` turns that URI into a bucket and key. A passage usually names its claim in a `Claim ID` line, but the knowledge base splits each record into passages, and one cut from the middle of a long section may not repeat the ID. For those, `_hits` reads the claim ID from the file name instead, since every claim file is named for its claim (`CLM-2026-847291.txt`).

`read_claim_file` then reads the whole file and parses it with `claims.parse_claim`. Reading the file, instead of piecing the record together from search results, gives the agent the exact record every time, whichever passages the search happened to rank. The parsed record must carry the same claim ID as the hit, so a misnamed file can never stand in for another policyholder's claim.

`load_claim` is the policyholder's lookup. It searches for the exact claim ID and reads the file of the matching hit. The `\b` word boundary in the claim ID patterns keeps a mistyped ID like CLM-2026-84729 from matching CLM-2026-847291. `search_claims` is the employee's: it searches with the question itself and returns every claim it found, for the research agent to read.

The two helpers next to them handle callers who aren't speaking English. `ascii_digits` turns digits from any script into 0 to 9, so a claim number transcribed in Devanagari still finds the record. `normalize_claim_id` builds on it. Callers say claim IDs in many ways: "C L M twenty twenty-six, eight four seven two nine one," just the digits, or a mix. Only the digits matter, so it keeps those and rebuilds the ID as `CLM-2026-847291`. Anything other than a four-digit year and a six-digit number comes back empty, and `search_knowledge_base` asks the caller for the full number instead of guessing the missing year.

The rest of the claim handling lives in `claims.py`, next to `agent.py`. Copy it from this repository, like `voices.py`: most of it is `parse_claim`, which reads a claim file's sections into fields, and `to_client_view`, which applies the privacy rules. Three parts of it matter to the agent. The first shapes a record for the ear:

```python
_ORDINAL = {1: "st", 2: "nd", 3: "rd", 21: "st", 22: "nd", 23: "rd", 31: "st"}
_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def spoken_date(iso: str) -> str:
    """Format an ISO date the way a person says it, e.g. 'Monday, September 14th'.

    The weekday gives the caller a free second chance to catch a misheard date.
    """
    day = date.fromisoformat(iso)
    return f"{day:%A, %B} {day.day}{_ORDINAL.get(day.day, 'th')}"


def speak_dates(text: str) -> str:
    """Rewrite every ISO date in the text as a spoken date."""

    def replace(match: re.Match) -> str:
        try:
            return spoken_date(match.group())
        except ValueError:
            return match.group()

    return _ISO_DATE.sub(replace, text)


def spoken_view(claim: dict) -> str:
    """The claim as an LLM gets it: the client view, with dates ready to speak.

    It's the masked view, never the raw record, so the privacy rules hold in
    code. The prompt only has to keep the answer short.
    """
    return speak_dates(json.dumps(to_client_view(claim), ensure_ascii=False))
```

The knowledge base stores dates as `2026-09-14` and amounts as `$4,850`. Instead of asking the LLM to reformat them, the claim tools hand back text that's already shaped for speech. `speak_dates` turns `2026-09-14` into "Monday, September 14th," and the handler runs Pipecat's `expand_currency` transform over the result, which turns `$4,850` into "four thousand, eight hundred and fifty dollars." Pre-formatted values also keep the LLM's paraphrase close to the source. `spoken_view` applies both to `to_client_view`, never to the raw record, so the masking holds for every model that reads a claim. The result also leaves out search relevance scores and file names. Whatever the LLM never receives, it can't read aloud.

The second checks the caller's name:

```python
def latin_letters(text: str) -> str:
    """Only the letters a to z, accents removed: "W-A-L-S-H" and "walsh" match.

    A name in another script, such as Cyrillic or Devanagari, comes back empty.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    folded = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z]", "", folded)


def policyholder_matches(claim: dict, last_name: str) -> bool:
    """Whether the caller's last name is the policyholder's on this claim.

    Accepts the last word of the name, or everything after the first name for
    multi-word surnames like "De La Cruz". Only letters count, so a spelled
    out "W-A-L-S-H" matches "Walsh".
    """
    heard = latin_letters(last_name)
    names = claim["policyholder"]["name"].split()
    if not heard or len(names) < 2:
        return False
    return heard in {latin_letters(names[-1]), latin_letters("".join(names[1:]))}
```

`latin_letters` compares names on the letters a to z only, with accents removed, so "Núñez" matches "Nunez." Comparing letters only, without case, spaces, or punctuation, means a name the caller spells out, which Flux transcribes as "W-A-L-S-H," still matches "Walsh." A name transcribed in another script, such as Cyrillic, has no Latin letters at all, so `search_knowledge_base` asks the caller to spell it instead of counting a failed attempt. `policyholder_matches` accepts the last word of the name, or everything after the first name, so multi-word surnames like "De La Cruz" work either way.

Reading claim files takes one more AWS permission. The credentials in `.env` already need `bedrock:Retrieve` on the knowledge base. Add `s3:GetObject` on the bucket that holds the claim files, the one step 2 of [Reset the knowledge base](docs/reset-knowledge-base.md) saves as `BUCKET`:

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::<claims-bucket>/*"
}
```


Without it, every claim lookup and every search fails with `AccessDenied`, and the agent apologizes and asks the caller to try again. You can refer to the Amazon Knowledge Base documentation to learn more about this code.


### Finishing the Botfile

That takes care of everything except for the `transport` object in the pipeline. We'll come back to that later.

Next, we need to define a pipeline worker. This is what runs the pipeline. Do this right after you've defined your pipeline:

```python
    # Configure the pipeline worker
    task = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        # The claims UI shows which tool ran and with what arguments. Results
        # stay hidden: they hold the claim passages the LLM reads.
        rtvi_observer_params=RTVIObserverParams(
            function_call_report_level={
                "*": RTVIFunctionCallReportLevel.NAME,
                "search_knowledge_base": RTVIFunctionCallReportLevel.ARGUMENTS,
                "search_claims": RTVIFunctionCallReportLevel.ARGUMENTS,
                "set_voice": RTVIFunctionCallReportLevel.ARGUMENTS,
            }
        ),
    )
```

The `PipelineParams` enable metrics reporting, so you can see latency and token usage in the logs. The `rtvi_observer_params` decide what the claims UI learns about tool calls: the name of every call, and the arguments of the claim tools and `set_voice`, but never a result, since results hold the claim data the LLM reads.

Next, we need to add some event handlers so the pipeline knows how to handle the user connecting and disconnecting. First, when the user connects, we'll tell the screen which voice is speaking and push a frame that tells the LLM to run. The LLM responds to the greeting instruction we put in the context.

```python
    # Handle client connection event
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected to the Tri-County claims voice agent ({persona})")
        await send_voice()
        # Kick off the conversation
        await task.queue_frames([LLMRunFrame()])
```

And when the user disconnects, we'll cancel any waiting hold line and tell the bot to stop.

```python
    # Handle client disconnection event
    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected from the Tri-County claims voice agent")
        cancel_hold_line()
        await task.cancel()
```

Finally, we can create a `WorkerRunner`, add our pipeline worker to it, and actually run the pipeline.

```python
    # Run the pipeline
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(task)
    await runner.run()
```

That's all the code we need for the `run_bot` function. But in order to run that function, we need to define an entrypoint function called `bot` that configures the transport, reads the persona, and calls `run_bot`. Add this function at the bottom of your botfile, making sure it's at the top level of indentation so it's not inside the `run_bot` function.

```python
async def bot(runner_args: RunnerArguments):
    """Main bot entry point for the bot starter."""

    transport_params = {
        "daily": lambda: DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    }

    transport = await create_transport(runner_args, transport_params)

    # The claims UI sends the persona with its WebRTC offer, as request_data
    persona = persona_from_body(getattr(runner_args, "body", None))
    await run_bot(transport, runner_args, persona)
```

The `transport_params` object describes how we want to configure the various transports that this bot supports. In this case, we'll support the DailyTransport (`daily`) and the SmallWebRTCTransport (`webrtc`). The bot starter will request a transport type in the `runner_args`, and the `create_transport` function will create a transport object that gets passed to the `run_bot` function. `runner_args.body` carries the `request_data` the client sent with its offer, and `persona_from_body` turns it into a persona. Reading it with `getattr` keeps `bot()` working when a runner passes arguments without a body.

When you're developing locally, your 'bot runner' is built in to pipecat. We need to add one more thing to the bottom of our botfile for local development.

```python
if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
```

With this code at the bottom of the botfile, we can run `python agent.py` from the command line. The Pipecat built-in bot runner `main()` function will call the `bot()` function with some pre-configured arguments in `runner_args`, which will in turn call the `run_bot` function to actually run the bot.


## Showing the claim on screen

A voice agent answers one question at a time, and a caller only hears what they asked about. The claims UI in [client/](client/) adds a second channel. For a policyholder, once the caller is verified, the full claim appears on screen, and as the agent answers, the screen highlights the part of the claim it's talking about. For staff, the screen lists the claims each answer names, and any of them opens in the same claim view. The UI is a Next.js app built on Pipecat's [Voice UI Kit](https://github.com/pipecat-ai/voice-ui-kit) and client SDK, and it connects to the same `agent.py` over the SmallWebRTCTransport.

### Choosing a persona

The landing screen has a **Policyholder / Tri-County staff** toggle above the claim examples. The choice changes the landing copy and example questions, and it rides along with the call: [client/src/app/page.tsx](client/src/app/page.tsx) keeps one set of connect parameters per persona, each with `requestData: { persona }` on its `webrtcRequestParams`. The small WebRTC transport sends `requestData` in the body of its offer to `/api/offer`. There's a catch: the runner's `/api/offer` endpoint only reads the snake_case `request_data` field and silently drops `requestData`, so every call would start as a policyholder. [client/src/app/api/offer/route.ts](client/src/app/api/offer/route.ts) sits in front of the agent's endpoint, renames the field, and passes the offer and its ICE candidates through. The agent then reads the persona as `runner_args.body`. The persona is fixed once the call starts. Changing the connect parameters makes the Voice UI Kit build a new client, which is fine between calls and would end one in progress, so the toggle is disabled while connecting. The copy for each persona, including the **Try asking** prompts, lives in [client/src/lib/persona.tsx](client/src/lib/persona.tsx).

### How the agent talks to the screen

Pipecat already sends the browser the conversation itself: transcripts, the agent's words as they're spoken, and tool calls. The claims UI needs a few things only the agent knows, so `run_bot` sends them as RTVI server messages with `RTVIServerMessageFrame`:

| `type` | Persona | When | What it carries |
|---|---|---|---|
| `voice` | Both | When the caller connects, and after each voice switch | The voice, its language, and the Flux listen model |
| `verification` | Policyholder | Each time the agent checks a claim number and last name | `checking`, `verified`, `failed`, `locked`, or `error` when the lookup itself fails, and never why a check failed |
| `claim-focus` | Policyholder | Before each answer about a verified claim | The parts of the claim the answer covers, such as `damage` and `photos` |
| `claim-loaded` | Policyholder | The first time a claim is verified | The claim, masked for the screen |
| `search-results` | Employee | After each research answer | The question, and the claims the answer names, masked for the screen |
| `function-timing` | Both | Just before each function call's result | The call's `tool_call_id` and how long it took, in milliseconds, for its row in the chat log |

Each function call shows in the chat log as a one-line row, collapsed by default: the function, its main argument, and how long it took. Tap it to see the full request. The duration comes from the bot, since the browser only learns when a call started, and Pipecat backdates that so the row sorts before the reply it belongs to. The row shows arguments only, never results: the results hold the claim record.

The parts of the claim come from the LLM itself. `search_knowledge_base` takes an optional `sections` argument, and the model fills it in on the same call it already makes to look up the answer, so pointing at the screen costs no extra round trip.

The screen reads the same record the agent does. Verification loads the record into the call's `records` cache, and `claim-loaded` goes out from it right after the answer, so the screen costs no extra knowledge base search or S3 read. `search-results` works the same way: the research agent loads each record it reads into the cache, and the handler builds the screen's claim list from it.

On the employee's screen, the desk shows the question and one card per claim in the latest `search-results`: claim ID, policyholder, status, vehicle, and adjuster. Selecting a card opens that claim in the same review screen policyholders see, with a **Results** button to go back. The open claim stays open when a new search comes in, so staff can keep reading while they ask the next question.

### The screen follows the agent's privacy rules

`claims.to_client_view` applies the agent's privacy rules before anything leaves the server. The screen shows the last four characters of the VIN and plate, leaves out the policyholder's address, phone, and email, shows the other driver's name, insurer, and vehicle but not their policy number, VIN, or plate, and drops map coordinates and photo IDs. When a claim happened at home, the record names the home address as the location, so `to_client_view` replaces the address wherever it appears. It's also the only view of a claim the models get, through `spoken_view`, so the screen and the voice can't disagree about what's private. Staff get the same view: anyone can pick the staff persona in this demo, so it opens up every claim but none of the contact details. The tests in [tests/test_claim_view.py](tests/test_claim_view.py) check every sample claim for each of these.

### Run the claims UI

You need Node.js 20 or later. Start the agent in one terminal:

```bash
python agent.py
```

Then start the UI in another:

```bash
cd client
npm install
npm run dev
```

Open http://localhost:3000 and select **Start conversation**. The UI sends its WebRTC offer to `/api/offer`, and [client/src/app/api/offer/route.ts](client/src/app/api/offer/route.ts) passes it to the agent on port 7860, with the persona renamed to the field the runner reads. [client/next.config.ts](client/next.config.ts) passes the agent's other endpoints through. Set `BOT_URL` to point the UI at an agent somewhere else. Pipecat's prebuilt test client still works at http://localhost:7860/client.

Say a claim number, such as "C L M, two zero two six, eight four seven two nine one," and the last name "Mitchell" when the agent asks for it. The **Try asking** prompts also send their question as text, which helps in a noisy room.
For the staff persona, select **Tri-County staff** before you start, and ask a question across the claims, such as "Which claims are waiting on a title?" or "Which claims is Luis Ortega adjusting?"

To work on the screens without a call, open http://localhost:3000/?fixture=CLM-2026-847291&screen=review. The `screen` can be `landing`, `listening`, `found`, or `review`, and any sample claim ID works. For the staff desk, open http://localhost:3000/?persona=employee&fixture=search, with `screen=listening` for the desk before its first search or `screen=landing` for the staff landing screen. The fixtures in `client/src/fixtures/claims.json` are the same masked view the agent sends; regenerate them after changing a claim record or `to_client_view`:

```bash
.venv/bin/python scripts/export_claim_fixtures.py
```

Fixtures load only in development, so no claim data ships in a production build. Connecting the UI to an agent on Pipecat Cloud isn't covered yet.

## Deploying to Pipecat Cloud

You can deploy this bot to Pipecat Cloud and get production-ready infrastructure in about 5 minutes. Rename your file from `agent.py` to `bot.py`, then follow the instructions from [the Pipecat Cloud Quickstart](https://github.com/pipecat-ai/pipecat-quickstart?tab=readme-ov-file#step-2-deploy-to-production-5-min)!
