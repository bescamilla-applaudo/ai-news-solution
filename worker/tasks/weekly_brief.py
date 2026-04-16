"""
Weekly AI Intelligence Brief — email digest.

Runs every Monday at 00:00 UTC via APScheduler CronTrigger.

Flow:
  1. Query top 10 articles from the past 7 days by impact_score DESC
  2. Call OpenRouter (free model) to generate a Markdown digest
  3. Fetch all active email_subscriptions
  4. Send one email per subscriber via Resend
  5. Unsubscribe link uses HMAC-SHA256 token (never raw user_id)

Resend free tier: 100 emails/day. If subscriber count > 100,
the function logs a warning and sends to the first 100 only.
Upgrade to Resend Starter ($20/mo) for 50K emails/month.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone

import bleach
from openai import OpenAI
import httpx

from worker.db import get_supabase

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_DAILY_CAP = 100


def _fetch_top_articles() -> list[dict]:
    """Return top 10 articles from the past 7 days by impact_score."""
    db = get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    res = (
        db.table("news_items")
        .select("title, source_name, source_url, technical_summary, impact_score, tags")
        .eq("is_filtered", True)
        .gte("published_at", since)
        .order("impact_score", desc=True)
        .limit(10)
        .execute()
    )
    return res.data or []


def _generate_digest(articles: list[dict], week_of: str) -> str:
    """Use OpenRouter (free model) to generate a Markdown brief from the top articles."""
    client = OpenAI(
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
        base_url="https://openrouter.ai/api/v1",
    )

    article_list = "\n".join(
        f"- [{a['title']}]({a['source_url']}) (Impact: {a.get('impact_score', '?')}/10, "
        f"Source: {a['source_name']})"
        for a in articles
    )

    prompt = f"""You are writing a concise weekly digest for full-stack developers who follow technical AI news.

Week of: {week_of}
Top articles this week:
{article_list}

Write a brief Markdown email body (no subject line). Format:
1. A one-paragraph executive summary of the week's themes (3-4 sentences max)
2. A numbered list with each article title (linked) and a single-sentence technical takeaway
3. A closing line pointing readers to the full dashboard

Keep it dense, technical, and developer-focused. No hype, no financial news."""

    response = client.chat.completions.create(
        model="google/gemma-4-31b-it:free",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


def _send_email(to: str, subject: str, html_body: str) -> bool:
    """Send a single email via Resend. Returns True on success."""
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping email to %s", to)
        return False

    try:
        res = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": f"AI Intelligence <{os.environ.get('RESEND_FROM_EMAIL', 'brief@your-domain.com')}>",
                "to": [to],
                "subject": subject,
                "html": html_body,
            },
            timeout=10.0,
        )
        if res.status_code in (200, 201):
            return True
        logger.error("Resend error %d for %s: %s", res.status_code, to, res.text[:200])
        return False
    except httpx.HTTPError as exc:
        logger.error("Resend HTTP error for %s: %s", to, exc)
        return False


def _markdown_to_html(md: str) -> str:
    """Minimal Markdown → HTML for email: links, bold, paragraphs. Sanitised via bleach."""
    import re
    # Links: [text](url)
    md = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', md)
    # Bold: **text**
    md = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', md)
    # Paragraphs / line breaks
    paragraphs = [f'<p>{p.strip()}</p>' for p in md.split('\n\n') if p.strip()]
    raw_html = '\n'.join(paragraphs)
    # Sanitise to prevent XSS from LLM output
    return bleach.clean(
        raw_html,
        tags=['p', 'a', 'strong', 'em', 'br'],
        attributes={'a': ['href']},
        protocols=['https', 'http'],
    )


def _unsubscribe_token(user_id: str) -> str:
    """Generate an HMAC-SHA256 token for safe unsubscribe links (no raw user_id in URL)."""
    secret = os.environ.get("HMAC_SECRET", "change-me-in-production")
    return hmac.new(secret.encode(), user_id.encode(), hashlib.sha256).hexdigest()


def send_weekly_brief() -> None:
    """
    Entry point called by APScheduler every Monday at 00:00 UTC.
    """
    week_of = datetime.now(timezone.utc).strftime("%B %d, %Y")
    logger.info("Weekly brief: starting for week of %s", week_of)

    articles = _fetch_top_articles()
    if not articles:
        logger.info("Weekly brief: no articles found this week, skipping")
        return

    try:
        digest_md = _generate_digest(articles, week_of)
    except Exception:
        logger.exception("Weekly brief: LLM generation failed")
        return

    # Fetch active subscribers
    db = get_supabase()
    res = (
        db.table("email_subscriptions")
        .select("user_id, email")
        .eq("active", True)
        .execute()
    )
    subscribers = res.data or []

    if len(subscribers) > RESEND_DAILY_CAP:
        logger.warning(
            "Weekly brief: %d subscribers exceeds Resend free cap of %d — sending to first %d only",
            len(subscribers), RESEND_DAILY_CAP, RESEND_DAILY_CAP,
        )
        subscribers = subscribers[:RESEND_DAILY_CAP]

    subject = f"AI Developer Intelligence Brief — Week of {week_of}"
    sent = 0

    for sub in subscribers:
        token = _unsubscribe_token(sub["user_id"])
        app_url = os.environ.get("APP_URL", "http://localhost:3000")
        unsub_link = f'{app_url}/api/unsubscribe?uid={sub["user_id"]}&token={token}'
        html = (
            '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;'
            'color:#e4e4e7;background:#09090b;padding:32px">'
            f'<h2 style="font-size:16px;font-weight:600;margin-bottom:16px">{bleach.clean(subject)}</h2>'
            + _markdown_to_html(digest_md)
            + f'<p style="margin-top:24px;font-size:11px;color:#71717a">'
            f'<a href="{unsub_link}" style="color:#71717a">Unsubscribe</a></p>'
            '</div>'
        )
        if _send_email(sub["email"], subject, html):
            sent += 1

    logger.info("Weekly brief: sent %d/%d emails", sent, len(subscribers))
