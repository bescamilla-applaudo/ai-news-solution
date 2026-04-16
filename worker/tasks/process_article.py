"""
Celery task: process a single article through the LangGraph pipeline.

Retry strategy: 3 attempts with exponential back-off (5 s → 10 s → 20 s).
Cost cap: abort the task (silently) if today's token budget is exhausted.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from celery.exceptions import Ignore

from worker.celery_app import app
from worker.db import get_supabase
from worker.pipeline.graph import run_pipeline

logger = logging.getLogger(__name__)

DAILY_TOKEN_CAP = int(os.environ.get("DAILY_TOKEN_CAP", "400000"))


def _tokens_used_today() -> int:
    """Sum input + output tokens logged today via llm_usage_log."""
    db = get_supabase()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = (
        db.table("llm_usage_log")
        .select("input_tokens, output_tokens")
        .gte("timestamp", f"{today}T00:00:00")  # column is 'timestamp', not 'created_at'
        .execute()
    )
    total = 0
    for row in res.data or []:
        total += (row.get("input_tokens") or 0) + (row.get("output_tokens") or 0)
    return total


@app.task(bind=True, max_retries=3, name="worker.tasks.process_article")
def process_article(
    self,
    *,
    source_url: str,
    source_name: str,
    title: str,
    raw_content: str,
    published_at: str | None,
) -> None:
    """
    Process a single scraped article through the full LangGraph pipeline.

    Args:
        source_url: Canonical URL used as upsert key.
        source_name: e.g. "anthropic", "openai", "arxiv".
        title: Article headline.
        raw_content: Sanitized plain-text body (bleach-stripped).
        published_at: ISO-8601 timestamp or None.
    """
    # --- Cost gate (skip if DAILY_TOKEN_CAP=0, i.e. unlimited) ---
    if DAILY_TOKEN_CAP > 0:
        tokens_today = _tokens_used_today()
        if tokens_today >= DAILY_TOKEN_CAP:
            logger.warning(
                "Daily token cap reached (%d / %d). Ignoring task for %s.",
                tokens_today, DAILY_TOKEN_CAP, source_url,
            )
            raise Ignore()

    # --- Pipeline ---
    try:
        run_pipeline(
            source_url=source_url,
            source_name=source_name,
            title=title,
            raw_content=raw_content,
            published_at=published_at,
        )
    except Exception as exc:
        logger.error("Pipeline error for %s: %s", source_url, exc)
        # Exponential back-off: 5 s → 10 s → 20 s
        countdown = 5 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)
