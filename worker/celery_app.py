"""
Celery application factory.
Broker and backend: Upstash Redis (rediss:// TLS URL).
"""
import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

UPSTASH_REDIS_URL = os.environ["UPSTASH_REDIS_URL"]

app = Celery(
    "ai_news",
    broker=UPSTASH_REDIS_URL,
    backend=UPSTASH_REDIS_URL,
    include=["worker.tasks.process_article"],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_concurrency=4,        # 4 parallel LangGraph pipeline runs
    task_acks_late=True,         # ack only after task completes (safer retries)
    worker_prefetch_multiplier=1, # one task at a time per worker process
)
