"""
Minimal HTTP server exposing local sentence-transformers embeddings.
Used by the Next.js /api/search route to generate query embeddings.

Start: python worker/embed_server.py
Port:  8001 (WORKER_EMBED_URL=http://localhost:8001)
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Embedding model loaded (384 dims)")
    return _model


class EmbedHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # silence default access log
        pass

    def do_POST(self):
        if self.path != "/embed":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        text = body.get("text", "")[:512]

        try:
            model = get_model()
            embedding = model.encode(text, normalize_embeddings=True).tolist()
            response = json.dumps({"embedding": embedding}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        except Exception as exc:
            logger.error("Embed failed: %s", exc)
            self.send_response(500)
            self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("EMBED_PORT", "8001"))
    server = HTTPServer(("0.0.0.0", port), EmbedHandler)
    logger.info("Embed server listening on port %d", port)
    server.serve_forever()
