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

# Copy worker source into worker/ subdirectory to preserve the Python package structure.
# The build context is ./worker, so COPY . ./worker/ re-creates the worker package inside /app/.
COPY . ./worker/

# Run as non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1000 worker
USER worker

# Health check for embed server (only applies when running embed_server.py)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

# Railway injects PORT but the worker does NOT expose an HTTP port.
# Celery is started directly without an HTTP server.
CMD ["python", "-m", "worker.main"]
