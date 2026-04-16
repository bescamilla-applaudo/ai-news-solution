"""
LangGraph noise filter + enrichment pipeline.

LLM backend: OpenRouter (OpenAI-compatible API, free models)
Embeddings:  sentence-transformers/all-MiniLM-L6-v2 (local, 384 dims, no API key)

Graph topology:
  START → categorizer_node
  categorizer_node → evaluator_node      (if category == "Technical")
  categorizer_node → discard_node → END  (if category != "Technical")
  evaluator_node   → summarizer_node
  summarizer_node  → embedder_node
  embedder_node    → storage_node → END
  Any node (exception on category=="Error") → error_node → END
"""
from __future__ import annotations

import json
import logging
import operator
import os
import time
from typing import Annotated, Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from openai import OpenAI

from worker.db import get_supabase

logger = logging.getLogger(__name__)


def _parse_llm_json(text: str) -> dict:
    """Extract and parse JSON from LLM response, handling markdown fences and trailing text."""
    text = text.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]
        else:
            text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    # Try to extract JSON object if there's surrounding text
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        text = text[start:end]
    return json.loads(text)

# ---------------------------------------------------------------------------
# OpenRouter client — OpenAI-SDK-compatible, free models, no card required
# ---------------------------------------------------------------------------

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Free model for cheap first-pass classification
CATEGORIZER_MODEL = "google/gemma-4-31b-it:free"

# Free model for evaluation and summarization (higher quality)
EVALUATOR_MODEL   = "nvidia/nemotron-3-super-120b-a12b:free"
SUMMARIZER_MODEL  = "nvidia/nemotron-3-super-120b-a12b:free"


def _openrouter() -> OpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key or api_key.startswith("REPLACE_"):
        raise EnvironmentError(
            "OPENROUTER_API_KEY is not set or is still the placeholder value.\n"
            "Get a free key at https://openrouter.ai/keys and add it to worker/.env"
        )
    return OpenAI(
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
    )


def _openrouter_chat(*, model: str, messages: list[dict], max_tokens: int = 512):
    """Call OpenRouter with exponential backoff on 429 rate-limit errors."""
    client = _openrouter()
    for attempt in range(4):
        try:
            return client.chat.completions.create(
                model=model, max_tokens=max_tokens, messages=messages,
            )
        except Exception as exc:
            if getattr(exc, "status_code", None) == 429 and attempt < 3:
                wait = 2 ** attempt * 5  # 5s, 10s, 20s
                logger.warning("Rate-limited (429), retrying in %ds…", wait)
                time.sleep(wait)
                continue
            raise


# ---------------------------------------------------------------------------
# Local sentence-transformers embedder (384 dims, no API key, no internet)
# ---------------------------------------------------------------------------

_embedding_model = None


def _get_embedding_model():
    """Lazy-load sentence-transformers model (downloads once on first use ~80MB)."""
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Loaded embedding model: all-MiniLM-L6-v2 (384 dims)")
    return _embedding_model


# ---------------------------------------------------------------------------
# State schema
# ---------------------------------------------------------------------------

class PipelineState(TypedDict):
    source_url: str
    source_name: str
    title: str
    raw_content: str
    published_at: str | None
    category: Literal["Technical", "Financial", "Political", "General", "Error"]
    depth_score: int
    impact_score: int
    affected_workflows: list[str]
    tags: list[str]
    technical_summary: str
    implementation_steps: list[dict]
    embedding: list[float]          # 384 dims (all-MiniLM-L6-v2)
    llm_tokens: Annotated[list[dict], operator.add]
    error: str | None


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

def categorizer_node(state: PipelineState) -> dict:
    """
    OpenRouter (Gemma 4 31B free): cheap first-pass classifier.
    Runs on 100% of articles.
    """
    prompt = (
        "Classify the following article as exactly one of:\n"
        "Technical, Financial, Political, General\n\n"
        "Rules:\n"
        "- Technical: discusses LLM internals, AI frameworks, code, APIs, model releases, "
        "research, developer tools, benchmarks, or architectural patterns affecting software development.\n"
        "- Financial: investment rounds, valuations, acquisitions, market data, revenue.\n"
        "- Political: regulation, government policy, AI safety policy debates, geopolitical topics.\n"
        "- General: anything else.\n\n"
        "Respond with ONLY the category word. No explanation.\n\n"
        f"Title: {state['title']}\n"
        f"Content (first 500 chars): {state['raw_content'][:500]}"
    )

    try:
        response = _openrouter_chat(
            model=CATEGORIZER_MODEL,
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        category_raw = response.choices[0].message.content.strip()
        allowed = {"Technical", "Financial", "Political", "General"}
        category = category_raw if category_raw in allowed else "General"

        usage = response.usage
        return {
            "category": category,
            "llm_tokens": [{
                "model": CATEGORIZER_MODEL,
                "input_tokens": usage.prompt_tokens if usage else 0,
                "output_tokens": usage.completion_tokens if usage else 0,
            }],
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
    OpenRouter (Nemotron 120B free): assigns scores, workflows, and tags.
    Runs only on Technical articles.
    """
    prompt = (
        "You are a technical AI analyst evaluating an article for full-stack developers.\n\n"
        "Respond with a JSON object only. No markdown, no explanation.\n\n"
        "Fields:\n"
        "- depth_score: integer 1-10 (1=surface overview, 10=deep technical implementation detail)\n"
        "- impact_score: integer 1-10 (1=minor, 10=fundamentally changes developer workflows)\n"
        "- affected_workflows: list of up to 4 strings naming developer workflows this affects\n"
        f"- tags: list of matching tags from this vocabulary: {json.dumps(TECH_TAGS_VOCABULARY)}\n\n"
        f"Article title: {state['title']}\n"
        f"Article content: {state['raw_content'][:1500]}\n\n"
        "JSON response:"
    )

    try:
        response = _openrouter_chat(
            model=EVALUATOR_MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        result = _parse_llm_json(text)

        usage = response.usage
        return {
            "depth_score": max(1, min(10, int(result.get("depth_score", 5)))),
            "impact_score": max(1, min(10, int(result.get("impact_score", 5)))),
            "affected_workflows": result.get("affected_workflows", [])[:4],
            "tags": [t for t in result.get("tags", []) if t in TECH_TAGS_VOCABULARY],
            "llm_tokens": [{
                "model": EVALUATOR_MODEL,
                "input_tokens": usage.prompt_tokens if usage else 0,
                "output_tokens": usage.completion_tokens if usage else 0,
            }],
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
    OpenRouter (Nemotron 120B free): generates technical_summary + implementation_steps.
    CONSTRAINT: only include code that is literally present in raw_content.
    """
    prompt = (
        "You are a technical writer for full-stack developers.\n\n"
        "Write a technical summary of this article in Markdown.\n"
        "Then extract up to 5 implementation steps.\n\n"
        "Rules:\n"
        "- Summary: focus on 'What changed' and 'What developers need to know'. Use Markdown headers and bullet points.\n"
        "- Steps: ONLY include code snippets that appear literally in the article content. Never generate or invent code.\n"
        "- If no code is present in the article, set 'code' to null in each step.\n\n"
        'Respond with a single JSON object:\n'
        '{\n'
        '  "technical_summary": "...",\n'
        '  "implementation_steps": [\n'
        '    {"step": 1, "description": "...", "code": "..." or null, "link": "..." or null}\n'
        '  ]\n'
        '}\n\n'
        f"Article title: {state['title']}\n"
        f"Article content: {state['raw_content'][:2500]}\n\n"
        "JSON response:"
    )

    try:
        response = _openrouter_chat(
            model=SUMMARIZER_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        result = _parse_llm_json(text)

        steps = result.get("implementation_steps", [])
        validated_steps = []
        for step in steps[:5]:
            code = step.get("code")
            # Validate code exists in raw content — use normalized comparison
            # to handle whitespace/newline differences from LLM extraction
            if code:
                normalized_code = " ".join(code.split())
                normalized_content = " ".join(state["raw_content"].split())
                if normalized_code not in normalized_content:
                    step["code"] = None
            validated_steps.append(step)

        usage = response.usage
        return {
            "technical_summary": result.get("technical_summary", ""),
            "implementation_steps": validated_steps,
            "llm_tokens": [{
                "model": SUMMARIZER_MODEL,
                "input_tokens": usage.prompt_tokens if usage else 0,
                "output_tokens": usage.completion_tokens if usage else 0,
            }],
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
    Local sentence-transformers (all-MiniLM-L6-v2): generate 384-dim embedding.
    No API key required. Model is cached after first download (~80MB).
    """
    text = state["technical_summary"] or state["title"]
    try:
        model = _get_embedding_model()
        embedding = model.encode(text[:512], normalize_embeddings=True).tolist()
        return {"embedding": embedding, "error": None}
    except Exception as exc:
        logger.exception("embedder_node failed for %s", state["source_url"])
        return {"embedding": [], "error": str(exc)}


def storage_node(state: PipelineState) -> dict:
    """Upsert the enriched article into Supabase and write llm_usage_log."""
    db = get_supabase()

    tag_names = state.get("tags", [])
    tag_ids: list[str] = []
    if tag_names:
        res = db.table("tech_tags").select("id, name").in_("name", tag_names).execute()
        tag_ids = [row["id"] for row in (res.data or [])]

    article_data = {
        "source_url": state["source_url"],
        "source_name": state["source_name"],
        "title": state["title"],
        "raw_content": state.get("raw_content", "")[:50000],
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

    res = db.table("news_items").upsert(article_data, on_conflict="source_url").execute()

    if res.data:
        article_id = res.data[0]["id"]
        if tag_ids:
            tag_rows = [{"news_item_id": article_id, "tech_tag_id": tid} for tid in tag_ids]
            db.table("news_item_tags").upsert(tag_rows, on_conflict="news_item_id,tech_tag_id").execute()

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
    """Insert a minimal record with is_filtered=FALSE for discard analytics."""
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
    """Store the raw article as is_filtered=FALSE. Celery will retry the task."""
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
