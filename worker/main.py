"""
Worker entry point.

Starts the APScheduler that periodically enqueues scrape tasks,
then launches the Celery worker in the same process.

Schedule:
  - HuggingFace + OpenAI RSS feeds  → every 30 minutes
  - Google DeepMind RSS             → every 30 minutes
  - Arxiv cs.AI + cs.CL             → every 60 minutes
  - Hacker News (keyword filter)    → every 60 minutes
  - Weekly Intelligence Brief       → Monday 00:00 UTC
"""
from __future__ import annotations

import os
import sys
# Ensure the project root is in sys.path so `worker.*` imports work regardless
# of which directory the script is launched from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Disable LangSmith/LangChain telemetry — no data sent to external tracing services
os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")
os.environ.setdefault("LANGCHAIN_TRACING", "false")

import asyncio
import logging
import signal

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

load_dotenv()  # Must be first so env vars are available to all imports

# Initialize Sentry for error tracking (no-op if SENTRY_WORKER_DSN not set)
import sentry_sdk  # noqa: E402

if os.environ.get("SENTRY_WORKER_DSN"):
    sentry_sdk.init(
        dsn=os.environ["SENTRY_WORKER_DSN"],
        traces_sample_rate=0.1,
        environment=os.environ.get("ENVIRONMENT", "development"),
        send_default_pii=False,
    )

from worker.celery_app import app as celery_app  # noqa: E402
from worker.db import get_supabase  # noqa: E402
from worker.scrapers.arxiv import scrape_arxiv  # noqa: E402
from worker.scrapers.deepmind import fetch_deepmind  # noqa: E402
from worker.scrapers.hn import fetch_hn  # noqa: E402
from worker.scrapers.rss import fetch_all_rss  # noqa: E402
from worker.tasks.process_article import process_article  # noqa: E402
from worker.tasks.weekly_brief import send_weekly_brief  # noqa: E402
from worker.tasks.cleanup_db import cleanup_db  # noqa: E402

from worker.logging_config import setup_logging  # noqa: E402

setup_logging()
logger = logging.getLogger(__name__)


def _already_seen(urls: list[str]) -> set[str]:
    """Return the subset of URLs already present in news_items (any is_filtered value)."""
    if not urls:
        return set()
    try:
        db = get_supabase()
        # Batch in chunks of 500 to avoid query timeouts on large lists
        seen: set[str] = set()
        for i in range(0, len(urls), 500):
            batch = urls[i:i + 500]
            res = db.table("news_items").select("source_url").in_("source_url", batch).execute()
            seen.update(row["source_url"] for row in (res.data or []))
        return seen
    except (ConnectionError, TimeoutError, OSError) as exc:
        logger.warning("Dedup check failed (transient — %s); queuing all articles to avoid data loss", exc)
        return set()
    except Exception:
        logger.exception("Dedup check failed (unexpected error); re-raising to prevent duplicates")
        raise


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


def main() -> None:
    scheduler = BackgroundScheduler()
    scheduler.add_job(_enqueue_rss, "interval", minutes=30, id="rss_feed", replace_existing=True)
    scheduler.add_job(_enqueue_arxiv, "interval", minutes=60, id="arxiv_scrape", replace_existing=True)
    scheduler.add_job(_enqueue_deepmind, "interval", minutes=30, id="deepmind_feed", replace_existing=True)
    scheduler.add_job(_enqueue_hn, "interval", minutes=60, id="hn_scrape", replace_existing=True)
    # Weekly brief every Monday at 00:00 UTC
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
    # Daily database cleanup at 03:00 UTC (low-traffic window)
    scheduler.add_job(
        cleanup_db.delay,
        "cron",
        hour=3,
        minute=0,
        timezone="UTC",
        id="db_cleanup",
        replace_existing=True,
    )
    scheduler.start()

    # Run all on startup so the first cycle doesn't wait
    _enqueue_rss()
    _enqueue_deepmind()
    _enqueue_arxiv()
    _enqueue_hn()

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
