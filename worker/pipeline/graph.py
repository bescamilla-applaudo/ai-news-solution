"""
LangGraph noise filter + enrichment pipeline.

Graph topology:
  START → categorizer_node
  categorizer_node → evaluator_node      (if category == "Technical")
  categorizer_node → discard_node → END  (if category != "Technical")
  evaluator_node   → summarizer_node
  summarizer_node  → embedder_node
  embedder_node    → storage_node → END
  Any node (exception) → error_node → END
"""
from __future__ import annotations

import json
import logging
import operator
import os
from typing import Annotated, Literal, TypedDict

import anthropic
from langgraph.graph import END, START, StateGraph
from openai import OpenAI

from worker.db import get_supabase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# State schema
# ---------------------------------------------------------------------------

class PipelineState(TypedDict):
    # Populated by the scraper before the graph runs
    source_url: str
    source_name: str
    title: str
    raw_content: str
    published_at: str | None
    # After categorizer_node
    category: Literal["Technical", "Financial", "Political", "General", "Error"]
    # After evaluator_node
    depth_score: int           # Technical complexity: 1-10
    impact_score: int          # Developer workflow impact: 1-10
    affected_workflows: list[str]
    tags: list[str]            # Tag names matched to tech_tags vocabulary
    # After summarizer_node
    technical_summary: str
    implementation_steps: list[dict]
    # After embedder_node
    embedding: list[float]
    # LLM token usage accumulated across nodes — written to llm_usage_log in storage_node
    llm_tokens: Annotated[list[dict], operator.add]
    # Error tracking
    error: str | None


# ---------------------------------------------------------------------------
# Anthropic + OpenAI clients (initialized lazily in nodes)
# ---------------------------------------------------------------------------

def _anthropic() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def _openai() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

def categorizer_node(state: PipelineState) -> dict:
    """
    claude-haiku-4-5: cheap first-pass classifier.
    Runs on 100% of articles.
    """
    client = _anthropic()

    prompt = f"""Classify the following article as exactly one of:
Technical, Financial, Political, General

Rules:
- Technical: discusses LLM internals, AI frameworks, code, APIs, model releases, research, developer tools, benchmarks, or architectural patterns affecting software development.
- Financial: investment rounds, valuations, acquisitions, market data, revenue.
- Political: regulation, government policy, AI safety policy debates, geopolitical topics.
- General: anything else (executive moves, general business news, events, opinions without technical content).

Respond with ONLY the category word. No explanation.

Title: {state['title']}
Content (first 500 chars): {state['raw_content'][:500]}"""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        category_raw = message.content[0].text.strip()
        # Validate against allowed values
        allowed = {"Technical", "Financial", "Political", "General"}
        category = category_raw if category_raw in allowed else "General"
        return {
            "category": category,
            "llm_tokens": [{"model": "claude-haiku-4-5", "input_tokens": message.usage.input_tokens, "output_tokens": message.usage.output_tokens}],
            "error": None,
        }
    except Exception as exc:
        logger.exception("categorizer_node failed for %s", state["source_url"])
        return {"category": "Error", "error": str(exc)}


TECH_TAGS_VOCABULARY = [
    "Multi-Agent", "LLM-Release", "RAG", "Dev-Tools", "Research",
    "Methodologies", "LangGraph", "Claude", "Agents", "Embeddings",
]


def evaluator_node(state: PipelineState) -> dict:
    """
    claude-opus-4-5: assigns depth_score, impact_score, affected_workflows, tags.
    Runs only on Technical articles.
    """
    client = _anthropic()

    prompt = f"""You are a technical AI analyst evaluating an article for full-stack developers.

Respond with a JSON object only. No markdown, no explanation.

Fields:
- depth_score: integer 1-10 (1=surface overview, 10=deep technical implementation detail)
- impact_score: integer 1-10 (1=minor, 10=fundamentally changes developer workflows)
- affected_workflows: list of up to 4 strings naming developer workflows this affects (e.g. "RAG Pipelines", "Agent Orchestration", "Embedding Generation")
- tags: list of matching tags from this vocabulary (include ALL that apply): {json.dumps(TECH_TAGS_VOCABULARY)}

Article title: {state['title']}
Article content: {state['raw_content'][:1500]}

JSON response:"""

    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        result = json.loads(message.content[0].text.strip())
        return {
            "depth_score": max(1, min(10, int(result.get("depth_score", 5)))),
            "impact_score": max(1, min(10, int(result.get("impact_score", 5)))),
            "affected_workflows": result.get("affected_workflows", [])[:4],
            "tags": [t for t in result.get("tags", []) if t in TECH_TAGS_VOCABULARY],
            "llm_tokens": [{"model": "claude-opus-4-5", "input_tokens": message.usage.input_tokens, "output_tokens": message.usage.output_tokens}],
            "error": None,
        }
    except Exception as exc:
        logger.exception("evaluator_node failed for %s", state["source_url"])
        return {
            "depth_score": 5, "impact_score": 5,
            "affected_workflows": [], "tags": [],
            "error": str(exc),
        }


def summarizer_node(state: PipelineState) -> dict:
    """
    claude-opus-4-5: generates technical_summary (Markdown) and implementation_steps.
    CONSTRAINT: only include code that is literally present in raw_content.
    """
    client = _anthropic()

    prompt = f"""You are a technical writer for full-stack developers.

Write a technical summary of this article in Markdown.
Then extract up to 5 implementation steps.

Rules:
- Summary: focus on "What changed" and "What developers need to know". Use Markdown headers and bullet points.
- Steps: ONLY include code snippets that appear literally in the article content. Never generate or invent code.
- If no code is present in the article, set "code" to null in each step.

Respond with a single JSON object:
{{
  "technical_summary": "...",
  "implementation_steps": [
    {{"step": 1, "description": "...", "code": "..." or null, "link": "..." or null}}
  ]
}}

Article title: {state['title']}
Article content: {state['raw_content'][:2500]}

JSON response:"""

    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        result = json.loads(message.content[0].text.strip())

        steps = result.get("implementation_steps", [])
        # Validate: reject any code snippet not found verbatim in raw_content
        validated_steps = []
        for step in steps[:5]:
            code = step.get("code")
            if code and code not in state["raw_content"]:
                step["code"] = None  # Strip hallucinated code
            validated_steps.append(step)

        return {
            "technical_summary": result.get("technical_summary", ""),
            "implementation_steps": validated_steps,
            "llm_tokens": [{"model": "claude-opus-4-5", "input_tokens": message.usage.input_tokens, "output_tokens": message.usage.output_tokens}],
            "error": None,
        }
    except Exception as exc:
        logger.exception("summarizer_node failed for %s", state["source_url"])
        return {
            "technical_summary": state["title"],
            "implementation_steps": [],
            "error": str(exc),
        }


def embedder_node(state: PipelineState) -> dict:
    """
    OpenAI text-embedding-3-small: generate 1536-dim embedding from technical_summary.
    """
    client = _openai()
    text = state["technical_summary"] or state["title"]
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],  # model limit
        )
        return {"embedding": response.data[0].embedding, "error": None}
    except Exception as exc:
        logger.exception("embedder_node failed for %s", state["source_url"])
        return {"embedding": [], "error": str(exc)}


def storage_node(state: PipelineState) -> dict:
    """
    Upsert the enriched article into Supabase and write llm_usage_log.
    Uses the service role key — bypasses RLS.
    """
    db = get_supabase()

    # Resolve tag UUIDs from the denormalized tag names
    tag_names = state.get("tags", [])
    tag_ids: list[str] = []
    if tag_names:
        res = db.table("tech_tags").select("id, name").in_("name", tag_names).execute()
        tag_ids = [row["id"] for row in (res.data or [])]

    article_data = {
        "source_url": state["source_url"],
        "source_name": state["source_name"],
        "title": state["title"],
        "raw_content": state.get("raw_content", "")[:50000],  # cap storage
        "technical_summary": state.get("technical_summary"),
        "impact_score": state.get("impact_score"),
        "depth_score": state.get("depth_score"),
        "implementation_steps": state.get("implementation_steps"),
        "affected_workflows": state.get("affected_workflows"),
        "embedding": state.get("embedding") or None,
        "category": state.get("category"),
        "tags": tag_names,
        "published_at": state.get("published_at"),
        "is_filtered": True,
    }

    # Upsert on source_url (unique constraint)
    res = db.table("news_items").upsert(article_data, on_conflict="source_url").execute()

    if res.data:
        article_id = res.data[0]["id"]
        # Upsert tags into join table
        if tag_ids:
            tag_rows = [{"news_item_id": article_id, "tech_tag_id": tid} for tid in tag_ids]
            db.table("news_item_tags").upsert(tag_rows, on_conflict="news_item_id,tech_tag_id").execute()

    # Write LLM token usage for cost tracking and cap enforcement
    usage_rows = [
        {
            "model": entry["model"],
            "input_tokens": entry["input_tokens"],
            "output_tokens": entry["output_tokens"],
            "job_id": state["source_url"],
        }
        for entry in state.get("llm_tokens", [])
    ]
    if usage_rows:
        db.table("llm_usage_log").insert(usage_rows).execute()

    logger.info("Stored article: %s", state["source_url"])
    return {}


def discard_node(state: PipelineState) -> dict:
    """
    Insert a minimal record with is_filtered=FALSE so discard trends are queryable.
    The full reason is captured in LangSmith traces.
    """
    db = get_supabase()
    try:
        db.table("news_items").upsert(
            {
                "source_url": state["source_url"],
                "source_name": state["source_name"],
                "title": state["title"],
                "category": state.get("category"),
                "published_at": state.get("published_at"),
                "is_filtered": False,
            },
            on_conflict="source_url",
        ).execute()
    except Exception as exc:
        logger.warning("discard_node DB write failed: %s", exc)
    return {}


def error_node(state: PipelineState) -> dict:
    """
    Store the raw article as is_filtered=FALSE. Celery will retry the task.
    """
    db = get_supabase()
    try:
        db.table("news_items").upsert(
            {
                "source_url": state["source_url"],
                "source_name": state["source_name"],
                "title": state["title"],
                "category": "Error",
                "published_at": state.get("published_at"),
                "is_filtered": False,
            },
            on_conflict="source_url",
        ).execute()
    except Exception as exc:
        logger.warning("error_node DB write failed: %s", exc)

    # Re-raise so Celery retry mechanism kicks in
    raise RuntimeError(state.get("error") or "Pipeline error")


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

def route_after_categorizer(state: PipelineState) -> str:
    if state["category"] == "Technical":
        return "evaluator_node"
    if state["category"] == "Error":
        return "error_node"
    return "discard_node"


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("categorizer_node", categorizer_node)
    graph.add_node("evaluator_node", evaluator_node)
    graph.add_node("summarizer_node", summarizer_node)
    graph.add_node("embedder_node", embedder_node)
    graph.add_node("storage_node", storage_node)
    graph.add_node("discard_node", discard_node)
    graph.add_node("error_node", error_node)

    graph.add_edge(START, "categorizer_node")
    graph.add_conditional_edges("categorizer_node", route_after_categorizer)
    graph.add_edge("evaluator_node", "summarizer_node")
    graph.add_edge("summarizer_node", "embedder_node")
    graph.add_edge("embedder_node", "storage_node")
    graph.add_edge("storage_node", END)
    graph.add_edge("discard_node", END)
    # error_node raises RuntimeError → Celery sees exception and retries

    return graph.compile()


# Singleton compiled graph reused across Celery tasks
pipeline = build_graph()


def run_pipeline(
    *,
    source_url: str,
    source_name: str,
    title: str,
    raw_content: str,
    published_at: str | None,
) -> None:
    """Entry point called by the Celery task."""
    initial_state: PipelineState = {
        "source_url": source_url,
        "source_name": source_name,
        "title": title,
        "raw_content": raw_content,
        "published_at": published_at,
        "category": "General",
        "depth_score": 0,
        "impact_score": 0,
        "affected_workflows": [],
        "tags": [],
        "technical_summary": "",
        "implementation_steps": [],
        "embedding": [],
        "llm_tokens": [],
        "error": None,
    }
    pipeline.invoke(initial_state)
