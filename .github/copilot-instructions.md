# AI News Intelligence Platform — Copilot Instructions

## Project Overview

Single-user, zero-cost AI news aggregation platform. Filters technical AI content (LLMs, Agents, Dev Tools, Multi-Agent Architectures) from noise (financial, political, hype). Two-service architecture: Next.js frontend + Python worker pipeline.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 16.x |
| UI | React 19, Shadcn/UI, Tailwind CSS v4 | — |
| Database | Supabase (PostgreSQL + pgvector) | — |
| Pipeline | LangGraph (7-node directed graph) | — |
| LLM | OpenRouter (free-tier models via ModelPool) | — |
| Embeddings | Local sentence-transformers (all-MiniLM-L6-v2, 384 dims) | — |
| Worker | Python 3.11, Celery + Redis, APScheduler | — |
| Testing | Vitest (48), Pytest (27), Playwright E2E (7) = 82 total | — |

## Branching — Git-Flow

We use **git-flow**. All work happens on feature branches off `develop`. Never commit directly to `main` or `develop`.

```
main        ← production-ready, tagged releases only
develop     ← integration branch, all features merge here
feature/*   ← new features (branch from develop)
bugfix/*    ← bug fixes (branch from develop)
hotfix/*    ← urgent production fixes (branch from main)
release/*   ← release preparation (branch from develop)
```

**Rules:**
- Feature branches: `feature/<short-description>` (e.g., `feature/rate-limiting`)
- Always create a PR to merge into `develop`. Never push directly.
- Squash merge feature branches. Merge commits for releases into `main`.
- Tag releases on `main`: `v0.2.0`, `v0.3.0`, etc.
- Delete branches after merge.

## Code Quality Standards

### TypeScript (Frontend)
- Strict mode (`"strict": true` in tsconfig)
- Zero `any` types — use proper interfaces or `unknown`
- All API routes must validate inputs at the boundary (query params, body)
- Use `@/*` path aliases (configured in tsconfig)
- Server Components by default; `"use client"` only when needed
- React Query for all data fetching in client components
- Shadcn/UI components in `components/ui/`; custom components in `components/`

### Python (Worker)
- Python 3.11+ with type hints on all function signatures
- `bleach` for HTML sanitization, `defusedxml` for XML parsing
- All scrapers must handle HTTP errors, timeouts, and oversized responses
- LLM calls go through `ModelPool` for automatic rotation on rate limits
- Environment variables via `python-dotenv`; never hardcode secrets

### Both Languages
- No `console.log` / `print` in production code (use structured logging)
- Guard against missing env vars at startup, not at call time
- Prefer early returns over nested conditionals

## Testing Requirements

Every PR must pass all existing tests. New features require tests.

```bash
# Frontend — must pass before merge
pnpm typecheck && pnpm lint && pnpm test

# Worker — must pass before merge
cd worker && pytest tests/ -v --ignore=tests/pipeline/test_categorizer.py

# E2E — run locally before submitting navigation-related changes
pnpm test:e2e
```

**Test conventions:**
- Frontend tests: `__tests__/api/` and `__tests__/components/` using Vitest + Testing Library
- Worker tests: `worker/tests/` using Pytest with mocked HTTP responses
- E2E tests: `e2e/` using Playwright
- Mock external services (Supabase, OpenRouter, HTTP) — never make real API calls in unit tests
- Test file naming: `<module>.test.ts` (TS) or `test_<module>.py` (Python)

## Security

- Supabase RLS policies on all tables — verify in migrations
- Sanitize all external input from scrapers (`bleach.clean`, `defusedxml`)
- CSP headers configured in `next.config.ts`
- No API keys in client-side code — server-only via env vars
- HMAC-SHA256 for unsubscribe tokens in weekly briefs
- `Cache-Control: no-store` on user-specific endpoints (watchlist)

## Architecture References

Before implementing features, read:
- `ARCHITECTURE.md` — system design, database schema, data flow
- `RUNBOOK.md` — how to run locally (Docker Compose or manual)
- `GUIDE.md` — detailed walkthrough of every component (in Spanish)

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main`/`develop` and PRs to `main`:
- **frontend**: typecheck → lint → vitest (48 tests)
- **pipeline**: pytest scrapers + embed server + daily cap (24 tests)
- **pipeline-accuracy**: categorizer accuracy tests (3 tests, main only, requires API keys)
- **docker**: validates worker Dockerfile builds
