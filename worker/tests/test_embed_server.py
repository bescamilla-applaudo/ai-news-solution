"""
Unit tests for the embed server healthcheck and embed endpoint.
Tests the handler logic without starting a real HTTP server.
"""
from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
import numpy as np

from worker.embed_server import EmbedHandler, get_model


class FakeRFile(BytesIO):
    """Simulate the socket rfile for BaseHTTPRequestHandler."""
    pass


def make_handler(method: str, path: str, body: bytes = b"") -> EmbedHandler:
    """Create an EmbedHandler with mocked socket/request data."""
    handler = EmbedHandler.__new__(EmbedHandler)
    handler.path = path
    handler.command = method
    handler.headers = {"Content-Length": str(len(body)), "Content-Type": "application/json"}
    handler.rfile = FakeRFile(body)
    handler.wfile = BytesIO()

    # Mock response methods
    handler.send_response = MagicMock()
    handler.send_header = MagicMock()
    handler.end_headers = MagicMock()

    return handler


class TestHealthEndpoint:
    def test_health_returns_200_when_model_loads(self):
        handler = make_handler("GET", "/health")

        mock_model = MagicMock()
        mock_model.encode.return_value = np.zeros(384)

        with patch("worker.embed_server.get_model", return_value=mock_model):
            handler.do_GET()

        handler.send_response.assert_called_with(200)
        output = handler.wfile.getvalue()
        assert b'"ok":true' in output or b'"ok": true' in output

    def test_health_returns_503_when_model_fails(self):
        handler = make_handler("GET", "/health")

        with patch("worker.embed_server.get_model", side_effect=RuntimeError("model broken")):
            handler.do_GET()

        handler.send_response.assert_called_with(503)

    def test_404_on_unknown_get_path(self):
        handler = make_handler("GET", "/unknown")
        handler.do_GET()
        handler.send_response.assert_called_with(404)


class TestEmbedEndpoint:
    def test_embed_returns_embedding(self):
        body = json.dumps({"text": "hello world"}).encode()
        handler = make_handler("POST", "/embed", body)

        mock_model = MagicMock()
        mock_model.encode.return_value = MagicMock(tolist=lambda: [0.1] * 384)

        with patch("worker.embed_server.get_model", return_value=mock_model):
            handler.do_POST()

        handler.send_response.assert_called_with(200)
        output = handler.wfile.getvalue()
        data = json.loads(output)
        assert "embedding" in data
        assert len(data["embedding"]) == 384

    def test_embed_404_on_wrong_path(self):
        handler = make_handler("POST", "/wrong")
        handler.do_POST()
        handler.send_response.assert_called_with(404)
