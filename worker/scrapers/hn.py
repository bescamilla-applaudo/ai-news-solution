"""
Hacker News scraper using the official Firebase REST API.

Approach:
1. Fetch the top 200 story IDs from /v0/newstories.json
2. Filter by AI/LLM keywords in the title (client-side, no extra API calls)
3. Fetch full story detail only for matching stories (up to 20)

Technical keywords filter ensures signal quality before LangGraph classification.
Polling interval: every 60 minutes (registered in main.py).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import bleach
import httpx

from worker.scrapers.rss import RawArticle

logger = logging.getLogger(__name__)

HN_BASE = "https://hacker-news.firebaseio.com/v0"
HN_MAX_STORIES = 200   # story IDs to fetch
HN_MAX_RESULTS = 20    # articles to return after filtering

# Keywords that indicate a HN story is relevant to our audience.
# Checked case-insensitively against the story title.
KEYWORDS = frozenset([
    "langchain", "langgraph", "llm", "large language", "agent", "rag",
    "embedding", "anthropic", "openai", "claude", "gpt", "gemini",
    "transformer", "vector db", "pgvector", "fine-tun", "inference",
    "mcp", "model context", "multi-agent", "agentic", "diffusion",
    "mistral", "llama", "falcon", "phi-", "deepseek",
])


def _strip(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True).strip()


def _is_relevant(title: str) -> bool:
    title_lower = title.lower()
    return any(kw in title_lower for kw in KEYWORDS)


async def _fetch_story(client: httpx.AsyncClient, story_id: int) -> dict | None:
    try:
        res = await client.get(f"{HN_BASE}/item/{story_id}.json", timeout=8.0)
        if res.status_code == 200:
            return res.json()
    except httpx.HTTPError:
        pass
    return None


async def fetch_hn() -> list[RawArticle]:
    """
    Fetch new HN stories, filter by technical AI keywords, return up to 20.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(f"{HN_BASE}/newstories.json")
            res.raise_for_status()
            all_ids: list[int] = res.json()
    except httpx.HTTPError as exc:
        logger.error("HN story list fetch failed: %s", exc)
        return []

    # Fetch details for the top N IDs in parallel, then filter
    top_ids = all_ids[:HN_MAX_STORIES]

    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = [_fetch_story(client, sid) for sid in top_ids]
        results = await asyncio.gather(*tasks)

    articles: list[RawArticle] = []

    for story in results:
        if not story or story.get("type") != "story":
            continue
        title = _strip(story.get("title") or "")
        if not title or not _is_relevant(title):
            continue

        url: str = story.get("url") or f"https://news.ycombinator.com/item?id={story['id']}"
        text = _strip(story.get("text") or "")  # self-posts have body text
        score = story.get("score", 0)
        comments = story.get("descendants", 0)

        raw_content = "\n\n".join(filter(None, [
            f"HN Score: {score} points | {comments} comments",
            text,
        ]))

        # Convert Unix timestamp to ISO-8601
        published_at: str | None = None
        ts = story.get("time")
        if ts:
            published_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

        articles.append(
            RawArticle(
                source_url=url,
                source_name="hn",
                title=title,
                raw_content=raw_content,
                published_at=published_at,
            )
        )

        if len(articles) >= HN_MAX_RESULTS:
            break

    logger.info("Fetched %d relevant HN stories", len(articles))
    return articles
