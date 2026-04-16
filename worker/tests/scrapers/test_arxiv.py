"""
Unit tests for the Arxiv scraper.
All HTTP calls are mocked — no network access needed.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from worker.scrapers.arxiv import fetch_arxiv


SAMPLE_ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2404.12345v1</id>
    <title>Attention Is Still All You Need</title>
    <summary>We revisit the transformer architecture...</summary>
    <published>2024-04-15T00:00:00Z</published>
  </entry>
</feed>"""


class TestFetchArxiv:
    @pytest.mark.asyncio
    async def test_returns_empty_on_http_error(self):
        import httpx
        with patch("worker.scrapers.arxiv.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.HTTPError("timeout"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            with patch("worker.scrapers.arxiv.asyncio.sleep", new_callable=AsyncMock):
                result = await fetch_arxiv()
            assert result == []

    @pytest.mark.asyncio
    async def test_parses_valid_atom_feed(self):
        with patch("worker.scrapers.arxiv.httpx.AsyncClient") as MockClient:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.text = SAMPLE_ATOM

            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            with patch("worker.scrapers.arxiv.asyncio.sleep", new_callable=AsyncMock):
                result = await fetch_arxiv()

            assert len(result) == 1
            assert result[0]["title"] == "Attention Is Still All You Need"
            assert result[0]["source_name"] == "arxiv"
            assert "2404.12345" in result[0]["source_url"]
