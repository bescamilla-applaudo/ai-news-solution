"""
Arxiv scraper using the Atom/RSS API.
Respects the required 3-second delay between requests.
Fetches cs.AI and cs.CL categories, returns up to 20 most recent papers.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

import bleach
import httpx

from worker.scrapers.rss import RawArticle

logger = logging.getLogger(__name__)

ARXIV_API_URL = (
    "http://export.arxiv.org/api/query"
    "?search_query=cat:cs.AI+OR+cat:cs.CL"
    "&max_results=20"
    "&sortBy=submittedDate"
    "&sortOrder=descending"
)

# Arxiv terms of service: wait at least 3 seconds between requests
ARXIV_RATE_LIMIT_SECONDS = 3

_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}


def _strip(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True).strip().replace("\n", " ")


async def fetch_arxiv() -> list[RawArticle]:
    """
    Fetch recent cs.AI + cs.CL papers from Arxiv.
    Enforces a 3-second pre-request delay to comply with Arxiv API ToS.
    """
    await asyncio.sleep(ARXIV_RATE_LIMIT_SECONDS)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                ARXIV_API_URL,
                headers={"User-Agent": "AI-News-Bot/1.0"},
            )
            response.raise_for_status()
            xml_text = response.text
    except httpx.HTTPError as exc:
        logger.error("Arxiv fetch failed: %s", exc)
        return []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        logger.error("Arxiv XML parse error: %s", exc)
        return []

    articles: list[RawArticle] = []

    for entry in root.findall("atom:entry", _NS):
        # Build the abstract page URL from the id element
        id_elem = entry.find("atom:id", _NS)
        if id_elem is None or not id_elem.text:
            continue

        # Convert API URL to abstract URL: http://arxiv.org/abs/2404.XXXXX
        arxiv_id = id_elem.text.split("/abs/")[-1]
        article_url = f"https://arxiv.org/abs/{arxiv_id}"

        title_elem = entry.find("atom:title", _NS)
        summary_elem = entry.find("atom:summary", _NS)
        published_elem = entry.find("atom:published", _NS)

        title = _strip(title_elem.text or "") if title_elem is not None else ""
        summary = _strip(summary_elem.text or "") if summary_elem is not None else ""

        published_at: str | None = None
        if published_elem is not None and published_elem.text:
            try:
                dt = datetime.fromisoformat(published_elem.text.replace("Z", "+00:00"))
                published_at = dt.astimezone(timezone.utc).isoformat()
            except ValueError:
                pass

        # Concatenate authors for context
        authors = [
            _strip(a.find("atom:name", _NS).text or "")
            for a in entry.findall("atom:author", _NS)
            if a.find("atom:name", _NS) is not None
        ]
        author_str = f"Authors: {', '.join(authors[:5])}\n\n" if authors else ""

        articles.append(
            RawArticle(
                source_url=article_url,
                title=title,
                raw_content=author_str + summary,
                published_at=published_at,
                source_name="arxiv",
            )
        )

    logger.info("Fetched %d papers from Arxiv", len(articles))
    return articles


# Alias used by main.py
scrape_arxiv = fetch_arxiv
