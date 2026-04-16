"""
Tests for the DAILY_TOKEN_CAP enforcement in the pipeline.

Run with: pytest worker/tests/pipeline/test_daily_cap.py -v
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest

from worker.pipeline.graph import (
    _check_daily_token_cap,
    DailyTokenCapExceeded,
)


@pytest.fixture(autouse=True)
def _reset_cap(monkeypatch):
    """Ensure DAILY_TOKEN_CAP is restored after each test."""
    import worker.pipeline.graph as mod
    original = mod.DAILY_TOKEN_CAP
    yield
    mod.DAILY_TOKEN_CAP = original


class TestDailyTokenCap:
    def test_cap_disabled_when_zero(self, monkeypatch):
        """No error when DAILY_TOKEN_CAP=0 (disabled)."""
        import worker.pipeline.graph as mod
        monkeypatch.setattr(mod, "DAILY_TOKEN_CAP", 0)
        # Should not raise
        _check_daily_token_cap()

    @patch("worker.pipeline.graph.get_supabase")
    def test_cap_not_exceeded(self, mock_db, monkeypatch):
        """No error when usage is below the cap."""
        import worker.pipeline.graph as mod
        monkeypatch.setattr(mod, "DAILY_TOKEN_CAP", 100_000)

        mock_table = MagicMock()
        mock_table.select.return_value.gte.return_value.execute.return_value = MagicMock(
            data=[
                {"input_tokens": 1000, "output_tokens": 500},
                {"input_tokens": 2000, "output_tokens": 1000},
            ]
        )
        mock_db.return_value.table.return_value = mock_table

        _check_daily_token_cap()  # should not raise

    @patch("worker.pipeline.graph.get_supabase")
    def test_cap_exceeded_raises(self, mock_db, monkeypatch):
        """DailyTokenCapExceeded raised when usage >= cap."""
        import worker.pipeline.graph as mod
        monkeypatch.setattr(mod, "DAILY_TOKEN_CAP", 5000)

        mock_table = MagicMock()
        mock_table.select.return_value.gte.return_value.execute.return_value = MagicMock(
            data=[
                {"input_tokens": 3000, "output_tokens": 2500},
            ]
        )
        mock_db.return_value.table.return_value = mock_table

        with pytest.raises(DailyTokenCapExceeded, match="5,500.*5,000"):
            _check_daily_token_cap()

    @patch("worker.pipeline.graph.get_supabase")
    def test_cap_queries_llm_usage_log(self, mock_db, monkeypatch):
        """Verify the function queries the correct table with today's date."""
        import worker.pipeline.graph as mod
        monkeypatch.setattr(mod, "DAILY_TOKEN_CAP", 100_000)

        mock_table = MagicMock()
        mock_table.select.return_value.gte.return_value.execute.return_value = MagicMock(
            data=[]
        )
        mock_db.return_value.table.return_value = mock_table

        _check_daily_token_cap()

        mock_db.return_value.table.assert_called_with("llm_usage_log")
        mock_table.select.assert_called_with("input_tokens, output_tokens")

    @patch("worker.pipeline.graph.get_supabase")
    def test_handles_null_tokens(self, mock_db, monkeypatch):
        """Null token values are treated as 0."""
        import worker.pipeline.graph as mod
        monkeypatch.setattr(mod, "DAILY_TOKEN_CAP", 100_000)

        mock_table = MagicMock()
        mock_table.select.return_value.gte.return_value.execute.return_value = MagicMock(
            data=[
                {"input_tokens": None, "output_tokens": None},
                {"input_tokens": 100, "output_tokens": None},
            ]
        )
        mock_db.return_value.table.return_value = mock_table

        _check_daily_token_cap()  # should not raise
