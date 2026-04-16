"""
Celery task: periodic database cleanup.

Runs daily via APScheduler. Executes SQL retention functions to:
  1. Delete discarded articles (is_filtered=FALSE) older than 30 days
  2. Purge LLM usage logs older than 90 days
  3. Soft-archive articles older than 6 months
"""
from __future__ import annotations

import logging

from worker.celery_app import app
from worker.db import get_supabase

logger = logging.getLogger(__name__)


@app.task(name="worker.tasks.cleanup_db")
def cleanup_db() -> None:
    """Run all database retention cleanup functions."""
    db = get_supabase()

    try:
        # 1. Delete old discarded articles
        res = db.rpc("cleanup_discarded_articles", {"days_old": 30}).execute()
        discarded = res.data if res.data else 0
        logger.info("Cleanup: deleted %s discarded articles older than 30 days", discarded)
    except Exception:
        logger.exception("Cleanup: cleanup_discarded_articles failed")

    try:
        # 2. Purge old usage logs
        res = db.rpc("cleanup_usage_logs", {"days_old": 90}).execute()
        logs = res.data if res.data else 0
        logger.info("Cleanup: deleted %s usage log entries older than 90 days", logs)
    except Exception:
        logger.exception("Cleanup: cleanup_usage_logs failed")

    try:
        # 3. Archive old articles
        res = db.rpc("archive_old_articles", {"months_old": 6}).execute()
        archived = res.data if res.data else 0
        logger.info("Cleanup: archived %s articles older than 6 months", archived)
    except Exception:
        logger.exception("Cleanup: archive_old_articles failed")
