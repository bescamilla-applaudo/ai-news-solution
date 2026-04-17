# Code Review Report — Full Audit

**Date:** 2026-04-17
**Scope:** Full audit — all source files across frontend and worker
**Branch:** `feature/docker-fixes`
**Files reviewed:** 42 (all `app/`, `components/`, `worker/`, `supabase/`, Docker, config)

---

## Summary

| Category | Checklist § | Status | Findings |
|----------|-------------|--------|----------|
| TypeScript (Frontend) | §1 | ⚠️ | 3 |
| Python (Worker) | §2 | ❌ | 1 |
| Security | §3 | ✅ | 0 |
| Design Patterns | §4 | ✅ | 0 |
| Testing | §5 | ✅ | 0 |
| Database | §6 | ✅ | 0 |
| Docker / DevOps | §7 | ⚠️ | 1 |
| Documentation | §8 | ⚠️ | 1 |

---

## Findings

### 🔴 Critical

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 1 | `worker/scrapers/arxiv.py` | L12, L65 | **XML bomb vulnerability.** Uses `xml.etree.ElementTree.fromstring()` for parsing Arxiv Atom XML. This is vulnerable to billion-laughs and other XML denial-of-service attacks. The checklist requires `defusedxml` for all XML/Atom parsing. `from xml.etree import ElementTree as ET` on L12, `root = ET.fromstring(xml_text)` on L65. | Replace with `from defusedxml import ElementTree as ET`. The `defusedxml` package is already in `requirements.txt` (used by rss.py). |

### 🟡 Warning

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 2 | `app/api/article/[id]/route.ts` | — | **Missing rate limiting.** This endpoint has no `checkRateLimit()` call unlike all other 7 API routes (news: 60/min, search: 10/min, tags: 30/min, watchlist: 30/min, email-subscribe: 5/min, unsubscribe: 10/min). Creates an inconsistency and potential scraping vector. | Add `checkRateLimit('article:${ip}', { max: 30, windowMs: 60_000 })`. |
| 3 | `app/api/article/[id]/related/route.ts` | — | **Missing rate limiting.** Same issue as above — no `checkRateLimit()` on the related articles endpoint. | Add `checkRateLimit('article-related:${ip}', { max: 30, windowMs: 60_000 })`. |
| 4 | All `app/api/**/*.ts` | (12 instances) | **`console.error()` used instead of structured logging.** Project standards mandate structured logging, yet all 9 API route files use `console.error()` for error logging (12 total calls). This breaks log aggregation and Sentry correlation. | Configure a frontend logger (Winston, Pino, or `@sentry/nextjs` `captureException`) and replace all 12 `console.error()` calls. |
| 5 | `worker/Dockerfile` | L27-28 | **Worker container inherits embed-server HEALTHCHECK.** The `HEALTHCHECK CMD curl -f http://localhost:8001/health` applies to the shared Dockerfile, but the `worker` compose service runs Celery (not embed-server). Docker will mark it as permanently unhealthy, making `docker ps` misleading. | Add `healthcheck: { disable: true }` to the `worker` service in `docker-compose.yml`, or override with a Celery-specific healthcheck. |

### 🔵 Info

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 6 | `ARCHITECTURE.md`, `README.md`, `GUIDE.md`, `RUNBOOK.md` | — | **Test counts out of sync.** Actual: 75 vitest, 27 pytest (24 excl. categorizer), 7 Playwright = 109 total. ARCHITECTURE.md says "65 vitest", "7 infrastructure". GUIDE.md says "96 total". The `rate-limit.test.ts` grew from 7 → 17 tests. | Update all 4 docs to: 75 vitest (33 API + 25 components + 17 infra), 27 pytest, 7 Playwright = 109 total. |

---

## Passing Items

### §1 TypeScript — Type Safety ✅

- [x] `strict: true` in tsconfig.json
- [x] No `any` types — all APIs use proper interfaces from `lib/database.types.ts`
- [x] API response types match `lib/database.types.ts`
- [x] No `@ts-ignore` or `@ts-expect-error` without justification

### §1 TypeScript — API Routes

| Endpoint | Validation | Clamping | String Limits | Cache-Control | requireSupabase | Rate Limit | Generic Errors |
|----------|-----------|----------|---------------|---------------|-----------------|------------|----------------|
| `/api/news` | ✅ | ✅ `Math.max(0, page)` | ✅ tag param | ✅ `s-maxage=60` | ✅ | ✅ 60/min | ✅ |
| `/api/search` | ✅ | N/A | ✅ 200 chars | ✅ `s-maxage=60` | ✅ | ✅ 10/min | ✅ |
| `/api/article/[id]` | ✅ | N/A | N/A | ✅ `s-maxage=300` | ✅ | ❌ **Missing** | ✅ |
| `/api/article/[id]/related` | ✅ | N/A | N/A | ✅ `s-maxage=300` | ✅ | ❌ **Missing** | ✅ |
| `/api/watchlist` | ✅ | N/A | N/A | ✅ `no-store` | ✅ | ✅ 30/min | ✅ |
| `/api/tags` | N/A | N/A | N/A | ✅ `s-maxage=300` | ✅ | ✅ 30/min | ✅ |
| `/api/email-subscribe` | ✅ regex | N/A | ✅ 254 chars | ✅ `no-store` | ✅ | ✅ 5/min | ✅ |
| `/api/unsubscribe` | ✅ length | N/A | ✅ 100/128 chars | N/A (HTML) | ✅ | ✅ 10/min | ✅ |
| `/api/admin/usage` | N/A | N/A | N/A | ✅ `no-store` | ✅ | N/A (admin) | ✅ |

### §1 TypeScript — React Components ✅

| Component | Server/Client | React Query | API-only | cn() | ARIA | No innerHTML | Loading/Error | AbortController |
|-----------|:------------:|:-----------:|:--------:|:----:|:----:|:------------:|:-------------:|:---------------:|
| `article-card.tsx` | Server ✅ | N/A | N/A | ✅ | ✅ progressbar | N/A | N/A | N/A |
| `code-block.tsx` | Server ✅ | N/A | N/A | N/A | N/A | ✅ hast-util | N/A | N/A |
| `command-palette.tsx` | Client ✅ | ✅ | ✅ | N/A | ✅ dialog/label | N/A | ✅ empty state | ✅ 300ms |
| `news-feed.tsx` | Client ✅ | ✅ infinite | ✅ | ✅ | ✅ role/label | N/A | ✅ skeletons | N/A |
| `watchlist-manager.tsx` | Client ✅ | N/A (fetch) | ✅ | N/A | ✅ aria-pressed | N/A | ✅ error | N/A |
| `query-provider.tsx` | Client ✅ | ✅ provider | N/A | N/A | N/A | N/A | N/A | N/A |

### §2 Python — Type Safety ✅

- [x] Type hints on all function signatures (params + return)
- [x] `PipelineState(TypedDict)` in `graph.py`
- [x] No `# type: ignore` without justification

### §2 Python — Pipeline ✅

- [x] All LLM calls go through `_openrouter_chat()` wrapper
- [x] `ModelPool` used: `CATEGORIZER_POOL`, `EVALUATOR_POOL`, `SUMMARIZER_POOL` (3 models each)
- [x] `_check_daily_token_cap()` called before every LLM request
- [x] `_parse_llm_json()` used for resilient JSON extraction
- [x] Token usage logged to `llm_usage_log`
- [x] Error node raises RuntimeError → caught by Celery retry (max 3×, exponential backoff)

### §2 Python — Scrapers

| Scraper | bleach | Timeout | Size Limit | defusedxml | Dedup |
|---------|:------:|:-------:|:----------:|:----------:|:-----:|
| `rss.py` | ✅ `clean(tags=[])` | ✅ 15s | ✅ 2 MB | ✅ feedparser + size limit | ✅ |
| `hn.py` | ✅ `clean(tags=[])` | ✅ 15s | N/A (JSON API) | N/A | ✅ |
| `arxiv.py` | ✅ `_strip()` | ✅ 30s | N/A | ❌ **Uses stdlib** | ✅ |
| `deepmind.py` | ✅ via rss.py | ✅ 15s | ✅ 2 MB | ✅ via rss.py | ✅ |

### §2 Python — General ✅

- [x] No `print()` in production code — uses `structlog` and `logging`
- [x] Env vars loaded via `python-dotenv`, checked at startup
- [x] No hardcoded secrets or API keys

### §3 Security ✅

- [x] **Broken Access Control**: RLS enabled on all 6 tables with appropriate policies
- [x] **Security Misconfiguration**: CSP, X-Frame-Options, X-Content-Type-Options in `next.config.ts`
- [x] **Insecure Deserialization**: LLM JSON parsed via `_parse_llm_json()`
- [x] `HMAC_SECRET` for unsubscribe token generation/validation
- [x] `crypto.timingSafeEqual` for HMAC comparison (prevents timing attacks)
- [x] Embed server and Redis bind to `127.0.0.1` only

### §4 Design Patterns ✅

- [x] Frontend and worker communicate only through the database (no RPC)
- [x] `OWNER_ID = 'owner'` hardcoded (single-user design)
- [x] Graceful degradation: embed server down → 503 on search, rest works
- [x] ModelPool rotation on rate limit
- [x] Shadcn/UI in `components/ui/`, custom in `components/`
- [x] `@/*` path aliases used
- [x] Early returns over nested conditionals
- [x] No `console.log` in components (only `console.error` in API routes — see Warning #4)

### §5 Testing ✅

- [x] API routes have vitest tests in `__tests__/api/`
- [x] Components have vitest tests in `__tests__/components/`
- [x] Scrapers have pytest tests in `worker/tests/scrapers/`
- [x] Pipeline has pytest tests in `worker/tests/pipeline/`
- [x] All external services mocked (Supabase, OpenRouter, HTTP)
- [x] Test naming follows `<module>.test.ts` / `test_<module>.py`

### §6 Database ✅

- [x] Sequential numbering: `0001_`, `0002_`, `0003_`
- [x] `IF NOT EXISTS` / `IF EXISTS` guards on CREATE/DROP
- [x] RLS enabled on every table
- [x] `vector(384)` matches `all-MiniLM-L6-v2`
- [x] Cosine distance `<=>` used in `match_articles` RPC

### §7 Docker & DevOps

- [x] Worker: `COPY . ./worker/` preserves package structure
- [x] Frontend: `.next/` created with correct ownership before `USER` switch
- [x] Both: non-root `USER` set before `CMD`
- [x] Worker: `HEALTHCHECK` instruction present (but see Warning #5)
- [x] `.dockerignore` excludes `node_modules/`, `.venv/`, `.next/`, `.env*`, tests
- [x] `host.docker.internal:host-gateway` in `extra_hosts`
- [x] Redis, embed-server, frontend bind to `127.0.0.1` only
- [x] Worker `env_file` → `./worker/.env`
- [x] `depends_on` with `condition: service_healthy` where applicable

### §8 Documentation

- [x] Dockerfile snippets in ARCHITECTURE.md §9 match actual files
- [x] New routes/components documented in ARCHITECTURE.md route map
- [x] Env vars documented in ARCHITECTURE.md §7
- [ ] Test counts out of sync across docs (see Info #6)

---

## Score

| Criterion | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Zero critical issues | 30% | 5 | 1 critical: arxiv.py XML bomb vulnerability |
| Pattern compliance | 20% | 8 | 2 routes missing rate limiting, console.error pattern |
| Security posture | 20% | 8 | Strong overall — CSP, RLS, HMAC, timing-safe. Penalized for arxiv XML. |
| Test coverage for changes | 15% | 10 | All areas covered, 109 tests total, mocks used correctly |
| Documentation sync | 15% | 7 | Test counts out of sync across 4 docs |

**Weighted score: 7.25/10**

Formula: `(5×0.30 + 8×0.20 + 8×0.20 + 10×0.15 + 7×0.15) = 1.50 + 1.60 + 1.60 + 1.50 + 1.05 = 7.25`

---

## Verdict

**❌ Changes requested** — 1 critical issue must be fixed before merge:

1. **P0 — Fix now:** Replace `xml.etree.ElementTree` with `defusedxml.ElementTree` in `worker/scrapers/arxiv.py` (L12, L65).
2. **P1 — Fix before merge:** Add `checkRateLimit()` to `app/api/article/[id]/route.ts` and `app/api/article/[id]/related/route.ts`.
3. **P1 — Fix before merge:** Replace 12 `console.error()` calls in API routes with a structured logger.
4. **P2 — Fix soon:** Disable inherited HEALTHCHECK on `worker` compose service.
5. **P2 — Fix soon:** Update test counts across ARCHITECTURE.md, README.md, GUIDE.md, RUNBOOK.md.
