"""
Signal accuracy test for the categorizer node.

Validates that the noise filter achieves ≥ 95% accuracy on 20 fixture articles.
Run with: pytest worker/tests/pipeline/test_categorizer.py -v

Requires OPENROUTER_API_KEY in the environment.
"""
from __future__ import annotations

import os
import pytest

from worker.pipeline.graph import categorizer_node, PipelineState

# ---------------------------------------------------------------------------
# Fixtures: 10 technical + 10 non-technical
# ---------------------------------------------------------------------------

TECHNICAL_ARTICLES = [
    {
        "title": "LangGraph 0.3 introduces persistent checkpointing for long-running agents",
        "raw_content": (
            "LangGraph 0.3.0 ships MemorySaver and SqliteSaver checkpointers that serialize "
            "the full graph state to disk after every node execution. Developers can resume "
            "interrupted pipelines by passing a thread_id to graph.invoke(). The new "
            "interrupt_before kwarg lets you pause at any node boundary for human-in-the-loop "
            "review before proceeding. Breaking change: CompiledGraph.stream() now yields "
            "StreamEvents instead of raw node output dicts."
        ),
        "source_url": "https://blog.langchain.dev/langgraph-0-3",
        "source_name": "langchain",
    },
    {
        "title": "Anthropic releases Claude claude-haiku-4-5 with 200K context and vision support",
        "raw_content": (
            "claude-haiku-4-5 extends the claude-opus-4-5 family with 200,000-token context windows and "
            "native image understanding. The model accepts base64-encoded images via the "
            "messages.create() API under a new image content block type. Throughput benchmarks "
            "show 82 tokens/s on standard tiers. Pricing: $3/MTok input, $15/MTok output. "
            "claude-haiku-4-5 outperforms GPT-4o on MMMU and HumanEval-V by 4.2 pts."
        ),
        "source_url": "https://anthropic.com/news/claude-haiku-4-5",
        "source_name": "anthropic",
    },
    {
        "title": "pgvector 0.8 adds HNSW indexing and parallel index builds",
        "raw_content": (
            "pgvector 0.8 introduces HNSW (Hierarchical Navigable Small World) indexes alongside "
            "the existing IVFFlat implementation. HNSW provides O(log n) query complexity and "
            "eliminates the need to pre-specify the number of lists. Build a HNSW index with: "
            "CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64). Parallel index builds via max_parallel_maintenance_workers "
            "reduce build time by 3× on 16-core instances."
        ),
        "source_url": "https://github.com/pgvector/pgvector/releases/0.8.0",
        "source_name": "github",
    },
    {
        "title": "OpenAI releases text-embedding-3-large v2 with 3072 dimensions",
        "raw_content": (
            "text-embedding-3-large v2 doubles the output dimension to 3072 and improves MTEB "
            "score from 64.6 to 68.1. The API call is unchanged; pass dimensions=3072 to truncate "
            "to a lower-dimensional space for storage savings. The Matryoshka Representation Learning "
            "technique allows meaningful sub-vectors at 256, 512, 1024, 1536, and 3072 dims. "
            "Pricing unchanged at $0.13/MTok."
        ),
        "source_url": "https://openai.com/blog/embedding-v2",
        "source_name": "openai",
    },
    {
        "title": "GraphRAG v2: Microsoft open-sources community-aware retrieval augmented generation",
        "raw_content": (
            "GraphRAG v2 ships as a pip-installable package. It builds a knowledge graph from "
            "the corpus via LLM-extracted entities and relations, then uses Leiden community "
            "detection to partition the graph into summarizable clusters. At query time, a "
            "map-reduce step generates summaries per community and a reduce step synthesizes "
            "the final answer. Indexing a 10M token corpus costs ~$30 on GPT-4o-mini. "
            "The CLI: graphrag index --root ./my-corpus && graphrag query --root ./my-corpus "
            "--method global 'What are the main themes?'"
        ),
        "source_url": "https://github.com/microsoft/graphrag/releases/v2",
        "source_name": "github",
    },
    {
        "title": "Mixture-of-Agents: routing requests across specialized LLMs improves quality 12%",
        "raw_content": (
            "The MoA architecture maintains a router model that scores each incoming request "
            "across capability dimensions (code, reasoning, creative writing) and dispatches to "
            "the highest-scoring specialized model. An aggregator model merges the n top "
            "responses into a single coherent output. On MMLU, MoA achieves 89.1 vs 87.3 for "
            "the best single model. The router adds 50ms latency. Implementation uses a "
            "weighted ensemble of logit scores from the router's classify() endpoint."
        ),
        "source_url": "https://arxiv.org/abs/2406.04692",
        "source_name": "arxiv",
    },
    {
        "title": "FastAPI 0.112 adds native async context managers for dependency injection",
        "raw_content": (
            "FastAPI 0.112 introduces async generator dependencies. You can now yield from an "
            "async def function and the framework handles setup/teardown across the request "
            "lifecycle. Example: async def get_db(): async with AsyncSession() as session: "
            "yield session. The change eliminates the need for contextlib.asynccontextmanager "
            "wrappers and is fully compatible with pytest-anyio for testing async dependencies."
        ),
        "source_url": "https://fastapi.tiangolo.com/release/0-112",
        "source_name": "fastapi",
    },
    {
        "title": "Structured outputs in GPT-4o guarantee JSON schema adherence every call",
        "raw_content": (
            "OpenAI's structured outputs feature uses constrained decoding at the token level "
            "to guarantee that model responses conform to a provided JSON schema. Unlike function "
            "calling, the model cannot deviate from the schema even under adversarial prompts. "
            "Enable it by passing response_format={'type': 'json_schema', 'json_schema': {...}} "
            "to chat.completions.create(). Latency overhead is 10-15ms on average. Supported "
            "JSON Schema keywords: object, array, string, number, boolean, enum, required."
        ),
        "source_url": "https://openai.com/blog/structured-outputs",
        "source_name": "openai",
    },
    {
        "title": "Model Context Protocol 1.0: standardizing tool/resource discovery for LLM agents",
        "raw_content": (
            "MCP 1.0 defines a JSON-RPC 2.0 protocol for exposing Tools, Resources (files, DB "
            "queries), and Prompts to any LLM runtime. An MCP server declares its capabilities "
            "in a capabilities manifest. The client calls tools/list to discover available tools "
            "and tools/call to invoke them. The spec ships reference SDKs for Python and "
            "TypeScript. Claude Desktop and Cursor IDE both ship MCP client implementations. "
            "Security model: servers declare required OAuth2 scopes per tool."
        ),
        "source_url": "https://modelcontextprotocol.io/spec/1.0",
        "source_name": "mcp",
    },
    {
        "title": "ReAct+ combines chain-of-thought with tool verification for fewer hallucinations",
        "raw_content": (
            "ReAct+ extends the original Reason+Act loop by adding a Verify step after each "
            "tool call. The agent checks whether the tool output is consistent with its prior "
            "reasoning trace and can issue a Retry action if the result is unexpected. On "
            "HotpotQA, ReAct+ reduces hallucination rate from 18% to 7% vs vanilla ReAct. "
            "Implementation: add a verify_node after every tool_node in your LangGraph graph "
            "and wire a conditional edge back to the planner_node if the verification fails."
        ),
        "source_url": "https://arxiv.org/abs/2405.99123",
        "source_name": "arxiv",
    },
]

NON_TECHNICAL_ARTICLES = [
    {
        "title": "Anthropic raises $4 billion Series D at $18 billion valuation",
        "raw_content": (
            "Anthropic has closed a $4 billion funding round led by Google, with participation "
            "from Spark Capital and other institutional investors. The raise values the company "
            "at $18 billion post-money. The funds will be used to expand compute capacity and "
            "hire safety researchers. CEO Dario Amodei said the company expects to reach "
            "revenue of $1 billion ARR by end of fiscal year."
        ),
        "source_url": "https://techcrunch.com/anthropic-series-d",
        "source_name": "techcrunch",
    },
    {
        "title": "EU AI Act mandates transparency reports for general-purpose AI models",
        "raw_content": (
            "The European Union's AI Act came into force today, requiring developers of "
            "general-purpose AI models with more than 10^25 FLOPs of training compute to file "
            "annual transparency reports with the AI Office. The Act also establishes a "
            "two-tier risk framework: high-risk AI systems require third-party audits; prohibited "
            "AI systems include social scoring by governments. Non-compliance fines reach 3% of "
            "global annual turnover."
        ),
        "source_url": "https://artificialintelligenceact.eu/news",
        "source_name": "eu-ai-act",
    },
    {
        "title": "OpenAI appoints new Chief Operating Officer as Sam Altman focuses on AGI roadmap",
        "raw_content": (
            "OpenAI has promoted Sarah Friar to Chief Operating Officer, effective immediately. "
            "Friar joins from Nextdoor, where she served as CEO for five years. The move allows "
            "Sam Altman to concentrate on long-term product strategy and OpenAI's path toward "
            "artificial general intelligence. The board also announced three new independent "
            "directors with backgrounds in enterprise software and public company governance."
        ),
        "source_url": "https://openai.com/blog/new-coo",
        "source_name": "openai",
    },
    {
        "title": "AI hype cycle reaches peak: survey shows 80% of enterprises plan AI deployments",
        "raw_content": (
            "A Gartner survey of 1,400 enterprise CIOs found that 80% plan to deploy AI "
            "solutions in the next 18 months, up from 55% a year ago. However, only 15% "
            "report measurable ROI from current deployments. Analysts warn of an impending "
            "'trough of disillusionment' as inflated expectations collide with implementation "
            "complexity. The survey was conducted in Q3 across North America and EMEA."
        ),
        "source_url": "https://gartner.com/survey/ai-enterprise-2024",
        "source_name": "gartner",
    },
    {
        "title": "Google DeepMind wins Turing Award for breakthrough in protein structure prediction",
        "raw_content": (
            "The Association for Computing Machinery announced that the AlphaFold team at "
            "Google DeepMind will receive the 2024 Turing Award. The award recognizes the "
            "team's work on AlphaFold2, which solved the 50-year-old protein folding problem. "
            "The $1 million prize will be shared among the four principal researchers. "
            "The ceremony will be held at the ACM Awards Banquet in San Francisco."
        ),
        "source_url": "https://acm.org/turing-award-2024",
        "source_name": "acm",
    },
    {
        "title": "AI startup Cohere merges with inference provider Baseten in $2.1B deal",
        "raw_content": (
            "Enterprise AI company Cohere has announced a definitive merger agreement with "
            "inference infrastructure startup Baseten in an all-stock transaction valued at "
            "$2.1 billion. The combined company will offer full-stack enterprise AI from model "
            "training through production deployment. The deal is expected to close in Q1 "
            "pending regulatory approval. Cohere CEO Aidan Gomez will lead the combined entity."
        ),
        "source_url": "https://cohere.com/blog/merger-baseten",
        "source_name": "cohere",
    },
    {
        "title": "Senate subcommittee holds hearing on AI safety and national security risks",
        "raw_content": (
            "The Senate Judiciary Committee's Subcommittee on Privacy, Technology, and the "
            "Law held a five-hour hearing on AI safety featuring testimony from executives at "
            "Anthropic, OpenAI, and Meta AI. Senators focused on biosecurity risks from "
            "open-source models and the potential for AI-generated disinformation to influence "
            "elections. No legislation was introduced; committee staff said a markup is "
            "scheduled for next month."
        ),
        "source_url": "https://judiciary.senate.gov/hearing/ai-safety",
        "source_name": "senate",
    },
    {
        "title": "ChatGPT surpasses 200 million weekly active users, OpenAI announces",
        "raw_content": (
            "OpenAI CEO Sam Altman revealed at a company all-hands meeting that ChatGPT has "
            "grown to more than 200 million weekly active users, doubling from 100 million "
            "reported in November 2023. The growth is driven by the launch of memory features "
            "and the expansion to 150 countries. Altman credited the consumer momentum with "
            "helping OpenAI achieve profitability on an operating basis for the first time."
        ),
        "source_url": "https://techcrunch.com/chatgpt-200M-users",
        "source_name": "techcrunch",
    },
    {
        "title": "NVIDIA stock surges 12% after record AI chip demand forecast",
        "raw_content": (
            "NVIDIA shares rose 12.4% in after-hours trading following Q3 earnings that beat "
            "analyst estimates by $2.1 billion. Data Center revenue hit $30.8 billion, up 112% "
            "year-over-year. CEO Jensen Huang forecasted continued demand growth for H100 and "
            "upcoming GB200 NVL72 rack systems. The strong quarter pushed NVIDIA's market cap "
            "past $3.5 trillion for the first time, surpassing Apple as the most valuable "
            "publicly traded company."
        ),
        "source_url": "https://wsj.com/nvidia-q3-earnings",
        "source_name": "wsj",
    },
    {
        "title": "World Economic Forum calls for global AI governance framework by 2026",
        "raw_content": (
            "The World Economic Forum released a white paper calling for a binding international "
            "AI governance framework analogous to the International Atomic Energy Agency. The "
            "paper, co-authored by representatives from 40 governments and 60 corporations, "
            "proposes a tiered licensing system for training runs above compute thresholds. "
            "It will be presented at the next Davos summit as a discussion document, with no "
            "binding resolutions expected until member states ratify a treaty."
        ),
        "source_url": "https://weforum.org/reports/ai-governance-2024",
        "source_name": "wef",
    },
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_state(article: dict) -> PipelineState:
    return PipelineState(
        source_url=article["source_url"],
        source_name=article["source_name"],
        title=article["title"],
        raw_content=article["raw_content"],
        published_at=None,
        category="General",
        depth_score=0,
        impact_score=0,
        affected_workflows=[],
        tags=[],
        technical_summary="",
        implementation_steps=[],
        embedding=[],
        error=None,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set",
)
def test_technical_articles_are_classified_correctly():
    """All 10 technical articles must be classified as 'Technical'."""
    failures = []
    for article in TECHNICAL_ARTICLES:
        result = categorizer_node(_make_state(article))
        if result["category"] != "Technical":
            failures.append(
                f"WRONG: '{article['title'][:60]}' → {result['category']!r}"
            )

    accuracy = 1 - len(failures) / len(TECHNICAL_ARTICLES)
    assert accuracy >= 0.95, (
        f"Technical accuracy {accuracy:.0%} < 95%.\nFailures:\n" + "\n".join(failures)
    )


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set",
)
def test_non_technical_articles_are_filtered_out():
    """All 10 non-technical articles must NOT be classified as 'Technical'."""
    failures = []
    for article in NON_TECHNICAL_ARTICLES:
        result = categorizer_node(_make_state(article))
        if result["category"] == "Technical":
            failures.append(
                f"FALSE POSITIVE: '{article['title'][:60]}' → {result['category']!r}"
            )

    accuracy = 1 - len(failures) / len(NON_TECHNICAL_ARTICLES)
    assert accuracy >= 0.95, (
        f"Non-technical filter accuracy {accuracy:.0%} < 95%.\nFailures:\n"
        + "\n".join(failures)
    )


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set",
)
def test_overall_signal_accuracy():
    """Combined accuracy across all 20 articles must be ≥ 95%."""
    correct = 0
    total = len(TECHNICAL_ARTICLES) + len(NON_TECHNICAL_ARTICLES)

    for article in TECHNICAL_ARTICLES:
        result = categorizer_node(_make_state(article))
        if result["category"] == "Technical":
            correct += 1

    for article in NON_TECHNICAL_ARTICLES:
        result = categorizer_node(_make_state(article))
        if result["category"] != "Technical":
            correct += 1

    accuracy = correct / total
    assert accuracy >= 0.95, f"Overall signal accuracy {accuracy:.0%} < 95% ({correct}/{total})"
