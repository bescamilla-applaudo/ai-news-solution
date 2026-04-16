FROM python:3.11-slim

WORKDIR /app

# Install system deps for psycopg2 + httpx
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Copy worker source
COPY . .

# Run as non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1000 worker
USER worker

# Railway injects PORT but the worker does NOT expose an HTTP port.
# Celery is started directly without an HTTP server.
CMD ["python", "-m", "worker.main"]
