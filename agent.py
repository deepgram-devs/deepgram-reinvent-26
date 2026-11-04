import os
import re
from datetime import date, datetime

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import LLMRunFrame, TTSSpeakFrame
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
        # \b keeps "Claim ID 1" from matching "Claim ID 1234"
        claim_line = re.compile(rf"\bClaim ID {re.escape(claim_id)}\b", re.IGNORECASE)
        policyholder = re.compile(r"Policyholder:\s*([^\n]+?)\s*(?:Policy number:|\n|$)")

        def letters(text: str) -> str:
            # Ignore case, spaces, and punctuation, so a spelled-out
            # "W-A-L-S-H" matches "Walsh"
            return re.sub(r"[^a-z]", "", text.lower())

        response = self._retrieve(f"Claim ID {claim_id} policyholder", "HYBRID", 10)
        for result in response.get("retrievalResults", []):
            text = result.get("content", {}).get("text", "")
            match = policyholder.search(text) if claim_line.search(text) else None
            if match:
                names = match.group(1).split()
                heard = letters(last_name)
                # Accept the last word, or everything after the first name
                # for multi-word surnames like "De La Cruz"
                return bool(heard) and heard in {
                    letters(names[-1]),
                    letters("".join(names[1:])),
                }
        return False

    async def query_knowledge_base(self, query: str, max_results: int = 10) -> str:
        """Query the Bedrock Knowledge Base and return formatted response"""
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
            model_id="amazon.nova-lite-v1:0", boto_session=self.session
        )
        self.bedrock_client = BedrockKnowledgeBaseClient(KNOWLEDGE_BASE_ID)

        self.agent = Agent(
            tools=[self.search_knowledge_base, self.general_query],
            model=self.bedrock_model,
            system_prompt=(
                "You look up insurance claims for a voice agent. Another assistant "
                "speaks your answer to the caller, so write plain sentences: no "
                "markdown, bullet points, headings, or emoji. "
                "Search for the exact claim ID you are given: 'claim ID 1' means "
                "claim 1, not 1234. "
                "Report only what the search returns, and say plainly when it "
                "returns nothing. Never invent an amount, date, or status. "
                "Use general_query only for questions that are not about a specific claim."
            ),
        )

    @tool
    async def search_knowledge_base(self, query: str) -> str:
        """Look up a claim record by its exact claim ID, e.g. 'claim ID 1'. Use for any question about a specific claim."""
        logger.info(f"Searching KnowledgeBase: {query}")
        return await self.bedrock_client.query_knowledge_base(query)

    @tool
    def general_query(self, question: str) -> str:
        """Use for general insurance questions that are not about a specific claim, such as what a deductible is."""
        logger.info(f"Answering general question: {question}")
        # No lookup is needed, so hand the question back to the agent's own model
        return (
            "This is a general question, not a claim lookup. "
            f"Answer it briefly, in plain sentences, from your own knowledge: {question}"
        )

    def process_query(self, user_input: str) -> str:
        """Process user input through the Strands agent"""
        try:
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
            "description": "The policyholder's last name exactly as the caller said or spelled it.",
        },
        "query": {
            "type": "string",
            "description": "The claim ID and what the caller wants to know, e.g. 'claim ID 1 approved amount'.",
        },
    },
    required=["claim_id", "last_name", "query"],
)

tools = ToolsSchema(standard_tools=[search_function])


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting Bedrock Knowledge Base Voice Agent with Strands")

    strands_agent = StrandsAgent()

    stt = DeepgramFluxSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        settings=DeepgramFluxSTTService.Settings(model="flux-general-en"),
    )

    tts = DeepgramFluxTTSService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        sample_rate=24000,
        settings=DeepgramFluxTTSService.Settings(voice="flux-heather-en"),
        # The prompt asks for no markdown; this guarantees it is never spoken
        text_transforms=[("*", strip_markup_symbols)],
    )

    # The model has no calendar, so tell it what day it is
    now = datetime.now()
    today = f"{now:%A, %B} {now.day}, {now.year}"

    # System instruction, written for the ear: the agent is heard, not read
    system_instruction = (
        "You are the claims line voice agent for Tri-County Insurance. You help "
        "callers look up existing claims: status, amounts, dates, and adjuster notes.\n"
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
        "to hang up and call 911."
    )

    llm = AWSBedrockLLMService(
        aws_region="us-east-1",
        settings=AWSBedrockLLMService.Settings(
            model="us.anthropic.claude-haiku-5-5",
            system_instruction=system_instruction,
        ),
    )

    # Failed verifications per claim ID, so a caller can't keep guessing names
    max_verification_attempts = 3
    failed_verifications: dict[str, int] = {}

    async def search_knowledge_base(params: FunctionCallParams):
        query = params.arguments.get("query", "")
        claim_id = re.sub(r"\D", "", str(params.arguments.get("claim_id", "")))
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
            response_text = strands_agent.process_query(f"claim ID {claim_id}: {query}")

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

    # Speak a filler phrase while the knowledge base lookup runs, so the
    # caller isn't left in silence. It isn't added to the LLM context.
    @llm.event_handler("on_function_calls_started")
    async def on_function_calls_started(service, function_calls):
        await tts.queue_frame(
            TTSSpeakFrame(
                "Let me look that up for you, one second please.",
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