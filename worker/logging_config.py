"""
Structured logging configuration for the worker.

In production (LOG_FORMAT=json), outputs newline-delimited JSON to stdout —
compatible with ELK, Datadog, CloudWatch, Railway, and any log aggregator.

In development (default), outputs colored, human-readable logs.

Usage:
    from worker.logging_config import setup_logging
    setup_logging()  # call once at startup (worker/main.py)

All existing `logging.getLogger(__name__)` calls continue to work unchanged.
structlog wraps stdlib logging, so no code changes needed in scrapers/pipeline.
"""
from __future__ import annotations

import logging
import os
import sys

import structlog


def setup_logging() -> None:
    """Configure structlog + stdlib logging for the entire worker process."""
    log_format = os.environ.get("LOG_FORMAT", "dev").lower()
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    is_json = log_format == "json"

    # Shared processors for both structlog and stdlib
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if is_json:
        # Production: JSON to stdout
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        # Development: colored, padded console output
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stderr.isatty())

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure stdlib root logger to use structlog formatter
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level, logging.INFO))

    # Silence noisy third-party loggers
    for noisy in ("httpx", "httpcore", "urllib3", "celery.worker.strategy"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
