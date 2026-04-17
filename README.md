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

- **LLM Noise Filter** — 7-node agentic pipeline classifies, scores, and summarizes every article
- **Semantic Search** — Cmd+K search powered by local sentence-transformers (384-dim embeddings) + pgvector
- **Zero-cost LLM** — All inference via OpenRouter free-tier models with automatic model rotation ($0)
- **Local embeddings** — sentence-transformers/all-MiniLM-L6-v2 runs locally, no API key needed
- **Impact scoring** — Articles ranked 1–10 on developer workflow impact and technical depth
- **Implementation guides** — AI-generated step-by-step implementation with validated code snippets
- **Technology watchlist** — Follow specific technologies (LangGraph, RAG, Claude, etc.)
- **Email digest** — Weekly intelligence brief with subscribe/unsubscribe via HMAC-secured endpoints
- **Error tracking** — Sentry integration for both Next.js frontend and Python worker
- **Structured logging** — JSON logs in production via structlog, colored console in development
- **ARIA accessibility** — Roles, labels, and landmarks on all interactive components
- **Rate limiting** — In-memory sliding-window rate limiter on all API routes
- **Daily token cap** — Configurable daily LLM usage budget to prevent cost overruns

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2 (App Router) · React 19 · Tailwind CSS v4 · Shadcn/UI |
| State | TanStack React Query v5 (infinite scroll, optimistic updates) |
| Backend | Python 3.11 · LangGraph · Celery · APScheduler |
| LLM | OpenRouter (Gemma 4 31B · Nemotron 120B · GPT-OSS 120B) — **$0** |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 — **local, $0** |
| Database | Supabase (PostgreSQL 15 + pgvector) |
| Queue | Redis 7 (Docker) |
| Testing | Vitest + Testing Library (65 tests) · Pytest (27 tests) · Playwright E2E (7 tests) |
| CI/CD | GitHub Actions (4 jobs) |

---

## Prerequisites

| Tool | Version | Installation |
|------|---------|-------------|
| Node.js | 22+ | `nvm install 22` |
| pnpm | 10+ | `npm install -g pnpm` |
| Python | 3.11+ | Pre-installed or `pyenv install 3.11` |
| Docker | 24+ | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| Supabase CLI | 2+ | `npm install -g supabase` |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/bescamilla-applaudo/ai-news-solution.git
cd ai-news-solution

# Frontend dependencies
pnpm install

# Python worker dependencies
cd worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 2. Configure environment

```bash
# Frontend — set Supabase keys (from `supabase start` output)
cp .env.local.example .env.local

# Worker — set OpenRouter API key
cp worker/.env.example worker/.env
```

Get a free OpenRouter API key at [openrouter.ai/keys](https://openrouter.ai/keys) (no credit card required).

### 3. Start infrastructure

```bash
# Terminal 1 — Supabase + Redis (auto-excludes non-essential services)
bash setup-docker.sh
```

Wait for `All services are running.` (~30s). Copy the `service_role` key from the Supabase output into both `.env.local` and `worker/.env`.

### 4. Start the application

```bash
# Terminal 2 — Next.js frontend
pnpm dev

# Terminal 3 — Embedding server (semantic search)
source worker/.venv/bin/activate && python worker/embed_server.py

# Terminal 4 — Celery worker (LangGraph pipeline, needs OPENROUTER_API_KEY)
source worker/.venv/bin/activate && celery -A worker.celery_app.app worker --loglevel=info

# Terminal 5 — APScheduler (scraper cron jobs)
source worker/.venv/bin/activate && python worker/main.py
```

Open **http://localhost:3000** — no login required.

> **Minimal mode:** Terminals 1–3 are sufficient to browse existing articles and use semantic search. Terminals 4–5 are only needed for ingesting new articles (requires `OPENROUTER_API_KEY`).

### Alternative: Docker Compose

```bash
# Start Supabase (must run first)
supabase start --exclude edge-runtime,studio,mailpit,logflare,vector

# Then start all services (Redis, embed-server, worker, frontend)
docker compose up --build
```

> `.dockerignore` files keep the build context small (~18 KB). Rebuilds take ~10 seconds. See [RUNBOOK.md](RUNBOOK.md) for detailed startup/shutdown instructions.

---

## Project Structure

```
app/                          # Next.js App Router
├── api/                      #   REST API endpoints (news, search, watchlist, article)
│   ├── news/route.ts         #     Paginated feed with tag filtering
│   ├── search/route.ts       #     Semantic search via pgvector
│   ├── watchlist/route.ts    #     Watchlist CRUD (POST/DELETE)
│   ├── tags/route.ts         #     Dynamic tags list
│   ├── email-subscribe/     #     Email subscription (POST/GET)
│   │   └── route.ts
│   ├── unsubscribe/         #     HMAC-validated unsubscribe (GET)
│   │   └── route.ts
│   ├── article/[id]/         #     Article detail + related articles
│   │   └── related/route.ts
│   └── admin/usage/route.ts  #     LLM token usage dashboard
├── article/[id]/page.tsx     #   Article detail view
├── search/page.tsx           #   Full search page
├── watchlist/page.tsx        #   Tag watchlist management
└── admin/usage/page.tsx      #   Token usage analytics

components/                   # React UI components
├── article-card.tsx          #   Article card with score bars
├── news-feed.tsx             #   Infinite scroll feed + tag filters
├── watchlist-manager.tsx     #   Optimistic toggle watchlist
├── command-palette.tsx       #   Cmd+K semantic search
├── email-subscribe.tsx       #   Weekly brief email subscription
└── ui/                       #   Shadcn/UI primitives

lib/                          # Shared utilities
├── supabase.ts               #   Server-side Supabase client (singleton)
├── database.types.ts         #   TypeScript DB types
└── utils.ts                  #   Helpers (cn, guards)

worker/                       # Python agentic pipeline
├── pipeline/graph.py         #   LangGraph 7-node directed graph
├── scrapers/                 #   RSS, Arxiv, HN, DeepMind scrapers
│   ├── rss.py                #     Generic RSS with bleach + defusedxml
│   ├── arxiv.py              #     Arxiv API (cs.AI, cs.CL)
│   ├── hn.py                 #     Hacker News Firebase API
│   └── deepmind.py           #     Google DeepMind blog
├── tasks/                    #   Celery tasks
│   ├── process_article.py    #     Single article processing
│   └── weekly_brief.py       #     Weekly email digest (Resend)
├── embed_server.py           #   Local embedding HTTP server (port 8001)
├── logging_config.py         #   Structured logging (structlog, JSON/dev)
├── main.py                   #   APScheduler entry point + Sentry init
├── celery_app.py             #   Celery configuration
└── db.py                     #   Supabase client (Python)

supabase/migrations/          # SQL migrations
├── 0001_initial_schema.sql   #   Tables, indexes, RLS policies
├── 0002_seed_articles.sql    #   10 seed articles for UI validation
├── 0003_embeddings_384.sql   #   Migrate to 384-dim embeddings
├── 0004_data_retention.sql   #   Cleanup/archive RPC functions
└── 0005_dynamic_tags.sql     #   Additional seed tags for LLM dynamic tagging

docker-compose.yml            # Full-stack local environment (one command)
Dockerfile.frontend           # Next.js dev container (node:22-slim, pnpm)
.dockerignore                 # Excludes node_modules, .venv, .next from builds
worker/.dockerignore          # Excludes .venv, __pycache__, tests from worker builds

__tests__/                    # Frontend tests (Vitest)
├── api/                      #   API route tests (33 tests)
├── components/               #   Component tests (25 tests)
├── lib/                      #   Infrastructure tests (7 tests)
└── setup.ts                  #   Test setup (jsdom + jest-dom)

e2e/                          # End-to-end tests (Playwright)
└── navigation.spec.ts        #   Page navigation flows

sentry.client.config.ts       # Sentry client-side init
sentry.server.config.ts       # Sentry server-side init
sentry.edge.config.ts         # Sentry edge runtime init

.github/workflows/ci.yml      # CI: typecheck, lint, vitest, pytest, docker
```

---

## Testing

The project has **96 automated tests** across three layers:

```bash
# Frontend — 65 tests (API routes + components + infrastructure)
pnpm test

# Worker — 27 tests (scrapers, embed server, pipeline, daily cap)
cd worker && source .venv/bin/activate
pytest tests/ -v

# E2E — Playwright (requires running app)
pnpm test:e2e
```

| Suite | Tests | What it covers |
|-------|-------|---------------|
| Vitest — API routes | 33 | `/api/news`, `/api/search`, `/api/watchlist`, `/api/tags`, `/api/unsubscribe`, `/api/email-subscribe` |
| Vitest — Components | 25 | `ArticleCard` (10), `WatchlistManager` (8), `NewsFeed` (7) — render, interaction, error states |
| Vitest — Infrastructure | 7 | Rate limiter sliding window, IP extraction, key isolation |
| Pytest — Scrapers | 14 | RSS parsing, HTML sanitization, HTTP error handling, Arxiv/HN mocks |
| Pytest — Embed server | 5 | Health endpoint, embedding generation, error cases |
| Pytest — Pipeline | 3 | Categorizer noise filter accuracy (≥95% on 20 fixtures) |
| Pytest — Daily cap | 5 | Token cap enforcement, null handling, DB queries |
| Playwright — E2E | 7 | Home (3), Search (2), Article detail (1), Watchlist (1) |

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical design:
- System overview with Mermaid diagrams
- Database schema (6 tables, pgvector indexing)
- LangGraph 7-node pipeline topology
- Security model (CSP, HMAC, deployment guards, input sanitization)
- OpenRouter ModelPool rotation (9 free models across 3 pools)
- Cost analysis ($0 for local development)

---

## Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Project overview, quick start, and structure |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture, schema, security model |
| [GUIDE.md](GUIDE.md) | Comprehensive technical guide (17 sections) for presentations |
| [RUNBOOK.md](RUNBOOK.md) | Step-by-step startup/shutdown instructions |
| [IMPROVEMENTS.md](IMPROVEMENTS.md) | Bug fixes, improvement backlog, and scorecard |
| [KNOWN-ISSUES.md](KNOWN-ISSUES.md) | Known issues, pending items, and future roadmap |

---

## Author

**Bryan Escamilla** — Applaudo Studios

---

## License

Private — Applaudo Studios. All rights reserved.
