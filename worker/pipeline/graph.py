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
import threading
import time
from datetime import datetime, timezone
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
DAILY_TOKEN_CAP = int(os.environ.get("DAILY_TOKEN_CAP", "0"))


class DailyTokenCapExceeded(RuntimeError):
    """Raised when the daily LLM token budget has been exhausted."""


def _check_daily_token_cap() -> None:
    """Raise DailyTokenCapExceeded if today's token usage meets or exceeds the cap."""
    if DAILY_TOKEN_CAP <= 0:
        return
    db = get_supabase()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = (
        db.table("llm_usage_log")
        .select("input_tokens, output_tokens")
        .gte("timestamp", f"{today}T00:00:00Z")
        .execute()
    )
    total = sum(
        (row.get("input_tokens", 0) or 0) + (row.get("output_tokens", 0) or 0)
        for row in (res.data or [])
    )
    if total >= DAILY_TOKEN_CAP:
        msg = f"Daily token cap reached: {total:,} / {DAILY_TOKEN_CAP:,}"
        logger.warning(msg)
        raise DailyTokenCapExceeded(msg)

# ---------------------------------------------------------------------------
# Free-model pool with automatic rotation on rate-limit (429)
#
# OpenRouter free-tier limits:
#   - 20 requests/minute per model
#   - 50 requests/day total (or 1000/day if $10+ credits purchased)
#
# When a model hits 429, we rotate to the next one in the pool.
# Each role (categorizer, evaluator, summarizer) has its own ordered pool
# so we can assign the best-fit models per task complexity.
# ---------------------------------------------------------------------------

class ModelPool:
    """Thread-safe round-robin pool of free OpenRouter models for a given role."""

    def __init__(self, models: list[str]) -> None:
        self._models = models
        self._index = 0
        self._lock = threading.Lock()

    @property
    def current(self) -> str:
        with self._lock:
            return self._models[self._index]

    def rotate(self) -> str:
        """Advance to the next model and return it. Wraps around."""
        with self._lock:
            self._index = (self._index + 1) % len(self._models)
            model = self._models[self._index]
            logger.warning("Model rotated → %s", model)
            return model

    @property
    def all_models(self) -> list[str]:
        return list(self._models)


# Categorizer: lightweight, fast classification (only needs ~10 output tokens)
CATEGORIZER_POOL = ModelPool([
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
])

# Evaluator/Summarizer: need higher quality for scoring and writing
EVALUATOR_POOL = ModelPool([
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-120b:free",
    "minimax/minimax-m2.5:free",
])

SUMMARIZER_POOL = ModelPool([
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-120b:free",
    "minimax/minimax-m2.5:free",
])

# Legacy constants for backward compatibility (tests, weekly_brief)
CATEGORIZER_MODEL = CATEGORIZER_POOL.current
EVALUATOR_MODEL = EVALUATOR_POOL.current
SUMMARIZER_MODEL = SUMMARIZER_POOL.current


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


def _openrouter_chat(*, model: str, messages: list[dict], max_tokens: int = 512,
                     pool: ModelPool | None = None):
    """Call OpenRouter with exponential backoff on 429 rate-limit errors.

    If a ``ModelPool`` is provided and the current model returns 429,
    we rotate to the next free model in the pool before retrying.
    """
    _check_daily_token_cap()
    client = _openrouter()
    active_model = model
    for attempt in range(4):
        try:
            return client.chat.completions.create(
                model=active_model, max_tokens=max_tokens, messages=messages,
            )
        except Exception as exc:
            if getattr(exc, "status_code", None) == 429 and attempt < 3:
                wait = 2 ** attempt * 5  # 5s, 10s, 20s
                if pool is not None:
                    active_model = pool.rotate()
                    logger.warning("429 on %s → rotated to %s, retrying in %ds…",
                                   model, active_model, wait)
                else:
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
        model = CATEGORIZER_POOL.current
        response = _openrouter_chat(
            model=model,
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
            pool=CATEGORIZER_POOL,
        )
        category_raw = response.choices[0].message.content.strip()
        allowed = {"Technical", "Financial", "Political", "General"}
        category = category_raw if category_raw in allowed else "General"

        usage = response.usage
        return {
            "category": category,
            "llm_tokens": [{
                "model": model,
                "input_tokens": usage.prompt_tokens if usage else 0,
                "output_tokens": usage.completion_tokens if usage else 0,
            }],
            "error": None,
        }
    except Exception as exc:
        logger.exception("categorizer_node failed for %s", state["source_url"])
        return {"category": "Error", "error": str(exc)}


TECH_TAGS_EXAMPLES = [
    "LLM", "Agents", "RAG", "Multi-Agent", "Dev-Tools", "Fine-Tuning",
    "Embeddings", "Reasoning", "Code-Generation", "Vision", "MCP",
    "Evaluation", "Inference", "Open-Source", "Diffusion", "RL",
]


def evaluator_node(state: PipelineState) -> dict:
    """
    OpenRouter (Nemotron 120B free): assigns scores, workflows, and tags.
    Tags are LLM-generated — not constrained to a fixed vocabulary.
    New tags are auto-created in the database by storage_node.
    """
    prompt = (
        "You are a technical AI analyst evaluating an article for full-stack developers.\n\n"
        "Respond with a JSON object only. No markdown, no explanation.\n\n"
        "Fields:\n"
        "- depth_score: integer 1-10 (1=surface overview, 10=deep technical implementation detail)\n"
        "- impact_score: integer 1-10 (1=minor, 10=fundamentally changes developer workflows)\n"
        "- affected_workflows: list of up to 4 strings naming developer workflows this affects\n"
        "- tags: list of 1-4 short, specific technology tags that describe this article's core topics.\n"
        "  Use PascalCase or hyphenated format (e.g. 'Multi-Agent', 'Code-Generation', 'Fine-Tuning').\n"
        "  Focus on the KEY TECHNOLOGY or METHODOLOGY, not generic terms.\n"
        "  Prefer tags that a developer would search for.\n"
        f"  Here are some example tags (but you can create new ones): {json.dumps(TECH_TAGS_EXAMPLES)}\n\n"
        f"Article title: {state['title']}\n"
        f"Article content: {state['raw_content'][:1500]}\n\n"
        "JSON response:"
    )

    try:
        model = EVALUATOR_POOL.current
        response = _openrouter_chat(
            model=model,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
            pool=EVALUATOR_POOL,
        )
        text = response.choices[0].message.content.strip()
        result = _parse_llm_json(text)

        usage = response.usage
        # Validate tags: keep well-formed, short tags (max 30 chars, no weird characters)
        raw_tags = result.get("tags", [])[:4]
        valid_tags = [
            t.strip() for t in raw_tags
            if isinstance(t, str) and 1 < len(t.strip()) <= 30
            and t.strip().replace("-", "").replace(" ", "").isalnum()
        ]
        return {
            "depth_score": max(1, min(10, int(result.get("depth_score", 5)))),
            "impact_score": max(1, min(10, int(result.get("impact_score", 5)))),
            "affected_workflows": result.get("affected_workflows", [])[:4],
            "tags": valid_tags,
            "llm_tokens": [{
                "model": model,
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
        model = SUMMARIZER_POOL.current
        response = _openrouter_chat(
            model=model,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
            pool=SUMMARIZER_POOL,
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
                "model": model,
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
        # Look up existing tags
        res = db.table("tech_tags").select("id, name").in_("name", tag_names).execute()
        existing = {row["name"]: row["id"] for row in (res.data or [])}

        # Auto-create any new tags the LLM suggested
        new_tags = [name for name in tag_names if name not in existing]
        if new_tags:
            insert_data = [{"name": name, "category": "auto"} for name in new_tags]
            new_res = db.table("tech_tags").upsert(
                insert_data, on_conflict="name"
            ).execute()
            for row in (new_res.data or []):
                existing[row["name"]] = row["id"]

        tag_ids = [existing[name] for name in tag_names if name in existing]

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
