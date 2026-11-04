# Pipecat voice agent with Deepgram, AWS Bedrock, AWS Strands, and pg_vector

This is the agent code used in the AWS Workshop [Building intelligent voice AI agents with Amazon Nova Sonic, Amazon Bedrock and Pipecat](https://catalog.workshops.aws/voice-ai-agents/en-US). Follow the instructions in that workshop to configure an AWS environment to use with this code.

## Understanding the Botfile

To learn more about the architecture of a Pipecat botfile, you can read through the [Pipecat Overview](https://docs.pipecat.ai/guides/learn/overview). The rest of this guide will use some basic Pipecat terminology that's explained in those docs.

Let's build the `agent.py` file that contains your agent.

### Starting the botfile

You'll need these imports at the top of `agent.py`. You can add them now, or refer back to this list as you add other code to the file.

```python
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
```

Your bot uses a few different third-party services. The standard security practice is to make the API keys for those services available as environment variables. Here, we'll use a Python library to load a `.env` file with our keys:

```python

load_dotenv(override=True)

# Bedrock Knowledge Base Configuration
KNOWLEDGE_BASE_ID = os.getenv("KB_ID")
```

Rename `example.env` to `.env` and add your keys, as well as your KB_ID.

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
```

Each service takes its configuration through a `Settings` object. The LLM's `system_instruction` is the system prompt that tells the bot how to behave. It's written for a caller who hears every word, and the [Prompting for the ear](#prompting-for-the-ear) section below explains each rule in it.

Our main LLM, the one in the pipeline, is the one that interacts with the user. We need to give it a way to pass queries to the Strands agent. We'll do that with a tool call. Claim records are personal, so the function verifies the caller before anything is looked up: the LLM must pass the policyholder's last name with the claim ID. Define a `search_knowledge_base` function, and register it with the LLM:

```python
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
```

The verification lives in code, not just in the prompt. A prompt is a request: a determined caller can talk an LLM into skipping a step. Here, `verify_policyholder` checks the last name against the claim record, which we'll add to the `BedrockKnowledgeBaseClient` later, before the Strands agent sees the request. If the check fails, no claim details are retrieved, so there's nothing for the LLM to leak. The failure response is identical whether the claim doesn't exist or the name is wrong, so a caller can't use the agent to discover valid claim numbers or the names on them. After three failed attempts on a claim, the agent stops checking it for the rest of the call. The `VERIFICATION` section of the system prompt tells the LLM to ask for the last name and how to respond to a mismatch.

A knowledge base lookup takes a moment, and dead air on a phone call feels broken. The `on_function_calls_started` event fires as soon as the LLM decides to call a tool, so we use it to queue a `TTSSpeakFrame` straight to the TTS service. The caller hears "Let me look that up for you" while the Strands agent does its work. Setting `append_to_context=False` keeps the filler phrase out of the conversation history, so it doesn't land between the tool call and its result.

Next, let's create the context and its aggregators. The `LLMContext` stores the user and bot turns, plus the tools the LLM can call. We don't need to give the user aggregator a VAD analyzer: Deepgram Flux sends the start-of-turn and end-of-turn signals, and the aggregator uses them automatically. For more on how this works, see Pipecat's documentation on [context management](https://docs.pipecat.ai/guides/learn/context-management).

```python
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

Flux TTS streams the LLM's output to Deepgram token by token, so a `**` often arrives on its own. Pipecat's built-in `strip_markdown` transform only removes paired markers like `**bold**`, which is why this transform drops the symbols one character at a time instead. Text transforms change only what's sent to TTS; the conversation context keeps the LLM's original text. Hyphens stay, because the claim data uses them in values like `TCI-AUTO-48213`.

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
```

In the `search_knowledge_base` function in the main LLM, we called `strands_agent.process_query()` to give the user's request to the Strands agent. In the StrandsAgent class, the `process_query` function is passing that input to an instance of the Strands library's `Agent` class. We're also defining some different tools that the Strands agent can use with the `@tool` decorator on the `general_query` and `search_knowledge_base` functions.

The Strands agent never talks to the caller directly, but its answer becomes the tool result the main LLM reads aloud. Any markdown it writes ends up in the caller's ear, so its `system_prompt` asks for plain sentences too.

The tool descriptions are prompts as well. A description is the only thing an LLM reads when it decides whether to call a tool, so each one says *when* to use the tool, not only what it does. "Search the knowledge base" tells the model what `search_knowledge_base` is. The `search_function` description above tells the model when to reach for it. The `@tool` docstrings play the same role for the Strands agent.

Speaking of `search_knowledge_base`, we're using a `BedrockKnowledgeBaseClient` in that function. We should define that class right above the `StrandsAgent` class:

```python
def claim_id_pattern(claim_id: str) -> re.Pattern:
    """Match a claim record's "Claim ID" line for exactly this claim.

    The \b word boundary keeps "Claim ID 1" from matching "Claim ID 1234".
    """
    return re.compile(rf"\bClaim ID {re.escape(claim_id)}\b", re.IGNORECASE)


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

`verify_policyholder` retrieves the claim record and compares the caller's last name with the `Policyholder:` line. It only accepts a passage whose `Claim ID` matches exactly: the `\b` word boundary in `claim_id_pattern` keeps claim 1 from matching claim 1234. Add `claim_id_pattern` just above the `BedrockKnowledgeBaseClient` class:

```python
def claim_id_pattern(claim_id: str) -> re.Pattern:
    """Match a claim record's "Claim ID" line for exactly this claim.

    The \b word boundary keeps "Claim ID 1" from matching "Claim ID 1234".
    """
    return re.compile(rf"\bClaim ID {re.escape(claim_id)}\b", re.IGNORECASE)
```

Verification only helps if the lookup that follows stays on the verified claim. A knowledge base search returns the closest matches, and for "claim ID 1234" those include other claims' records. So when `query_knowledge_base` gets a `claim_id`, it uses the same pattern to drop every passage from another claim. The `StrandsAgent` also clears its message history in `process_query` before each lookup, so it can't answer from a record it read earlier in the call. Comparing letters only, without case, spaces, or punctuation, means a name the caller spells out, which Flux transcribes as "W-A-L-S-H," still matches "Walsh." You can refer to the Amazon Knowledge Base documentation to learn more about this code.


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
