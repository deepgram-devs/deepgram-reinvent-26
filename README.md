# Pipecat voice agent with Deepgram, AWS Bedrock, AWS Strands, and pg_vector

This is the agent code used in the AWS Workshop [Building intelligent voice AI agents with Amazon Nova Sonic, Amazon Bedrock and Pipecat](https://catalog.workshops.aws/voice-ai-agents/en-US). Follow the instructions in that workshop to configure an AWS environment to use with this code.

## Understanding the Botfile

To learn more about the architecture of a Pipecat botfile, you can read through the [Pipecat Overview](https://docs.pipecat.ai/guides/learn/overview). The rest of this guide will use some basic Pipecat terminology that's explained in those docs.

Let's build the `agent.py` file that contains your agent.

### Starting the botfile

You'll need these imports at the top of `agent.py`. You can add them now, or refer back to this list as you add other code to the file.

```python
import asyncio
import os
import re
import unicodedata
from datetime import date, datetime

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
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.aws.llm import AWSBedrockLLMService
from pipecat.services.deepgram.flux.stt import DeepgramFluxSTTService
from pipecat.services.deepgram.flux.tts import DeepgramFluxTTSService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.utils.text.transforms import expand_currency
from pipecat.workers.runner import WorkerRunner
from strands import Agent, tool
from strands.models import BedrockModel

import voices
from voices import Voice
```

Your bot uses a few different third-party services. The standard security practice is to make the API keys for those services available as environment variables. Here, we'll use a Python library to load a `.env` file with our keys:

```python

load_dotenv(override=True)

# Bedrock Knowledge Base Configuration
KNOWLEDGE_BASE_ID = os.getenv("KB_ID")
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

`run_bot` accepts two parameters: 

* The `transport` parameter describes how your bot should connect to the user. By passing in different transport objects and configurations, you can use this same `run_bot` logic through a direct WebRTC connection using a `SmallWebRTCTransport`, or through Daily's hosted WebRTC service using `DailyTransport`, or through a websocket to Twilio using a `WebsocketTransport`.
* The `runner_args` parameter includes information unique to this bot session. For example, you can use `runner_args` to greet each user by name, or even pass the bot's system prompt in through `runner_args`.

```python

async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting Bedrock Knowledge Base Voice Agent with Strands")
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
    #just below logger.info(f"Starting Bedrock Knowledge Base Voice Agent with Strands")
    strands_agent = StrandsAgent()

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

    # System instruction, written for the ear: the agent is heard, not read.
    # It's rebuilt whenever the voice changes, since it names the voice and
    # the language to reply in.
    def build_system_instruction(voice: Voice) -> str:
        return (
            "You are the auto claims line voice agent for Tri-County Insurance. You "
            "help callers look up existing auto claims: status, repair estimates, "
            "payments, dates, the vehicle, and adjuster notes.\n"
            f"{voices.voice_intro(voice)}\n"
            f"Today is {today}.\n"
            "\n"
            "HOW TO SPEAK:\n"
            "- You are being heard, not read. Never use markdown, bullet points, "
            "numbered lists, headings, or emoji.\n"
            "- Keep replies to one or two sentences, and ask one question at a time.\n"
            "- Say dollar amounts in words and dates with their weekday, e.g. "
            "'Monday, September 14th'.\n"
            "- When you repeat a claim ID back, say the letters, then the digits one "
            "at a time, e.g. 'C L M, two zero two six, eight four seven two nine one'.\n"
            "- If you do not know something, say so plainly. Never guess.\n"
            "\n"
            "CLAIM LOOKUPS:\n"
            "- For any question about a specific claim, call search_knowledge_base. "
            "Never answer claim details from memory.\n"
            "- Claim IDs look like CLM-2026-847291: the letters C L M, a four-digit "
            "year, and a six-digit number. Callers may skip the letters or say the "
            "year as 'twenty twenty-six'; pass the ID as CLM-2026-847291.\n"
            "- If you are missing the year or any of the six digits, ask for them. "
            "Never fill in or change a digit.\n"
            "- You may answer general auto insurance questions, like what a "
            "deductible is or how collision and comprehensive differ, briefly and "
            "in general terms.\n"
            "- Never invent a claim, amount, date, or status.\n"
            "\n"
            "PRIVACY:\n"
            "- Never read out the policyholder's address, phone number, or email, or "
            "a full VIN or license plate. You may say the last four characters. "
            "Changes to contact details go through the caller's Tri-County agent.\n"
            "- You may tell the caller the other driver's name and insurer, never "
            "their policy number, VIN, or plate.\n"
            "- Never read map coordinates or photo IDs. You may say how many photos "
            "are on file.\n"
            "\n"
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
            "\n"
            "VOICE AND LANGUAGE:\n"
            "- If the caller asks for another language, or to speak with a different "
            "voice, call set_voice. Every language has its own voices.\n"
            "- Call set_voice before saying anything about the switch; you confirm "
            "after it.\n"
            "- Claim records are in English. Translate what you read from them into "
            "the language you reply in."
        )

    llm = AWSBedrockLLMService(
        aws_region="us-east-1",
        settings=AWSBedrockLLMService.Settings(
            model="us.anthropic.claude-haiku-5-5",
            system_instruction=build_system_instruction(current_voice),
        ),
    )
```

Each service takes its configuration through a `Settings` object. The LLM's `system_instruction` is the system prompt that tells the bot how to behave. It's written for a caller who hears every word, and the [Prompting for the ear](#prompting-for-the-ear) section below explains each rule in it.

The STT model, the TTS voice, and one line of the prompt all come from `current_voice`, because the caller can change language mid-call by asking for a different voice. [Switching languages by voice](#switching-languages-by-voice) covers how that works.

Our main LLM, the one in the pipeline, is the one that interacts with the user. We need to give it a way to pass queries to the Strands agent. We'll do that with a tool call. Claim records are personal, so the function verifies the caller before anything is looked up: the LLM must pass the policyholder's last name with the claim ID. Define a `search_knowledge_base` function, and register it with the LLM:

```python
    # Failed verifications per claim ID, so a caller can't keep guessing names
    max_verification_attempts = 3
    failed_verifications: dict[str, int] = {}

    async def search_knowledge_base(params: FunctionCallParams):
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
            await params.result_callback(
                {
                    "verified": False,
                    "response": "Too many failed verification attempts for this claim. Tell the caller you can't share details on this claim during this call, and that they can contact their Tri-County agent for help.",
                }
            )
            return

        if not latin_letters(last_name):
            # A name in another script can't match the English records. Ask
            # for a spelling instead of counting it as a failed attempt.
            await params.result_callback(
                {
                    "verified": False,
                    "response": "Ask the caller to spell the policyholder's last name letter by letter, as it is written on the policy.",
                }
            )
            return

        # Verify before the Strands agent sees the request, so no claim
        # details are retrieved for an unverified caller
        try:
            verified = strands_agent.bedrock_client.verify_policyholder(
                claim_id, last_name
            )
        except Exception as e:
            logger.error(f"Error verifying claim {claim_id}: {e}")
            await params.result_callback(
                {
                    "verified": False,
                    "response": "The verification lookup failed. Apologize and ask the caller to try again in a moment.",
                }
            )
            return

        if not verified:
            failed_verifications[claim_id] = failed_verifications.get(claim_id, 0) + 1
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

        logger.info(f"Verified caller for claim {claim_id}; using Strands agent for: {query}")

        try:
            response_text = strands_agent.process_query(
                f"claim ID {claim_id}: {query}", claim_id=claim_id
            )

            await params.result_callback(
                {
                    "query": query,
                    "response": response_text,                }
            )

        except Exception as e:
            logger.error(f"Error with Strands agent for {query}: {e}")
            await params.result_callback(
                {
                    "query": query,
                    "response": f"I encountered an error while searching for '{query}'. Please try again.",                }
            )

    llm.register_function("search_knowledge_base", search_knowledge_base)

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
                    system_instruction=build_system_instruction(voice)
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

    llm.register_function("set_voice", set_voice)
    llm.register_function("list_voices", list_voices)
    llm.register_function("reset_voice", reset_voice)

    # Speak a filler phrase while the knowledge base lookup runs, so the
    # caller isn't left in silence. It isn't added to the LLM context, and
    # it's in the current voice's language. When a voice switch comes in the
    # same batch, the switch's confirmation takes its place.
    @llm.event_handler("on_function_calls_started")
    async def on_function_calls_started(service, function_calls):
        names = {fc.function_name for fc in function_calls}
        if "search_knowledge_base" not in names or names & {"set_voice", "reset_voice"}:
            return
        await tts.queue_frame(
            TTSSpeakFrame(
                voices.language_of(current_voice).filler,
                append_to_context=False,
            )
        )
```

The verification lives in code, not just in the prompt. A prompt is a request: a determined caller can talk an LLM into skipping a step. Here, `verify_policyholder` checks the last name against the claim record, which we'll add to the `BedrockKnowledgeBaseClient` later, before the Strands agent sees the request. If the check fails, no claim details are retrieved, so there's nothing for the LLM to leak. The failure response is identical whether the claim doesn't exist or the name is wrong, so a caller can't use the agent to discover valid claim numbers or the names on them. After three failed attempts on a claim, the agent stops checking it for the rest of the call. The `VERIFICATION` section of the system prompt tells the LLM to ask for the last name and how to respond to a mismatch.

A knowledge base lookup takes a moment, and dead air on a phone call feels broken. The `on_function_calls_started` event fires as soon as the LLM decides to call a tool, so we use it to queue a `TTSSpeakFrame` straight to the TTS service. The caller hears "Let me look that up for you" while the Strands agent does its work. Setting `append_to_context=False` keeps the filler phrase out of the conversation history, so it doesn't land between the tool call and its result. The filler only plays for claim lookups, since the voice tools answer instantly, and it's spoken in the current voice's language.

The `set_voice`, `list_voices`, and `reset_voice` functions let the caller change the agent's voice and language. They're explained in [Switching languages by voice](#switching-languages-by-voice).

Next, let's create the context and its aggregators. The `LLMContext` stores the user and bot turns, plus the tools the LLM can call. We don't need to give the user aggregator a VAD analyzer: Deepgram Flux sends the start-of-turn and end-of-turn signals, and the aggregator uses them automatically. For more on how this works, see Pipecat's documentation on [context management](https://docs.pipecat.ai/guides/learn/context-management).

```python
    context = LLMContext(
        messages=[
            {
                "role": "user",
                "content": (
                    "Start by saying exactly this: 'Thanks for calling Tri-County "
                    "Insurance auto claims. I can look up the status, repair "
                    "estimate, payments, or adjuster notes on an existing auto "
                    "claim. What's your claim number?'"
                ),
            },
        ],
        tools=tools,
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)
```

### Prompting for the ear

Your agent is heard, not read, and that changes how you write its prompts. LLMs default to writing for a screen. Leave that unchecked and every answer comes back in markdown, which Flux TTS faithfully pronounces: `**Status:**` comes out as "star star status star star." The `system_instruction` you added to `run_bot` follows the five rules for voice prompts from the [Deepgram Builder Essentials course](https://github.com/deepgram-devs/deepgram-essentials-course/tree/main/steps/10-final):

| Rule | Why it matters out loud |
|---|---|
| **No markup.** "Never use markdown, bullet points, numbered lists, headings, or emoji." | Otherwise the caller hears every asterisk. Telling the model it's being heard is the instruction that changes its output. "Be conversational" doesn't. |
| **Short turns.** One or two sentences, one question at a time. | A caller can't skim. Ask two questions in one breath and you get one answer, and you won't know which question it answers. |
| **Data for the ear.** Amounts in words, dates with their weekday, claim IDs digit by digit. | A misheard "claim fifty" could be claim 15 or claim 50. Reading the digits back, "five zero," gives the caller a chance to catch it, and a weekday does the same for a date. |
| **Confident phrasing.** Say what you know, and say plainly when you don't. | Hedging sounds evasive in speech. "Never guess" is the line that stops the agent inventing a claim status. |
| **Named escalation triggers.** Spell out the situations the agent hands off. | "Use your judgement" isn't a trigger. "If the caller wants to file a new claim" is. |

The prompt stays short because Pipecat re-sends it on every turn, and a long prompt slows the first reply. The hard constraints sit at the end, where they're least likely to fade after a few turns. The prompt also tells the model today's date, since the model has no calendar of its own.

The greeting follows the same thinking. It's the only thing the agent says before it knows anything about the caller, so it names what the agent can do and asks for the one piece of information it needs: the claim number.

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
    # Spoken while a claim lookup runs. Written in the language itself, since
    # the voice would otherwise read the English text with a foreign accent.
    filler: str


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
- `verify_policyholder` compares letters A to Z. A last name spelled out with accented letters won't match a record without them.
- A caller who interrupts during the moment Flux STT reconnects may not be heard.

#### Testing it

`tests/test_voices.py` checks the catalog: unique names, the `flux-<name>-<lang>` pattern, one featured voice per language, and that every voice's language can be heard. `scripts/probe_flux_languages.py` checks the live API: for each language it synthesises a sentence with Flux TTS and streams it back through `flux-general-multi`. `scripts/switch_test.py` drives the whole agent through a series of switches with synthesised speech and reports the voice and pitch of every reply.

```bash
.venv/bin/python -m unittest discover tests
.venv/bin/python scripts/probe_flux_languages.py
.venv/bin/python scripts/switch_test.py
```

With the main LLM speaking for the ear, the Strands agent that feeds it needs the same treatment.

### Configuring the Strands agent

We created an instance of a StrandsAgent in the `run_bot` function, but we haven't defined that class yet. Just above the `run_bot` function, create a `StrandsAgent` class:

```python
class StrandsAgent:
    def __init__(self):
        self.session = boto3.Session(
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )

        self.bedrock_model = BedrockModel(
            model_id="us.amazon.nova-2-lite-v1:0", boto_session=self.session
        )
        self.bedrock_client = BedrockKnowledgeBaseClient(KNOWLEDGE_BASE_ID)
        # The claim the caller was verified for; set per lookup by process_query
        self.claim_id: str | None = None

        self.agent = Agent(
            tools=[self.search_knowledge_base, self.general_query],
            model=self.bedrock_model,
            system_prompt=(
                "You look up auto insurance claims for a voice agent. Another "
                "assistant speaks your answer to the caller, so write plain "
                "sentences: no markdown, bullet points, headings, or emoji. "
                "Search for the exact claim ID you are given, such as "
                "'claim ID CLM-2026-847291', and never change a digit. "
                "Answer only what was asked, in one or two sentences; leave out "
                "the rest of the record. "
                "Report only what the search returns, and say plainly when it "
                "returns nothing. Never invent an amount, date, or status. "
                "Never give the policyholder's address, phone number, or email, "
                "or a full VIN or license plate; at most give the last four "
                "characters. You may give the other driver's name and insurer, "
                "never their policy number, VIN, or plate. Never give map "
                "coordinates or photo IDs; you may say how many photos are on file. "
                "Use general_query only for questions that are not about a specific claim."
            ),
        )

    @tool
    async def search_knowledge_base(self, query: str) -> str:
        """Look up an auto claim record by its exact claim ID, e.g. 'claim ID CLM-2026-847291'. Use for any question about a specific claim."""
        logger.info(f"Searching KnowledgeBase: {query}")
        return await self.bedrock_client.query_knowledge_base(
            query, claim_id=self.claim_id
        )

    @tool
    def general_query(self, question: str) -> str:
        """Use for general auto insurance questions that are not about a specific claim, such as how collision and comprehensive coverage differ."""
        logger.info(f"Answering general question: {question}")
        # No lookup is needed, so hand the question back to the agent's own model
        return (
            "This is a general question, not a claim lookup. "
            f"Answer it briefly, in plain sentences, from your own knowledge: {question}"
        )

    def process_query(self, user_input: str, claim_id: str | None = None) -> str:
        """Process user input through the Strands agent.

        Each lookup starts with an empty history, so the agent answers from a
        fresh search, never from records it read for an earlier request.
        """
        try:
            self.claim_id = claim_id
            self.agent.messages.clear()
            response = self.agent(user_input)
            return str(response)
        except Exception as e:
            logger.error(f"Error processing query with StrandsAgent: {e}")
            return "I'm sorry, I encountered an error processing your request."


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

tools = ToolsSchema(
    standard_tools=[
        search_function,
        set_voice_function,
        list_voices_function,
        reset_voice_function,
    ]
)

```

In the `search_knowledge_base` function in the main LLM, we called `strands_agent.process_query()` to give the user's request to the Strands agent. In the StrandsAgent class, the `process_query` function is passing that input to an instance of the Strands library's `Agent` class. We're also defining some different tools that the Strands agent can use with the `@tool` decorator on the `general_query` and `search_knowledge_base` functions.

The Strands agent never talks to the caller directly, but its answer becomes the tool result the main LLM reads aloud. Any markdown it writes ends up in the caller's ear, so its `system_prompt` asks for plain sentences too.

The tool descriptions are prompts as well. A description is the only thing an LLM reads when it decides whether to call a tool, so each one says *when* to use the tool, not only what it does. "Search the knowledge base" tells the model what `search_knowledge_base` is. The `search_function` description above tells the model when to reach for it. The `@tool` docstrings play the same role for the Strands agent.

Speaking of `search_knowledge_base`, we're using a `BedrockKnowledgeBaseClient` in that function. We should define that class right above the `StrandsAgent` class:

```python
def claim_id_pattern(claim_id: str) -> re.Pattern:
    """Match a claim record's "Claim ID" line for exactly this claim.

    The \b word boundary keeps "Claim ID CLM-2026-84729" from matching
    "Claim ID CLM-2026-847291".
    """
    return re.compile(rf"\bClaim ID {re.escape(claim_id)}\b", re.IGNORECASE)


def latin_letters(text: str) -> str:
    """Only the letters a to z, accents removed: "W-A-L-S-H" and "walsh" match.

    A name in another script, such as Cyrillic or Devanagari, comes back empty.
    """
    return re.sub(r"[^a-z]", "", voices.ascii_fold(text))


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

    def verify_policyholder(self, claim_id: str, last_name: str) -> bool:
        """Check the caller's last name against the policyholder on a claim.

        This runs in code, before any claim details reach the LLM, so no
        prompt can talk the agent out of it.
        """
        claim_line = claim_id_pattern(claim_id)
        policyholder = re.compile(r"Policyholder:\s*([^\n]+?)\s*(?:Policy number:|\n|$)")

        response = self._retrieve(f"Claim ID {claim_id} policyholder", "HYBRID", 10)
        for result in response.get("retrievalResults", []):
            text = result.get("content", {}).get("text", "")
            match = policyholder.search(text) if claim_line.search(text) else None
            if match:
                names = match.group(1).split()
                heard = latin_letters(last_name)
                # Accept the last word, or everything after the first name
                # for multi-word surnames like "De La Cruz"
                return bool(heard) and heard in {
                    latin_letters(names[-1]),
                    latin_letters("".join(names[1:])),
                }
        return False

    async def query_knowledge_base(
        self, query: str, max_results: int = 10, claim_id: str | None = None
    ) -> str:
        """Query the Bedrock Knowledge Base and return formatted response.

        With a claim_id, only passages from that claim's record are returned,
        so a lookup never hands the LLM another policyholder's data.
        """
        try:
            logger.info(f"Querying knowledge base with: {query}")

            # Enhanced query for better claim ID matching
            enhanced_query = query
            if any(
                keyword in query.lower()
                for keyword in ["claim", "id", "number", "reference", "ticket"]
            ):
                enhanced_query = f"claim ID {query}"

            # A claim record is split into several passages, and only this
            # claim's are kept below, so fetch enough to get all of them back
            if claim_id:
                max_results = max(max_results, 20)

            # HYBRID uses both semantic and keyword search
            response = self._retrieve(enhanced_query, "HYBRID", max_results)

            # Extract and format the results
            results = response.get("retrievalResults", [])

            if not results:
                # Try alternative query if no results found
                logger.info(f"No results found, trying alternative query: {query}")
                alt_response = self._retrieve(query, "SEMANTIC", max_results)
                results = alt_response.get("retrievalResults", [])

            if claim_id:
                # Search returns the closest matches, which include other
                # claims. Keep only the claim the caller was verified for.
                same_claim = claim_id_pattern(claim_id)
                results = [
                    r
                    for r in results
                    if same_claim.search(r.get("content", {}).get("text", ""))
                ]

            if not results:
                return f"I couldn't find any information about '{query}' in the knowledge base. Please check if the claim ID exists or try rephrasing your question."

            # Format the results for the ear: dates and amounts ready to speak,
            # and no scores or headers, because what the LLM never receives it can't say
            passages = []
            # Every passage of the verified claim, in full, so the agent can
            # answer from any section; general searches keep the top 5, short
            for result in results if claim_id else results[:5]:
                content = result.get("content", {}).get("text", "")

                if content:
                    content = await expand_currency(speak_dates(content), "*")
                    if not claim_id and len(content) > 200:
                        content = content[:200] + "..."
                    passages.append(content)

            if not passages:
                return f"I couldn't find any information about '{query}' in the knowledge base. Please check if the claim ID exists or try rephrasing your question."

            return "\n\n".join(passages)

        except ClientError as e:
            error_msg = f"Error querying knowledge base: {e}"
            logger.error(error_msg)
            return f"I encountered an error while searching for '{query}'. Please try again or contact support if the issue persists."
        except Exception as e:
            error_msg = f"Unexpected error: {e}"
            logger.error(error_msg)
            return "I'm sorry, something went wrong while processing your request."
```

The knowledge base stores dates as `2026-09-14` and amounts as `$4,850`. Instead of asking the LLM to reformat them, `query_knowledge_base` hands back text that's already shaped for speech. Pipecat's `expand_currency` transform turns `$4,850` into "four thousand, eight hundred and fifty dollars," and `speak_dates` turns `2026-09-14` into "Monday, September 14th." Pre-formatted values also keep the LLM's paraphrase close to the source. Add these helpers below `KNOWLEDGE_BASE_ID`, next to `strip_markup_symbols`:

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
```

The results also leave out the search relevance scores and result counts. Whatever the LLM never receives, it can't read aloud.

`verify_policyholder` retrieves the claim record and compares the caller's last name with the `Policyholder:` line. It only accepts a passage whose `Claim ID` matches exactly: the `\b` word boundary in `claim_id_pattern`, which you added above the `BedrockKnowledgeBaseClient` class, keeps a mistyped ID like CLM-2026-84729 from matching CLM-2026-847291.

The two helpers next to it handle callers who aren't speaking English. `latin_letters` compares names on the letters a to z only, with accents removed, so "Núñez" matches "Nunez." A name transcribed in another script, such as Cyrillic, has no Latin letters at all, so `search_knowledge_base` asks the caller to spell it instead of counting a failed attempt. `ascii_digits` turns digits from any script into 0 to 9, so a claim number transcribed in Devanagari still finds the record.

`normalize_claim_id` builds on `ascii_digits`. Callers say claim IDs in many ways: "C L M twenty twenty-six, eight four seven two nine one," just the digits, or a mix. Only the digits matter, so it keeps those and rebuilds the ID as `CLM-2026-847291`. Anything other than a four-digit year and a six-digit number comes back empty, and `search_knowledge_base` asks the caller for the full number instead of guessing the missing year.

Verification only helps if the lookup that follows stays on the verified claim. A knowledge base search returns the closest matches, and for "claim ID CLM-2026-527613" those include other claims' records. So when `query_knowledge_base` gets a `claim_id`, it uses the same pattern to drop every passage from another claim. The knowledge base splits each claim record into several passages, which is why every section header in the sample records repeats the claim ID, such as `Adjuster notes for Claim ID CLM-2026-527613:`. Without it, a passage cut from the middle of a record would be dropped. A verified lookup also asks for up to 20 results and passes every remaining passage to the agent in full, so it can answer from any part of the record. The `StrandsAgent` also clears its message history in `process_query` before each lookup, so it can't answer from a record it read earlier in the call. Comparing letters only, without case, spaces, or punctuation, means a name the caller spells out, which Flux transcribes as "W-A-L-S-H," still matches "Walsh." You can refer to the Amazon Knowledge Base documentation to learn more about this code.


### Finishing the Botfile

That takes care of everything except for the `transport` object in the pipeline. We'll come back to that later.

Next, we need to define a pipeline worker. This is what runs the pipeline. Do this right after you've defined your pipeline:

```python
    # pipeline = Pipeline(...)

    task = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )
```

The `PipelineParams` enable metrics reporting, so you can see latency and token usage in the logs.

Next, we need to add some event handlers so the pipeline knows how to handle the user connecting and disconnecting. First, when the user connects, we'll push a frame that tells the LLM to run. The LLM responds to the greeting instruction we put in the context.

```python
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")
        # Kick off the conversation.
        await task.queue_frames([LLMRunFrame()])
```

And when the user disconnects, we'll tell the bot to stop.

```python
    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected")
        await task.cancel()
```

Finally, we can create a `WorkerRunner`, add our pipeline worker to it, and actually run the pipeline.

```python
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(task)
    await runner.run()
```

That's all the code we need for the `run_bot` function. But in order to run that function, we need to define an entrypoint function called `bot` that configures the transport and calls `run_bot`. Add this function at the bottom of your botfile, making sure it's at the top level of indentation so it's not inside the `run_bot` function.

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

    await run_bot(transport, runner_args)
```

The `transport_params` object describes how we want to configure the various transports that this bot supports. In this case, we'll support the DailyTransport (`daily`) and the SmallWebRTCTransport (`webrtc`). The bot starter will request a transport type in the `runner_args`, and the `create_transport` function will create a transport object that gets passed to the `run_bot` function.

When you're developing locally, your 'bot runner' is built in to pipecat. We need to add one more thing to the bottom of our botfile for local development.

```python
if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
```

With this code at the bottom of the botfile, we can run `python agent.py` from the command line. The Pipecat built-in bot runner `main()` function will call the `bot()` function with some pre-configured arguments in `runner_args`, which will in turn call the `run_bot` function to actually run the bot.


## Deploying to Pipecat Cloud

You can deploy this bot to Pipecat Cloud and get production-ready infrastructure in about 5 minutes. Rename your file from `agent.py` to `bot.py`, then follow the instructions from [the Pipecat Cloud Quickstart](https://github.com/pipecat-ai/pipecat-quickstart?tab=readme-ov-file#step-2-deploy-to-production-5-min)!
