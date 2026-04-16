# AI News Intelligence Platform

> **An AI-powered news aggregation system that delivers purely technical AI news to developers — filtering out all financial, political, and hype-based noise.**

Built with Next.js 16, Supabase, LangGraph, and OpenRouter free-tier LLMs.  
**Total cost: $0/month for local development.**

---

## What It Does

The platform scrapes 5 sources (HuggingFace, OpenAI, DeepMind, Arxiv, Hacker News), runs each article through an agentic LLM pipeline, and presents only high-signal technical content in a developer-first dashboard.

### Pipeline

```
RSS/API Sources → Scraper (APScheduler) → Celery Queue → LangGraph Pipeline
  → Noise Filter (Gemma 4 31B) → Evaluator + Summarizer (Nemotron 120B)
  → Embedder (local MiniLM) → Supabase (PostgreSQL + pgvector)
  → Next.js Dashboard
```

### Key Features

- **LLM Noise Filter** — 3-node agentic pipeline classifies, scores, and summarizes every article
- **Semantic Search** — Cmd+K search powered by local sentence-transformers (384-dim embeddings) + pgvector
- **Zero-cost LLM** — All inference via OpenRouter free-tier models ($0)
- **Local embeddings** — sentence-transformers/all-MiniLM-L6-v2 runs locally, no API key needed
- **Impact scoring** — Articles ranked 1–10 on developer workflow impact and technical depth
- **Implementation guides** — AI-generated step-by-step implementation with code snippets
- **Technology watchlist** — Follow specific technologies (LangGraph, RAG, Claude, etc.)
- **Weekly email digest** — Auto-generated intelligence brief via Resend (optional)
- **Data retention** — Automated cleanup of old/discarded articles

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Shadcn/UI |
| State | TanStack React Query v5 |
| Backend | Python 3.11 · LangGraph · Celery · APScheduler |
| LLM | OpenRouter (Gemma 4 31B + Nemotron 120B) — **$0** |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 — **local, $0** |
| Database | Supabase (PostgreSQL 15 + pgvector) |
| Queue | Redis (Docker) |
| CI/CD | GitHub Actions |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/bescamilla-applaudo/ai-news-solution.git
cd ai-news-solution
pnpm install
cd worker && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

### 2. Configure environment

```bash
# Frontend
cp .env.local.example .env.local   # Set SUPABASE keys

# Worker
cp worker/.env.example worker/.env  # Set OPENROUTER_API_KEY
```

Get a free OpenRouter API key at [openrouter.ai/keys](https://openrouter.ai/keys).

### 3. Start (5 terminals)

```bash
bash setup-docker.sh                                            # Terminal 1: Supabase + Redis
pnpm dev                                                         # Terminal 2: Next.js
source worker/.venv/bin/activate && python worker/embed_server.py  # Terminal 3: Embed server
source worker/.venv/bin/activate && celery -A worker.celery_app.app worker --loglevel=info  # Terminal 4: Celery
source worker/.venv/bin/activate && python worker/main.py          # Terminal 5: Scheduler
```

Open **http://localhost:3000** — no login required.

> See [RUNBOOK.md](RUNBOOK.md) for detailed startup/shutdown instructions.

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical design including:
- System overview and data flow diagrams
- Database schema and RLS policies
- LangGraph pipeline topology
- Security model
- Deployment topology

---

## Project Structure

```
app/                    # Next.js App Router (pages + API routes)
├── api/                # REST API endpoints
├── article/[id]/       # Article detail page
├── search/             # Semantic search page
├── watchlist/           # Technology watchlist page
└── admin/usage/        # LLM usage dashboard

components/             # React components (Shadcn/UI)
lib/                    # Shared utilities (Supabase client, types, guards)
__tests__/              # Frontend API route tests (vitest)

worker/                 # Python agentic pipeline
├── pipeline/           # LangGraph graph definition
├── scrapers/           # RSS, Arxiv, HN, DeepMind scrapers
├── tasks/              # Celery tasks (process_article, weekly_brief, cleanup_db)
├── tests/              # Scraper, embed server, and pipeline accuracy tests
├── embed_server.py     # Local embedding HTTP server
├── main.py             # APScheduler entry point
└── celery_app.py       # Celery configuration

supabase/migrations/    # SQL migrations (schema + seed data + retention)
.github/                # CI/CD workflows (4 jobs) + agent definitions
```

---

## Quality Assurance

```bash
# Frontend
pnpm typecheck          # TypeScript type checking (zero errors)
pnpm lint               # ESLint (zero warnings)
pnpm test               # vitest — 13 API route tests

# Worker (no API key needed)
cd worker && source .venv/bin/activate
pytest tests/scrapers/ tests/test_embed_server.py -v  # 19 unit tests

# Pipeline accuracy (requires OPENROUTER_API_KEY)
set -a && source .env && set +a
pytest tests/pipeline/ -v   # 3 tests, 20 LLM calls
```

---

## Author

**Bryan Escamilla** — Applaudo Studios

---

## License

Private — Applaudo Studios. All rights reserved.
