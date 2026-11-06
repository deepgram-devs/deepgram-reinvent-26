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

# Load environment variables
load_dotenv(override=True)

# Bedrock Knowledge Base Configuration
KNOWLEDGE_BASE_ID = os.getenv("KB_ID")

_MARKUP_SYMBOLS = re.compile(r"[*#`]")


async def strip_markup_symbols(text: str, text_type: str) -> str:
    """Drop markdown symbols before speech synthesis.

    Flux TTS receives the LLM's output token by token, so this has to work on a
    lone "**" as well as on whole sentences.
    """
    return _MARKUP_SYMBOLS.sub("", text)


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


def claim_id_pattern(claim_id: str) -> re.Pattern:
    """Match a claim record's "Claim ID" line for exactly this claim.

    The \b word boundary keeps "Claim ID 1" from matching "Claim ID 1234".
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
            # Managed knowledge bases reject vectorSearchConfiguration,
            # so retry with the knowledge base's default search settings.
            if "vectorSearchConfiguration is not supported" not in str(e):
                raise
            return self.bedrock_agent_runtime.retrieve(
                knowledgeBaseId=self.knowledge_base_id,
                retrievalQuery={"text": text},
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
            for result in results[:5]:  # Use the top 5 results
                content = result.get("content", {}).get("text", "")

                if content:
                    content = await expand_currency(speak_dates(content), "*")

                    # Show full content for claim-related queries to include all notes
                    content_length = (
                        1000
                        if any(keyword in query.lower() for keyword in ["claim", "id"])
                        else 200
                    )
                    truncated_content = content[:content_length]
                    if len(content) > content_length:
                        truncated_content += "..."

                    passages.append(truncated_content)

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
                "You look up insurance claims for a voice agent. Another assistant "
                "speaks your answer to the caller, so write plain sentences: no "
                "markdown, bullet points, headings, or emoji. "
                "Search for the exact claim ID you are given: 'claim ID 1' means "
                "claim 1, not 1234. "
                "Answer only what was asked, in one or two sentences; leave out "
                "the rest of the record. "
                "Report only what the search returns, and say plainly when it "
                "returns nothing. Never invent an amount, date, or status. "
                "Use general_query only for questions that are not about a specific claim."
            ),
        )

    @tool
    async def search_knowledge_base(self, query: str) -> str:
        """Look up a claim record by its exact claim ID, e.g. 'claim ID 1'. Use for any question about a specific claim."""
        logger.info(f"Searching KnowledgeBase: {query}")
        return await self.bedrock_client.query_knowledge_base(
            query, claim_id=self.claim_id
        )

    @tool
    def general_query(self, question: str) -> str:
        """Use for general insurance questions that are not about a specific claim, such as what a deductible is."""
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
        "Look up an existing Tri-County Insurance claim by its claim ID. Use this "
        "whenever the caller asks about a specific claim: its status, estimated or "
        "approved amount, deductible, date of loss, adjuster, or adjuster notes. "
        "Call it only once the caller has given both the claim ID and the "
        "policyholder's last name; the lookup verifies the name before it "
        "returns any details."
    ),
    properties={
        "claim_id": {
            "type": "string",
            "description": "The claim ID as digits, e.g. '1234'.",
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
            "description": "The claim ID and what the caller wants to know, e.g. 'claim ID 1 approved amount'.",
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



async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting Bedrock Knowledge Base Voice Agent with Strands")

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
            "You are the claims line voice agent for Tri-County Insurance. You help "
            "callers look up existing claims: status, amounts, dates, and adjuster notes.\n"
            f"{voices.voice_intro(voice)}\n"
            f"Today is {today}.\n"
            "\n"
            "HOW TO SPEAK:\n"
            "- You are being heard, not read. Never use markdown, bullet points, "
            "numbered lists, headings, or emoji.\n"
            "- Keep replies to one or two sentences, and ask one question at a time.\n"
            "- Say dollar amounts in words and dates with their weekday, e.g. "
            "'Monday, September 14th'.\n"
            "- When you repeat a claim ID back, say the digits one at a time, e.g. "
            "'one two three four'.\n"
            "- If you do not know something, say so plainly. Never guess.\n"
            "\n"
            "CLAIM LOOKUPS:\n"
            "- For any question about a specific claim, call search_knowledge_base. "
            "Never answer claim details from memory.\n"
            "- Treat a number the caller gives as a claim ID and search for that exact "
            "ID: 'claim 1' is claim ID 1, not 1234.\n"
            "- If you did not catch the number, ask for it again.\n"
            "- You may answer general insurance questions, like what a deductible is, "
            "briefly and in general terms.\n"
            "- Never invent a claim, amount, date, or status.\n"
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

    # Failed verifications per claim ID, so a caller can't keep guessing names
    max_verification_attempts = 3
    failed_verifications: dict[str, int] = {}

    async def search_knowledge_base(params: FunctionCallParams):
        query = params.arguments.get("query", "")
        claim_id = ascii_digits(str(params.arguments.get("claim_id", "")))
        last_name = params.arguments.get("last_name", "")

        if not (query and claim_id and last_name):
            await params.result_callback(
                {
                    "error": "Missing claim ID or last name",
                    "response": "Ask the caller for their claim number and the policyholder's last name before looking up a claim.",
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

    context = LLMContext(
        messages=[
            {
                "role": "user",
                "content": (
                    "Start by saying exactly this: 'Thanks for calling Tri-County "
                    "Insurance. I can look up the status, amounts, or adjuster notes "
                    "on an existing claim. What's your claim number?'"
                ),
            },
        ],
        tools=tools,
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

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

    # Configure the pipeline worker
    task = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    # Handle client connection event
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected to Bedrock Knowledge Base Voice Agent")
        # Kick off the conversation
        await task.queue_frames([LLMRunFrame()])

    # Handle client disconnection event
    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected from Bedrock Knowledge Base Voice Agent")
        await task.cancel()

    # Run the pipeline
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(task)
    await runner.run()


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


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()