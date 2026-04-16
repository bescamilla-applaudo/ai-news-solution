"""
Unit tests for the Hacker News scraper.
All HTTP calls are mocked — no network access needed.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from worker.scrapers.hn import fetch_hn, _is_relevant


class TestIsRelevant:
    def test_matches_llm_keyword(self):
        assert _is_relevant("Building an LLM-powered chatbot") is True

    def test_matches_case_insensitive(self):
        assert _is_relevant("New OPENAI API release today") is True

    def test_rejects_unrelated(self):
        assert _is_relevant("Best hiking trails in Colorado") is False

    def test_matches_rag_keyword(self):
        assert _is_relevant("Implementing RAG with pgvector") is True

    def test_matches_agent_keyword(self):
        assert _is_relevant("Building agentic workflows with LangGraph") is True


class TestFetchHn:
    @pytest.mark.asyncio
    async def test_returns_empty_on_http_error(self):
        """Scraper should return empty list on API failure."""
        import httpx
        with patch("worker.scrapers.hn.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.HTTPError("timeout"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await fetch_hn()
            assert result == []
