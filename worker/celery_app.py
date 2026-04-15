"""
Celery application factory.
Broker and backend are configured via CELERY_BROKER_URL env var.
Local dev:   redis://localhost:6379/0
Production:  rediss://:<token>@<host>:6379  (Upstash TLS)
"""
import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")

app = Celery(
    "ai_news",
    broker=BROKER_URL,
    backend=BROKER_URL,
    include=["worker.tasks.process_article"],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_concurrency=4,         # 4 parallel LangGraph pipeline runs
    task_acks_late=True,          # ack only after task completes (safer retries)
    worker_prefetch_multiplier=1, # one task at a time per worker process
)
