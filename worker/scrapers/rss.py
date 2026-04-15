"""
Generic async RSS scraper using feedparser + httpx.
Returns a list of raw article dicts ready to be dispatched as Celery tasks.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import TypedDict

import bleach
import feedparser
import httpx

logger = logging.getLogger(__name__)


class RawArticle(TypedDict):
    source_url: str
    title: str
    raw_content: str
    published_at: str | None  # ISO-8601 UTC string
    source_name: str


def _strip_html(html: str) -> str:
    """Remove all HTML tags and return plain text. Prevents prompt injection."""
    return bleach.clean(html, tags=[], strip=True).strip()


def _parse_published(entry: feedparser.FeedParserDict) -> str | None:
    """Return ISO-8601 UTC string from feedparser entry, or None."""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt.isoformat()
    return None


async def fetch_rss(url: str, source_name: str) -> list[RawArticle]:
    """
    Fetch and parse an RSS feed. Returns up to 20 most recent entries.
    Content is HTML-stripped before returning (XSS / prompt-injection prevention).
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(url, headers={"User-Agent": "AI-News-Bot/1.0"})
            response.raise_for_status()
            raw_xml = response.text
    except httpx.HTTPError as exc:
        logger.error("RSS fetch failed for %s: %s", url, exc)
        return []

    feed = feedparser.parse(raw_xml)
    articles: list[RawArticle] = []

    for entry in feed.entries[:20]:
        entry_url: str = getattr(entry, "link", "")
        if not entry_url:
            continue

        # Prefer full content over summary
        content = ""
        if hasattr(entry, "content") and entry.content:
            content = entry.content[0].get("value", "")
        elif hasattr(entry, "summary"):
            content = entry.summary

        articles.append(
            RawArticle(
                source_url=entry_url,
                title=_strip_html(getattr(entry, "title", "")),
                raw_content=_strip_html(content),
                published_at=_parse_published(entry),
                source_name=source_name,
            )
        )

    logger.info("Fetched %d articles from %s (%s)", len(articles), source_name, url)
    return articles


# ---------------------------------------------------------------------------
# Convenience wrappers for each Phase 1-2 source
# ---------------------------------------------------------------------------

RSS_SOURCES: dict[str, str] = {
    # Anthropic removed their RSS feed — replaced with Hugging Face blog (high-quality technical AI content)
    "huggingface": "https://huggingface.co/blog/feed.xml",
    "openai": "https://openai.com/news/rss.xml",
}


async def fetch_all_rss() -> list[RawArticle]:
    tasks = [fetch_rss(url, name) for name, url in RSS_SOURCES.items()]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    articles: list[RawArticle] = []
    for result in results:
        if isinstance(result, Exception):
            logger.error("RSS gather error: %s", result)
        else:
            articles.extend(result)
    return articles
