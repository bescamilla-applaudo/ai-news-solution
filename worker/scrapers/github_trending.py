"""
GitHub Trending scraper using the GitHub Search API.

Queries repositories tagged with AI/agents topics, sorted by stars,
filtered to repos pushed in the last 30 days. Stores the repo description
and README excerpt (first 1500 chars) as raw_content.

Requires: GITHUB_TOKEN env var (PAT with public_repo scope).
Polling interval: every 2 hours (registered in main.py).
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import bleach
import httpx

from worker.scrapers.rss import RawArticle

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"
MAX_REPOS = 20
README_MAX_CHARS = 1500


def _strip(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True).strip()


async def _fetch_readme(client: httpx.AsyncClient, full_name: str, headers: dict) -> str:
    """Fetch the README for a repo and return plain-text excerpt."""
    try:
        res = await client.get(
            f"{GITHUB_API_BASE}/repos/{full_name}/readme",
            headers={**headers, "Accept": "application/vnd.github.raw+json"},
            timeout=10.0,
        )
        if res.status_code == 200:
            text = _strip(res.text)
            return text[:README_MAX_CHARS]
    except httpx.HTTPError:
        pass
    return ""


async def fetch_github_trending() -> list[RawArticle]:
    """
    Search GitHub for recently-active AI/agents repositories.
    Dynamic date filter = last 30 days (computed at runtime, never hardcoded).
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    headers: dict[str, str] = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-News-Bot/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    search_url = (
        f"{GITHUB_API_BASE}/search/repositories"
        f"?q=topic:ai+topic:agents+pushed:>{since}"
        f"&sort=stars&order=desc&per_page={MAX_REPOS}"
    )

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(search_url, headers=headers)
            if res.status_code == 403:
                logger.warning("GitHub API rate limit hit (no token or token exhausted)")
                return []
            res.raise_for_status()
            data = res.json()
    except httpx.HTTPError as exc:
        logger.error("GitHub Trending fetch failed: %s", exc)
        return []

    repos = data.get("items", [])
    articles: list[RawArticle] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        readme_tasks = [
            _fetch_readme(client, repo["full_name"], headers)
            for repo in repos
        ]
        readmes = await asyncio.gather(*readme_tasks, return_exceptions=True)

    for repo, readme in zip(repos, readmes):
        description = _strip(repo.get("description") or "")
        readme_text = readme if isinstance(readme, str) else ""

        raw_content = "\n\n".join(filter(None, [
            f"Repository: {repo['full_name']}",
            f"Stars: {repo.get('stargazers_count', 0):,}",
            f"Language: {repo.get('language', 'Unknown')}",
            description,
            f"README:\n{readme_text}" if readme_text else "",
        ]))

        pushed_at: str | None = repo.get("pushed_at")

        articles.append(
            RawArticle(
                source_url=repo["html_url"],
                source_name="github",
                title=f"{repo['full_name']} — {description}" if description else repo["full_name"],
                raw_content=raw_content,
                published_at=pushed_at,
            )
        )

    logger.info("Fetched %d repos from GitHub Trending", len(articles))
    return articles
