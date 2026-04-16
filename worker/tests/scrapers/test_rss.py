"""
Unit tests for the RSS scraper.
These tests mock HTTP calls — no network access needed.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from worker.scrapers.rss import fetch_rss, _strip_html


class TestStripHtml:
    def test_removes_tags(self):
        assert _strip_html("<p>Hello <b>world</b></p>") == "Hello world"

    def test_handles_empty_string(self):
        assert _strip_html("") == ""

    def test_strips_script_tags(self):
        assert _strip_html('<script>alert("xss")</script>safe') == 'alert("xss")safe'


class TestFetchRss:
    @pytest.mark.asyncio
    async def test_returns_empty_on_http_error(self):
        """Scraper should return empty list on HTTP failure, not raise."""
        import httpx
        with patch("worker.scrapers.rss.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.HTTPError("timeout"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await fetch_rss("http://example.com/feed.xml", "test")
            assert result == []

    @pytest.mark.asyncio
    async def test_returns_empty_on_oversized_response(self):
        """Scraper should skip feeds exceeding MAX_RSS_RESPONSE_BYTES."""
        with patch("worker.scrapers.rss.httpx.AsyncClient") as MockClient:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = b"x" * (3 * 1024 * 1024)  # 3MB > 2MB limit
            mock_response.text = ""

            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await fetch_rss("http://example.com/feed.xml", "test")
            assert result == []

    @pytest.mark.asyncio
    async def test_parses_valid_rss(self):
        """Scraper should parse a minimal valid RSS feed."""
        rss_xml = """<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Article</title>
              <link>http://example.com/article-1</link>
              <description>This is a test article about AI.</description>
            </item>
          </channel>
        </rss>"""

        with patch("worker.scrapers.rss.httpx.AsyncClient") as MockClient:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.content = rss_xml.encode()
            mock_response.text = rss_xml

            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await fetch_rss("http://example.com/feed.xml", "test")
            assert len(result) == 1
            assert result[0]["title"] == "Test Article"
            assert result[0]["source_name"] == "test"
