import asyncio
import dataclasses
import os
import re
import threading
import time
import unicodedata
from collections.abc import Awaitable, Callable
from datetime import datetime
from urllib.parse import unquote, urlparse

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import (
    LLMMessagesAppendFrame,
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

# Load environment variables
load_dotenv(override=True)

# Bedrock Knowledge Base Configuration
KNOWLEDGE_BASE_ID = os.getenv("KB_ID")

# How long a claim lookup runs before the agent says a hold line. A lookup
# that answers sooner goes straight to the answer: a hold line before an
# instant answer is a delay, not a courtesy.
HOLD_LINE_DELAY_SECS = 1.0

_MARKUP_SYMBOLS = re.compile(r"[*#`]")


async def strip_markup_symbols(text: str, text_type: str) -> str:
    """Drop markdown symbols before speech synthesis.

    Flux TTS receives the LLM's output token by token, so this has to work on a
    lone "**" as well as on whole sentences.
    """
    return _MARKUP_SYMBOLS.sub("", text)


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


def voice_from_body(body) -> Voice:
    """The voice the call starts in: the one picked in Settings, if it's one we have.

    The browser remembers the pick, so a stale or hand-edited name can arrive
    here. Anything that isn't in the catalog starts the call in the default.
    """
    if isinstance(body, dict) and isinstance(body.get("voice"), str):
        return voices.find_voice(body["voice"]) or voices.DEFAULT_VOICE
    return voices.DEFAULT_VOICE


GREETINGS = {
    POLICYHOLDER: (
        "Thanks for calling Tri-County Insurance auto claims. I can look up the "
        "status, repair estimate, payments, or adjuster notes on an existing auto "
        "claim. What's your claim number?"
    ),
    EMPLOYEE: "Tri-County claims desk. What would you like to look up?",
}


def greeting_instruction(persona: str, voice: Voice) -> str:
    """The first turn's instruction: the persona's greeting, in the voice's language.

    The greeting is written in English. In English it's said word for word;
    in any other language the model translates it, since a Spanish voice
    reading English text sounds like an accent, not a greeting.
    """
    greeting = GREETINGS[persona]
    if voice.lang == "en":
        return f"Start by saying exactly this: '{greeting}'"
    return f"Start by saying this, in {voices.language_of(voice).name}: '{greeting}'"


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


async def run_bot(
    transport: BaseTransport,
    runner_args: RunnerArguments,
    persona: str = POLICYHOLDER,
    voice: Voice = voices.DEFAULT_VOICE,
):
    logger.info(f"Starting Tri-County claims voice agent ({persona})")

    kb = BedrockKnowledgeBaseClient(KNOWLEDGE_BASE_ID)
    # Claim records read on this call, by claim ID, so each is read once
    records: dict[str, dict] = {}
    # Employees research across claims with a Strands agent; policyholders
    # look up one record and don't need one
    research_agent = ClaimsResearchAgent(kb, records) if persona == EMPLOYEE else None

    # The voice is the caller's only language setting: it picks the listen
    # model and the reply language too. The call starts in the voice picked
    # in Settings, English by default.
    current_voice = voice

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

    async def switch_voice(voice: Voice) -> bool:
        """Switch voice, and with it the language, in place. True if the language changed.

        Both the set_voice tool and the Settings panel switch through here,
        so the prompt, the voice, the listen settings, and the UI stay in step.
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
        return language_changed

    async def apply_voice(voice: Voice, params: FunctionCallParams):
        """Switch voice for the set_voice and reset_voice tools.

        The prompt, voice, and listen updates are queued before the function
        result, so the confirmation is the first turn in the new voice.
        """
        language_changed = await switch_voice(voice)
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

    context = LLMContext(
        messages=[
            {"role": "user", "content": greeting_instruction(persona, current_voice)},
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

    # Messages the claims UI sends during a call, by type
    client_handlers: dict[str, Callable[[dict], Awaitable[None]]] = {}

    @task.rtvi.event_handler("on_client_message")
    async def on_client_message(rtvi, msg):
        handler = client_handlers.get(msg.type)
        if handler is None:
            logger.warning(f"Ignoring unknown client message: {msg.type}")
            return
        await handler(msg.data or {})

    async def on_set_voice(data: dict):
        """A voice picked in the Settings panel during the call.

        It switches like set_voice, but nothing is said: the microphone is off
        while Settings is open. A note in the context tells the model the
        change was the caller's, so its next reply is in the new language.
        """
        name = data.get("voice") if isinstance(data, dict) else None
        voice = voices.find_voice(name) if isinstance(name, str) else None
        if voice is None:
            logger.warning(f"Ignoring set-voice for unknown voice: {name!r}")
            await send_voice()  # puts the picker back on the voice in use
            return
        if voice == current_voice:
            return
        await switch_voice(voice)
        await task.queue_frame(
            LLMMessagesAppendFrame(
                messages=[{"role": "user", "content": voices.settings_switch_note(voice)}],
                run_llm=False,
            )
        )

    client_handlers["set-voice"] = on_set_voice

    # Handle client connection event
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected to the Tri-County claims voice agent ({persona})")
        await send_voice()
        # Kick off the conversation
        await task.queue_frames([LLMRunFrame()])

    # Handle client disconnection event
    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected from the Tri-County claims voice agent")
        cancel_hold_line()
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

    # The claims UI sends the persona and the starting voice with its WebRTC
    # offer, as request_data
    body = getattr(runner_args, "body", None)
    await run_bot(transport, runner_args, persona_from_body(body), voice_from_body(body))


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()