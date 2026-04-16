"""
Google DeepMind blog RSS scraper.
Same pattern as the HuggingFace/OpenAI scrapers — reuses fetch_rss() from rss.py.
Polling interval: every 30 minutes (registered in main.py).
"""
from __future__ import annotations

from worker.scrapers.rss import RawArticle, fetch_rss

DEEPMIND_RSS_URL = "https://deepmind.google/blog/rss.xml"


async def fetch_deepmind() -> list[RawArticle]:
    return await fetch_rss(DEEPMIND_RSS_URL, "deepmind")
