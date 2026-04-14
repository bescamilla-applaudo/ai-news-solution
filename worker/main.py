"""
Worker entry point.

Starts the APScheduler that periodically enqueues scrape tasks,
then launches the Celery worker in the same process.

Schedule (from ARCHITECTURE.md §5):
  - Anthropic + OpenAI RSS feeds  → every 30 minutes
  - Google DeepMind RSS           → every 30 minutes
  - Arxiv cs.AI + cs.CL           → every 60 minutes
  - Hacker News (keyword filter)  → every 60 minutes
  - GitHub Trending               → every 2 hours
"""
from __future__ import annotations

import asyncio
import logging
import signal
import sys

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

load_dotenv()  # Must be first so env vars are available to all imports

from worker.celery_app import app as celery_app  # noqa: E402
from worker.db import get_supabase  # noqa: E402
from worker.scrapers.arxiv import scrape_arxiv  # noqa: E402
from worker.scrapers.deepmind import fetch_deepmind  # noqa: E402
from worker.scrapers.github_trending import fetch_github_trending  # noqa: E402
from worker.scrapers.hn import fetch_hn  # noqa: E402
from worker.scrapers.rss import fetch_all_rss  # noqa: E402
from worker.tasks.process_article import process_article  # noqa: E402
from worker.tasks.weekly_brief import send_weekly_brief  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def _already_seen(urls: list[str]) -> set[str]:
    """Return the subset of URLs already present in news_items (any is_filtered value)."""
    if not urls:
        return set()
    try:
        db = get_supabase()
        res = db.table("news_items").select("source_url").in_("source_url", urls).execute()
        return {row["source_url"] for row in (res.data or [])}
    except Exception:
        logger.warning("Dedup check failed; queuing all articles to avoid data loss")
        return set()


def _enqueue_rss() -> None:
    """Fetch all RSS feeds and submit each article as a Celery task."""
    logger.info("Scheduler: fetching RSS feeds")
    try:
        articles = asyncio.run(fetch_all_rss())
        seen = _already_seen([a["source_url"] for a in articles])
        new_articles = [a for a in articles if a["source_url"] not in seen]
        for article in new_articles:
            process_article.apply_async(
                kwargs={
                    "source_url": article["source_url"],
                    "source_name": article["source_name"],
                    "title": article["title"],
                    "raw_content": article["raw_content"],
                    "published_at": article["published_at"],
                }
            )
        logger.info("Scheduler: enqueued %d/%d new RSS articles", len(new_articles), len(articles))
    except Exception:
        logger.exception("RSS scrape job failed")


def _enqueue_arxiv() -> None:
    """Fetch Arxiv and submit each paper as a Celery task."""
    logger.info("Scheduler: fetching Arxiv papers")
    try:
        papers = asyncio.run(scrape_arxiv())
        seen = _already_seen([p["source_url"] for p in papers])
        new_papers = [p for p in papers if p["source_url"] not in seen]
        for paper in new_papers:
            process_article.apply_async(
                kwargs={
                    "source_url": paper["source_url"],
                    "source_name": paper["source_name"],
                    "title": paper["title"],
                    "raw_content": paper["raw_content"],
                    "published_at": paper["published_at"],
                }
            )
        logger.info("Scheduler: enqueued %d/%d new Arxiv papers", len(new_papers), len(papers))
    except Exception:
        logger.exception("Arxiv scrape job failed")


def _enqueue_deepmind() -> None:
    """Fetch Google DeepMind blog and submit each article as a Celery task."""
    logger.info("Scheduler: fetching DeepMind RSS")
    try:
        articles = asyncio.run(fetch_deepmind())
        seen = _already_seen([a["source_url"] for a in articles])
        new_articles = [a for a in articles if a["source_url"] not in seen]
        for article in new_articles:
            process_article.apply_async(
                kwargs={
                    "source_url": article["source_url"],
                    "source_name": article["source_name"],
                    "title": article["title"],
                    "raw_content": article["raw_content"],
                    "published_at": article["published_at"],
                }
            )
        logger.info("Scheduler: enqueued %d/%d new DeepMind articles", len(new_articles), len(articles))
    except Exception:
        logger.exception("DeepMind scrape job failed")


def _enqueue_hn() -> None:
    """Fetch keyword-filtered HN stories and submit as Celery tasks."""
    logger.info("Scheduler: fetching Hacker News stories")
    try:
        stories = asyncio.run(fetch_hn())
        seen = _already_seen([s["source_url"] for s in stories])
        new_stories = [s for s in stories if s["source_url"] not in seen]
        for story in new_stories:
            process_article.apply_async(
                kwargs={
                    "source_url": story["source_url"],
                    "source_name": story["source_name"],
                    "title": story["title"],
                    "raw_content": story["raw_content"],
                    "published_at": story["published_at"],
                }
            )
        logger.info("Scheduler: enqueued %d/%d new HN stories", len(new_stories), len(stories))
    except Exception:
        logger.exception("HN scrape job failed")


def _enqueue_github() -> None:
    """Fetch GitHub Trending repos and submit as Celery tasks."""
    logger.info("Scheduler: fetching GitHub Trending")
    try:
        repos = asyncio.run(fetch_github_trending())
        seen = _already_seen([r["source_url"] for r in repos])
        new_repos = [r for r in repos if r["source_url"] not in seen]
        for repo in new_repos:
            process_article.apply_async(
                kwargs={
                    "source_url": repo["source_url"],
                    "source_name": repo["source_name"],
                    "title": repo["title"],
                    "raw_content": repo["raw_content"],
                    "published_at": repo["published_at"],
                }
            )
        logger.info("Scheduler: enqueued %d/%d new GitHub repos", len(new_repos), len(repos))
    except Exception:
        logger.exception("GitHub Trending scrape job failed")


def main() -> None:
    scheduler = BackgroundScheduler()
    # Existing sources
    scheduler.add_job(_enqueue_rss, "interval", minutes=30, id="rss_feed", replace_existing=True)
    scheduler.add_job(_enqueue_arxiv, "interval", minutes=60, id="arxiv_scrape", replace_existing=True)
    # Phase 3 sources
    scheduler.add_job(_enqueue_deepmind, "interval", minutes=30, id="deepmind_feed", replace_existing=True)
    scheduler.add_job(_enqueue_hn, "interval", minutes=60, id="hn_scrape", replace_existing=True)
    scheduler.add_job(_enqueue_github, "interval", hours=2, id="github_trending", replace_existing=True)
    # Phase 4: weekly brief every Monday at 00:00 UTC
    scheduler.add_job(
        send_weekly_brief,
        "cron",
        day_of_week="mon",
        hour=0,
        minute=0,
        timezone="UTC",
        id="weekly_brief",
        replace_existing=True,
    )
    scheduler.start()

    # Run all on startup so the first cycle doesn't wait
    _enqueue_rss()
    _enqueue_deepmind()
    _enqueue_arxiv()
    _enqueue_hn()
    _enqueue_github()

    def _shutdown(signum, frame):  # noqa: ANN001
        logger.info("Shutdown signal received")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    logger.info("Starting Celery worker")
    celery_app.worker_main(
        argv=[
            "worker",
            "--loglevel=INFO",
            "--concurrency=4",
            "--without-gossip",
            "--without-mingle",
        ]
    )


if __name__ == "__main__":
    main()
