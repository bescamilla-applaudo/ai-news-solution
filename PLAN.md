# Implementation Plan: AI Intelligence & News Aggregator

Step-by-step development roadmap. See [PRD.md](PRD.md) for requirements and [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical specification.

---

## Phase 1: Foundation & Scaffold
*Goal: Running Next.js dashboard connected to Supabase, complete schema deployed (including embeddings and join tables), auth configured, and seed data visible.*

### 1.1 Project Initialization
- Initialize **Next.js 15+** with TypeScript, ESLint, Tailwind CSS, and `pnpm` as the package manager.
- Configure **Shadcn/UI**: run the CLI, set dark mode as default, add components: `Card`, `Badge`, `Button`, `Input`, `Command`, `Dialog`, `Accordion`, `Skeleton`.
- Create project structure:
  ```
  app/                  # Next.js App Router pages
  components/           # Shared UI components
  hooks/                # React Query hooks
  lib/
    supabase.ts         # Typed Supabase client (using generated types)
    types.ts            # Shared TypeScript types
  worker/               # Python agent service (independent sub-project)
  ```
- Configure **Clerk**: install `@clerk/nextjs`, wrap root layout in `<ClerkProvider>`, add `middleware.ts` to protect `/watchlist` and `/admin` routes.

### 1.2 Supabase: Full Schema Deployment
- Create a Supabase project. Enable `pgvector`: `CREATE EXTENSION IF NOT EXISTS vector;`
- Run the **complete schema** from `ARCHITECTURE.md §3` in a single migration:
  - `news_items` — include `embedding VECTOR(1536)` from day one (avoids a destructive later migration)
  - `tech_tags`
  - `news_item_tags` (join table — defines the many-to-many relationship)
  - `user_watchlist`
  - `email_subscriptions`
  - `llm_usage_log`
  - All indexes (ivfflat on embedding, `published_at DESC`, `impact_score DESC`, composite on `is_filtered`)
  - All RLS policies
- Seed `tech_tags` with the initial controlled vocabulary: `Multi-Agent`, `LLM-Release`, `RAG`, `Dev-Tools`, `Research`, `Methodologies`, `LangGraph`, `Claude`, `Agents`, `Embeddings`.
- Generate typed client: `supabase gen types typescript --linked > lib/database.types.ts`.

### 1.3 Upstash Redis Setup
- Create an Upstash Redis database (free tier, no infra to manage).
- Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.local` (Next.js) and Railway environment (worker — added later in Phase 2).
- Install `@upstash/redis` in the Next.js app — used for rate limiting in Phase 3.

### 1.4 Core Dashboard UI
- Build `NewsFeed` component (`app/page.tsx`): fetch `news_items` where `is_filtered = TRUE`, ordered by `impact_score DESC`, paginated 20 items/page using React Query.
- Build `ArticleCard`: title, source badge, depth score bar (1–10), tags from `news_item_tags`, relative time, "View Details" link.
- Build `ArticleDetailView` (`app/article/[id]/page.tsx`): Markdown renderer for `technical_summary`, implementation steps accordion, affected workflows list, link to `source_url`.
- Populate with **10 realistic seed articles** (manually inserted) to validate the layout before the pipeline is ready.
- Add a tag filter bar (client-side filter on active `tech_tags`).

### 1.5 Initial API Routes
- `GET /api/news` — paginated `news_items` where `is_filtered = TRUE`, includes joined tags via Supabase `.select('*, news_item_tags(tech_tags(*))')`.
- `GET /api/article/[id]` — single article with full detail.

**Phase 1 Exit Criteria:** Dashboard loads with 10 seed articles. Schema fully deployed including embedding column, join table, and all RLS policies. Clerk middleware active. Upstash connected.

---

## Phase 2: Agentic Ingestion Pipeline
*Goal: Articles from 3 sources (Anthropic Blog, OpenAI Blog, Arxiv) processed automatically by the LangGraph pipeline and stored in Supabase. Worker deployed on Railway.*

### 2.1 Python Worker: Project Setup
- Create `worker/` as an independent Python 3.11 project with `pyproject.toml` and `requirements.txt`.
- Key dependencies:
  ```
  langgraph>=0.2
  anthropic
  openai
  httpx
  feedparser
  supabase
  celery[redis]>=5.3
  apscheduler
  python-dotenv
  bleach
  langsmith
  pytest
  ```
- Environment variables (stored in Railway dashboard, **never in source code**):
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `UPSTASH_REDIS_URL`, `LANGCHAIN_API_KEY`, `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT=ai-news-prod`.
- Create `worker/Dockerfile` (see `ARCHITECTURE.md §7`).

### 2.2 Scraping Engine
- `worker/scrapers/rss.py`: async RSS scraper using `feedparser` + `httpx`. Returns `list[{url, title, raw_content, published_at, source_name}]`.
- `worker/scrapers/arxiv.py`: queries the Arxiv REST API:
  `http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&max_results=20&sortBy=submittedDate`
  Parses the Atom XML response; enforces the required 3-second delay between requests.
- **Sanitization:** `bleach.clean(raw_html, tags=[], strip=True)` on all scraped content before any LLM call. This prevents prompt injection via article content.
- **Deduplication:** Before queuing a job, query Supabase for `source_url`. Only queue articles not already present in `news_items`.
- **Polling schedule** (APScheduler `IntervalTrigger`):
  - Anthropic Blog + OpenAI Blog: every 30 minutes.
  - Arxiv: every 60 minutes.

### 2.3 LangGraph Noise Filter Pipeline
Implement `worker/pipeline/graph.py`. Full state schema and node/edge specification in `ARCHITECTURE.md §4`.

**Node responsibilities:**
1. **`categorizer_node`** — `claude-haiku-4-5`. Classifies as `Technical | Financial | Political | General`. This is the only node that runs on 100% of articles. Keep prompt concise to minimize cost.
2. **`evaluator_node`** — `claude-opus-4-5`. Assigns BOTH `depth_score` (technical complexity, 1–10) AND `impact_score` (developer workflow impact, 1–10), extracts `affected_workflows` list, and maps to tag names from the `tech_tags` controlled vocabulary (stored in `tags: list[str]` in state). Runs only on `Technical` articles.
3. **`summarizer_node`** — `claude-opus-4-5`. Generates `technical_summary` (Markdown) and `implementation_steps` (JSON array). **Constraint:** only reference code explicitly present in `raw_content`. If no code, `implementation_steps[].code` is `null`.
4. **`embedder_node`** — OpenAI `text-embedding-3-small`. Generates 1536-dim embedding from `technical_summary` text.
5. **`storage_node`** — Upserts full record into Supabase using the **service role key**. Sets `is_filtered = TRUE`. Writes token counts to `llm_usage_log`.
6. **`discard_node`** — Inserts a minimal record into `news_items` with `is_filtered=FALSE` and `category=<classified_category>` so discard trends are queryable. The full discard reason is captured automatically in LangSmith; no separate audit table is needed.
7. **`error_node`** — Catches any unhandled exception. Stores article with `is_filtered=FALSE`. Raises a Celery `RetryError` to trigger automatic retry.

**Edge definition:**
```
START → categorizer_node
categorizer_node → evaluator_node       (if category == "Technical")
categorizer_node → discard_node → END  (if category != "Technical")
evaluator_node   → summarizer_node
summarizer_node  → embedder_node
embedder_node    → storage_node → END
Any node (exception) → error_node → END
```

### 2.4 Celery Task Queue
- Each scraped article is dispatched as a Celery task: `process_article.delay(url, title, raw_content, source_name, published_at)`.
- The worker runs a **Celery worker** process that consumes tasks from Upstash Redis and executes the LangGraph pipeline.
- Configure the Celery app in `worker/celery_app.py`:
  ```python
  from celery import Celery
  app = Celery('ai_news', broker=UPSTASH_REDIS_URL, backend=UPSTASH_REDIS_URL)
  app.conf.task_serializer = 'json'
  app.conf.worker_concurrency = 4   # 4 parallel pipeline runs
  ```
- **Retry policy** on `process_article` task:
  ```python
  @app.task(bind=True, max_retries=3)
  def process_article(self, ...):
      try:
          run_pipeline(...)
      except Exception as exc:
          raise self.retry(exc=exc, countdown=5 * (2 ** self.request.retries))
  ```
  Backoff: 5s → 10s → 20s. After 3 failures, stored as `is_filtered=FALSE`.
- **Cost cap check:** At task start, query `llm_usage_log` for today's total tokens. If `SUM(input_tokens + output_tokens) > 400_000`, raise `celery.exceptions.Ignore()` to drop the task without retrying, and send an alert email via Resend to the admin address.

### 2.5 LangSmith Observability
- Setting `LANGCHAIN_TRACING_V2=true` auto-instruments all LangGraph runs. No additional code needed.
- Create a LangSmith saved filter: `category != "Technical"` to review discarded articles and tune the categorizer prompt over time.
- Check LangSmith after the first 48 hours of production ingestion to validate filter decisions.

### 2.6 Railway Deployment (Worker)
- Create a Railway project. Connect to the GitHub repo. Set `worker/` as the root directory with the Dockerfile.
- Add all environment variables in Railway dashboard (never in the repository).
- **Do not expose a public HTTP port** — the worker is a consumer-only process and should not be reachable from the internet.
- Verify deployment by watching Railway logs for the first successful job completion.

### 2.7 Signal Accuracy Validation
Before closing Phase 2, run a structured test:
- Create `worker/tests/pipeline/test_categorizer.py` with 20 fixture articles (10 technical, 10 non-technical).
- Assert: ≥95% of technical articles classified as `Technical`, ≤5% false positives.
- If accuracy < threshold, refine the categorizer prompt before proceeding to Phase 3.
- This test is also part of the GitHub Actions CI pipeline (Phase 3.6).

**Phase 2 Exit Criteria:** Articles from 3 sources flow into DB automatically. Signal accuracy ≥95% validated. Worker deployed on Railway with no exposed port. All runs visible in LangSmith.

---

## Phase 3: Developer Intelligence Features
*Goal: Rich detail views with code extraction, semantic search, ⌘+K palette, 3 additional sources, and CI established.*

### 3.1 Technical Deep-Dive Generation
- Extend `summarizer_node` prompt to extract:
  - Code snippets **only if literally present** in `raw_content`.
  - Links to referenced GitHub repos or documentation pages.
- Store both in `implementation_steps` JSONB:
  ```json
  [{"step": 1, "description": "Install the SDK", "code": "pip install anthropic", "link": null}]
  ```
- Add a validation check in `storage_node`: if the `code` field in an implementation step came from the LLM but has no corresponding text in `raw_content`, set it to `null` and log a warning to LangSmith.
- In `ArticleDetailView`, render `implementation_steps` with `shiki` syntax-highlighted code blocks.

### 3.2 Semantic Search API
- Implement `GET /api/search?q={query}`:
  1. Call OpenAI `text-embedding-3-small` on the query string.
  2. Query Supabase with pgvector cosine similarity:
     ```sql
     SELECT *, embedding <=> $1::vector AS distance
     FROM news_items
     WHERE is_filtered = TRUE
     ORDER BY distance ASC
     LIMIT 10;
     ```
  3. Return results sorted by similarity with `distance` field included.
- Rate-limit with Upstash Redis (configured in Phase 1.3): 20 requests/minute per IP. Return `HTTP 429` with `Retry-After: 60` header on breach.

### 3.3 ⌘+K Command Palette
- Implement `CommandPalette` component using Shadcn `Command` (built on `cmdk`).
- Keyboard shortcut: `⌘+K` (Mac) / `Ctrl+K` (Linux/Windows) via `useEffect` + `keydown` event listener attached to `document`.
- Debounce input 300ms before calling `/api/search`. Show a loading spinner during fetch.
- Display per result: article title, source badge, impact score chip, top 2 tags.

### 3.4 Related Articles
- On `ArticleDetailView`, render a "Related Articles" sidebar.
- Query: `SELECT * FROM news_items WHERE is_filtered = TRUE ORDER BY embedding <=> $current_embedding LIMIT 5`.
- Implement as a dedicated `GET /api/article/[id]/related` route. Fetch embedding from the stored record (no need to re-generate).
- Render as compact `ArticleCard` (minimal variant, no implementation steps).

### 3.5 Expand to 6 Sources
- Add `worker/scrapers/deepmind.py` (RSS, same pattern as Anthropic/OpenAI).
- Add `worker/scrapers/github_trending.py`: calls GitHub Search API with `GITHUB_TOKEN` PAT. Use a **dynamic date filter** (last 30 days) computed at runtime:
  ```python
  since = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%d')
  url = f"/search/repositories?q=topic:ai+topic:agents+pushed:>{since}&sort=stars&order=desc"
  ```
  Stores repo description + README excerpt as `raw_content`.
- Add `worker/scrapers/hn.py`: fetches top 200 story IDs from HN Firebase API, filters client-side by keywords (`langchain`, `langgraph`, `llm`, `agent`, `rag`, `embedding`), fetches full story text.
- Register all new scrapers in APScheduler with intervals from `ARCHITECTURE.md §5`.

### 3.6 GitHub Actions CI
- Add `.github/workflows/ci.yml` as specified in `ARCHITECTURE.md §7`.
- The `pipeline` job runs `test_categorizer.py` on every PR — automatically enforces the ≥95% signal accuracy threshold as a merge gate.

**Phase 3 Exit Criteria:** ⌘+K search works end-to-end. Related articles shown on detail view. 6 sources ingesting. CI passing and enforcing signal accuracy on every PR.

---

## Phase 4: Personalization & Delivery
*Goal: Auth-gated watchlist, personalized feed, weekly email digest, and cost monitoring dashboard.*

### 4.1 Auth Integration (Clerk)
- Clerk is configured since Phase 1.1. In this phase, activate the `/watchlist` route guard in `middleware.ts`.
- Implement `GET`, `POST`, and `DELETE` handlers in `app/api/watchlist/route.ts`. Validate Clerk session via `auth()` from `@clerk/nextjs/server` — never trust a client-provided user ID.
- Map Clerk `userId` (JWT `sub` claim) to `user_watchlist.user_id` in Supabase.
- **Security rule:** All Supabase writes for watchlist go through Next.js Server Actions that validate the Clerk session. The Supabase anon key is used in the browser; the service role key is never exposed client-side.

### 4.2 Personalized Feed
- Add `app/watchlist/page.tsx` (server component, auth required): queries articles tagged with the user's watched `tech_tags` via a join:
  ```sql
  SELECT ni.* FROM news_items ni
  JOIN news_item_tags nit ON nit.news_item_id = ni.id
  JOIN user_watchlist uw ON uw.tech_tag_id = nit.tech_tag_id
  WHERE uw.user_id = $1 AND ni.is_filtered = TRUE
  ORDER BY ni.impact_score DESC;
  ```
- Add a "Show Watchlist Only" toggle on the main feed. Redirects to `/watchlist` if authenticated, or shows Clerk sign-in prompt if not.

### 4.3 Weekly Intelligence Brief (Email)
- Create `worker/tasks/weekly_brief.py`. Runs every Monday at 00:00 UTC via APScheduler `CronTrigger`.
- Logic:
  1. Query top 10 articles from the past 7 days ordered by `impact_score DESC`.
  2. Call `claude-haiku-4-5` to generate a Markdown digest: "AI Developer Intelligence Brief — Week of {date}".
  3. Fetch all `email_subscriptions` where `active = TRUE`.
- Send one email per subscriber via Resend: `POST https://api.resend.com/emails`.
  > **Resend free tier cap:** 100 emails/day. If the subscriber count exceeds 100, batch sends across multiple days or upgrade to Resend Starter ($20/mo, 50K emails/mo).
- Add `RESEND_API_KEY` to Railway environment variables.
- Add "Subscribe to Weekly Brief" toggle in the dashboard (auth required). Writes to `email_subscriptions` via Server Action.
- Unsubscribe link in each email sets `active = FALSE` via a public `GET /api/unsubscribe?token=` route (signed token, not the raw user_id).

### 4.4 Cost & Usage Monitoring
- The `llm_usage_log` table is already being written by `storage_node` (Phase 2.3).
- Implement `app/admin/usage/page.tsx` (protected by Clerk admin role): displays daily token counts and estimated cost per model using a simple bar chart (Shadcn `Progress` or a lightweight chart library like `recharts`).
- Implement `GET /api/admin/usage`: aggregates `llm_usage_log` by day and model.
- The Celery cost cap from Phase 2.4 (drop tasks at 400K tokens/day via `Ignore()`) is already active. Verify it triggers correctly in staging before going to production.

**Phase 4 Exit Criteria:** Watchlist functional with Clerk auth. Personalized feed renders correctly. First weekly brief email sent and received. Cost monitoring dashboard shows real data. Cost cap verified in staging.

---

## Verification & Metrics

| Check | Target | How to Verify |
|---|---|---|
| Signal accuracy | ≥95% technical | CI test in `test_categorizer.py` (runs on every PR) |
| False positive rate | <5% | Same test set; also review LangSmith discard filter weekly |
| Actionability | ≥90% of score ≥8 articles have ≥1 implementation step | `SELECT COUNT(*) FROM news_items WHERE depth_score >= 8 AND implementation_steps IS NOT NULL` |
| Dashboard load | <1.5s P95 | Vercel Analytics + Lighthouse CI step in GitHub Actions |
| Monthly LLM cost | <$50 | `llm_usage_log` aggregation in `/admin/usage` page |
| Email delivery | Weekly brief received every Monday | Manual verification + Resend delivery logs |

## Related Documents
- [PRD.md](PRD.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
