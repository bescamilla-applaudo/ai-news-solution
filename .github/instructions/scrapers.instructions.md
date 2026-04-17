---
description: "Use when: creating or modifying Python scrapers, adding new data sources, or working on the news ingestion pipeline. Covers HTTP safety, sanitization, and testing patterns."
applyTo: "worker/scrapers/**/*.py"
---
# Scraper Standards

## HTTP Safety
- Set `timeout=10` on all HTTP requests.
- Reject responses larger than 2 MB (`response.headers.get('content-length')`).
- Handle `httpx.HTTPStatusError` and `httpx.RequestError` explicitly.
- Never follow redirects to unknown domains.

## Input Sanitization (MANDATORY)
- Use `bleach.clean(text, tags=[], strip=True)` on all HTML content.
- Use `defusedxml.ElementTree.fromstring()` instead of `xml.etree.ElementTree` for XML/Atom feeds.
- Strip control characters and normalize whitespace.

## Deduplication
- Check `external_id` (URL or unique identifier) before inserting.
- The pipeline handles dedup via Supabase upsert on `external_id`.

## Testing
- Every scraper must have pytest tests in `worker/tests/scrapers/`.
- Mock HTTP responses with `unittest.mock.patch` — never make real HTTP calls.
- Test: successful parse, HTTP error, oversized response, malformed input.
- Follow naming: `test_<scraper_name>.py`.

## Existing Patterns (reference)
- `worker/scrapers/rss.py` — Generic RSS with bleach + defusedxml, `_strip_html` helper.
- `worker/scrapers/hn.py` — Hacker News Firebase API, `_is_relevant` keyword filter.
- `worker/scrapers/arxiv.py` — Arxiv Atom API, defusedxml parsing.
- `worker/scrapers/deepmind.py` — HTML scraping with bleach sanitization.
