# Code Review Checklist

> For each item: mark **✅ Pass**, **❌ Fail** (record as finding), or **N/A** (skip).  
> The severity tag `[🔴]` `[🟡]` `[🔵]` after each item indicates the finding level when it fails.

---

## 1. TypeScript (Frontend)

### Type Safety
- [ ] `strict: true` enforced — no `any` types anywhere `[🟡]`
- [ ] Interfaces or `unknown` used instead of `any` `[🟡]`
- [ ] API response types match `lib/database.types.ts` `[🟡]`
- [ ] No `@ts-ignore` or `@ts-expect-error` without justification `[🔵]`

### API Routes (`app/api/**/*.ts`)
- [ ] Input validation at the boundary (query params, body) `[🔴]`
- [ ] Numeric params clamped (e.g., `Math.max(0, page)`) `[🟡]`
- [ ] String params length-limited (max 200 chars for search) `[🟡]`
- [ ] `Cache-Control` header set (`s-maxage` for public, `no-store` for private) `[🟡]`
- [ ] `requireSupabase()` guard from `lib/guards.ts` applied `[🔴]`
- [ ] Rate limiter applied via `createRateLimiter()` `[🔴]`
- [ ] Error responses return generic message, not internal details `[🔴]`
- [ ] Supabase client imported from `@/lib/supabase` (server singleton) `[🟡]`

### React Components (`components/**/*.tsx`)
- [ ] Server Components by default; `"use client"` only when hooks are needed `[🔵]`
- [ ] React Query (`@tanstack/react-query`) for client-side data fetching `[🟡]`
- [ ] API calls go through `/api/*` routes, never directly to Supabase `[🔴]`
- [ ] `cn()` from `@/lib/utils` for conditional class composition `[🔵]`
- [ ] ARIA attributes on interactive elements (`role`, `aria-label`, `aria-pressed`) `[🟡]`
- [ ] No `dangerouslySetInnerHTML` — use `hast-util-to-jsx-runtime` for HTML rendering `[🔴]`
- [ ] Loading states (skeletons) and error states handled `[🟡]`
- [ ] AbortController for requests triggered by user input (search, debounce) `[🟡]`

---

## 2. Python (Worker)

### Type Safety
- [ ] Type hints on all function signatures (params + return) `[🟡]`
- [ ] `TypedDict` for pipeline state `[🟡]`
- [ ] No `# type: ignore` without justification `[🔵]`

### Pipeline (`worker/pipeline/graph.py`)
- [ ] LLM calls go through `_openrouter_chat()` wrapper (handles retry + rotation) `[🔴]`
- [ ] ModelPool used for model selection (not hardcoded model names) `[🔴]`
- [ ] `_check_daily_token_cap()` called before every LLM request `[🟡]`
- [ ] `_parse_llm_json()` used for resilient JSON extraction from LLM output `[🟡]`
- [ ] Token usage logged to `llm_usage_log` after every successful call `[🟡]`
- [ ] Error node raises `Celery RetryError` (max 3×, exponential backoff) `[🟡]`

### Scrapers (`worker/scrapers/**/*.py`)
- [ ] `bleach.clean(tags=[], strip=True)` on all HTML content `[🔴]`
- [ ] `defusedxml` for XML/Atom parsing (not stdlib `xml.etree`) `[🔴]`
- [ ] HTTP timeout set (`timeout=10`) `[🟡]`
- [ ] Response size limit enforced (max 2 MB) `[🟡]`
- [ ] `httpx.HTTPStatusError` and `httpx.RequestError` caught explicitly `[🟡]`
- [ ] Deduplication by URL before enqueueing `[🟡]`

### General Python
- [ ] No `print()` in production code — use `structlog` or `logging` (configured via `logging_config.py`) `[🟡]`
- [ ] Environment variables loaded via `python-dotenv`, checked at startup `[🟡]`
- [ ] No hardcoded secrets or API keys `[🔴]`

---

## 3. Security

This section covers security concerns **not already checked** in domain sections above. If a security issue was caught by §1 or §2, do not report it again here.

> **Note:** Broken Auth is N/A by design — this is a single-user app with no auth surface.

### OWASP Alignment (unique checks only)
- [ ] **Broken Access Control**: RLS policies on all Supabase tables `[🔴]`
- [ ] **Security Misconfiguration**: CSP, X-Frame-Options, X-Content-Type-Options headers in `next.config.ts` `[🟡]`
- [ ] **Insecure Deserialization**: LLM JSON parsed safely via `_parse_llm_json()` `[🟡]`

### Platform-Specific
- [ ] `HMAC_SECRET` used for unsubscribe token generation/validation `[🔴]`
- [ ] `crypto.timingSafeEqual` for HMAC comparison (prevent timing attacks) `[🔴]`
- [ ] Embed server and Redis bind to `127.0.0.1` only `[🟡]`

---

## 4. Design Patterns

### Architecture Compliance
- [ ] Frontend and worker communicate only through the database (no RPC) `[🟡]`
- [ ] `OWNER_ID = 'owner'` hardcoded (single-user design, no auth) `[🔵]`
- [ ] Graceful degradation: embed server down → 503 on search, rest works `[🟡]`
- [ ] ModelPool rotation on rate limit (not fail-fast) `[🟡]`

### Code Organization
- [ ] Shadcn/UI primitives in `components/ui/`, custom components in `components/` `[🔵]`
- [ ] `@/*` path aliases used (configured in tsconfig) `[🔵]`
- [ ] Early returns over nested conditionals `[🔵]`
- [ ] No `console.log` / `print` in production code `[🟡]`

---

## 5. Testing

### Coverage Requirements
- [ ] New API route → vitest test in `__tests__/api/` `[🟡]`
- [ ] New component → vitest test in `__tests__/components/` `[🟡]`
- [ ] New scraper → pytest test in `worker/tests/scrapers/` `[🟡]`
- [ ] New pipeline node → pytest test in `worker/tests/pipeline/` `[🟡]`
- [ ] External services mocked (Supabase, OpenRouter, HTTP) — no real API calls `[🔴]`
- [ ] Test file naming: `<module>.test.ts` or `test_<module>.py` `[🔵]`

### Quality Gates (verify via CI or ask the user — do NOT run)
- [ ] `pnpm typecheck` — zero errors `[🔴]`
- [ ] `pnpm lint` — zero warnings `[🟡]`
- [ ] `pnpm test` — all existing tests green `[🔴]`
- [ ] `pytest tests/ --ignore=tests/pipeline/test_categorizer.py` — all existing tests green `[🔴]`

---

## 6. Database

### Migrations (`supabase/migrations/*.sql`)
- [ ] Sequential numbering (`0001_`, `0002_`, ...) `[🔵]`
- [ ] `IF NOT EXISTS` / `IF EXISTS` guards `[🟡]`
- [ ] RLS enabled on every new table `[🔴]`
- [ ] `vector(384)` for embeddings (matches `all-MiniLM-L6-v2`) `[🟡]`
- [ ] Cosine distance operator `<=>` for similarity queries `[🔵]`

---

## 7. Docker & DevOps

### Dockerfiles
- [ ] Worker: `COPY . ./worker/` to preserve Python package structure `[🔴]`
- [ ] Frontend: `.next/` directory created with correct ownership before `USER` switch `[🔴]`
- [ ] Both: non-root `USER` set before `CMD` `[🔴]`
- [ ] Worker: `HEALTHCHECK` instruction present `[🟡]`
- [ ] `.dockerignore` excludes `node_modules/`, `.venv/`, `.next/`, `.env*`, tests `[🟡]`

### docker-compose.yml
- [ ] `host.docker.internal:host-gateway` in `extra_hosts` for Supabase access `[🟡]`
- [ ] Redis, embed-server, and frontend bind to `127.0.0.1` only `[🟡]`
- [ ] Worker `env_file` points to `./worker/.env` `[🔵]`
- [ ] `depends_on` with `condition: service_healthy` where applicable `[🔵]`

---

## 8. Documentation

### Sync Check
- [ ] Test counts match across `ARCHITECTURE.md`, `README.md`, `GUIDE.md`, `RUNBOOK.md` `[🟡]`
- [ ] New routes/components documented in `ARCHITECTURE.md` route map `[🟡]`
- [ ] New env vars documented in `ARCHITECTURE.md` section 7 `[🟡]`
- [ ] Dockerfile snippets in docs match actual `worker/Dockerfile` and `Dockerfile.frontend` `[🟡]`
