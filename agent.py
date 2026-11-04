import os
from datetime import datetime

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.aws.llm import AWSBedrockLLMService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.deepgram.tts import DeepgramTTSService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.workers.runner import WorkerRunner
from strands import Agent, tool
from strands.models import BedrockModel

# Load environment variables
load_dotenv(override=True)

# Bedrock Knowledge Base Configuration
KNOWLEDGE_BASE_ID = os.getenv("KB_ID")


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

            # Format the response with more detail
            formatted_response = f"Found {len(results)} result(s) for your query:\n\n"

            for i, result in enumerate(results[:5], 1):  # Show top 5 results
                content = result.get("content", {}).get("text", "")
                score = result.get("score", 0)
                source = (
                    result.get("location", {})
                    .get("s3Location", {})
                    .get("uri", "Unknown source")
                )

                if content:
                    # Show full content for claim-related queries to include all notes
                    content_length = (
                        1000
                        if any(keyword in query.lower() for keyword in ["claim", "id"])
                        else 200
                    )
                    truncated_content = content[:content_length]
                    if len(content) > content_length:
                        truncated_content += "..."

                    formatted_response += f"{i}. {truncated_content}\n"
                    formatted_response += f"   (Relevance: {score:.2f})\n\n"

            return formatted_response.strip()

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
            system_prompt="You are a claim assistant. Search for EXACT claim IDs only. When users say 'claim ID 1', search for 'claim ID 1' specifically, not '1234'. When they say 'claim ID 1234', search for 'claim ID 1234' specifically. Use general_query for non-claim questions.",
        )

    @tool
    async def search_knowledge_base(self, query: str) -> str:
        """Search for specific claim information in knowledge base"""
        logger.info(f"Searching KnowledgeBase: {query}")
        return await self.bedrock_client.query_knowledge_base(query)

    @tool
    async def general_query(self, question: str) -> str:
        """Answer general questions directly using the model"""
        logger.info(f"Answering general question: {question}")
        try:
            # Use the Bedrock model directly for general questions
            response = await self.bedrock_model.generate_async(
                messages=[{"role": "user", "content": question}], max_tokens=200
            )
            return response.content
        except Exception as e:
            logger.error(f"Error with general query: {e}")
            return "I can help answer general questions. What would you like to know?"

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
    description="Search the knowledge base",
    properties={"query": {"type": "string"}},
    required=["query"],
)

tools = ToolsSchema(standard_tools=[search_function])


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting Bedrock Knowledge Base Voice Agent with Strands")

    strands_agent = StrandsAgent()

    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        settings=DeepgramSTTService.Settings(
            model="nova-3-general", language=Language.EN, smart_format=True
        ),
    )

    tts = DeepgramTTSService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        sample_rate=24000,
        encoding="linear16",
        settings=DeepgramTTSService.Settings(voice="aura-2-arcas-en"),
    )

    # System instruction for knowledge base integration
    system_instruction = (
        "You are a helpful AI assistant that can help with claim lookups and general questions. "
        "For claim-related queries, use the search_knowledge_base function. "
        "When users mention numbers, treat them as claim IDs and search for them directly. "
        "Search for EXACT claim IDs only: "
        "- If they say 'claim ID 1', search for 'claim ID 1' specifically "
        "- If they say 'claim ID 1234', search for 'claim ID 1234' specifically "
        "For general questions not related to specific claims, you can answer directly without using the search function. "
        "For claim estimates, costs, amounts, or any other information, always search for that specific information. "
        "Keep your responses very brief. Don't add extra information the user didn't ask for."
    )

    llm = AWSBedrockLLMService(
        aws_region="us-east-1",
        settings=AWSBedrockLLMService.Settings(
            model="us.anthropic.claude-haiku-5-5",
            system_instruction=system_instruction,
        ),
    )

    async def search_knowledge_base(params: FunctionCallParams):
        query = params.arguments.get("query", "")

        if not query:
            await params.result_callback(
                {
                    "error": "No query provided",
                    "response": "Please provide a question or claim ID to search the knowledge base.",
                }
            )
            return

        logger.info(f"Using Strands agent for: {query}")

        try:
            response_text = strands_agent.process_query(query)

            await params.result_callback(
                {
                    "query": query,
                    "response": response_text,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "knowledge_base_id": KNOWLEDGE_BASE_ID,
                }
            )

        except Exception as e:
            logger.error(f"Error with Strands agent for {query}: {e}")
            await params.result_callback(
                {
                    "query": query,
                    "response": f"I encountered an error while searching for '{query}'. Please try again.",
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "knowledge_base_id": KNOWLEDGE_BASE_ID,
                }
            )

    llm.register_function("search_knowledge_base", search_knowledge_base)

    context = LLMContext(
        messages=[
            {
                "role": "user",
                "content": "Start by saying exactly this: 'Thanks for contacting tri-county insurance. How can I help you?'",
            },
        ],
        tools=tools,
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
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