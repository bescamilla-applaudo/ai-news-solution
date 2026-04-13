# PRD: AI-Development News Aggregator & Intelligence System

## 1. Executive Summary

A specialized news intelligence platform for full-stack developers and AI engineers. The platform eliminates financial, political, and hype-based noise, delivering only actionable technical intelligence: new model releases, framework updates (LangGraph, LlamaIndex), architectural patterns, and research breakthroughs with direct implementation value.

**Signal IN:** LLM releases, multi-agent architectures, developer tooling, research papers with practical applications.
**Filtered OUT:** Investment rounds, policy debates, "AI will replace jobs" articles, company valuations, and generic hype.

## 2. Target Audience

- **Primary:** Full-stack developers and AI engineers building LLM-powered products.
- **Secondary:** Tech Leads and Architects designing multi-agent systems and enterprise AI pipelines.

## 3. Core Features & Functional Requirements

### 3.1. Intelligence Engine (Backend/Agentic Layer)

- **Ingestion Pipeline:** Automated scraping from 6 curated technical sources (see §6 for full list). MVP starts with 3.
- **Noise Filter Agent:** LLM-based two-stage classification — first categorize (`Technical` / `Financial` / `Political` / `General`), then discard all non-Technical.
- **Depth Evaluator Agent:** Assign a Technical Depth Score (1–10) and identify affected developer workflows.
- **Summarizer Agent:** Generate structured summaries focused on "What changes for developers" and "How to implement this."
- **Embedding Generation:** Vector embeddings for every article to enable semantic search.

### 3.2. Developer Dashboard (Frontend)

- **High-Density News Feed:** Technical summaries in a compact, scannable layout. No large hero images.
- **Impact Score:** Visible metric (1–10) per article. Filters available by score range.
- **Category Tags:** `Multi-Agent`, `LLM-Release`, `Dev-Tools`, `Research`, `Methodologies`.
- **Technical Detail View:** Markdown-rendered view with implementation steps and code snippets.
- **⌘+K Command Palette:** Semantic search across all indexed articles.
- **Related Articles:** Vector similarity-based recommendations.

### 3.3. Personalization & Notifications

- **Authentication:** Clerk-based developer profiles (Google/GitHub OAuth).
- **Tech Stack Watchlist:** Follow specific technologies (e.g., "LangGraph", "RAG", "Claude").
- **Weekly Intelligence Brief:** Auto-generated Markdown digest of the week's top technical shifts, delivered via email (Resend).

## 4. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Signal Accuracy | >95% of stored articles are strictly technical |
| Dashboard Load Time | <1.5s (P95) |
| Ingestion Latency | New articles indexed within 30 min of publication |
| Uptime | 99.5% dashboard; ingestion pipeline tolerates up to 2h downtime |
| LLM Cost Control | Monthly LLM API spend capped at $50 via rate limiting and caching |
| Graceful Degradation | If LLM provider is unavailable, serve cached content without downtime |

## 5. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 15+ (App Router) + Shadcn/UI + Tailwind CSS | SSR performance, developer ecosystem |
| Auth | Clerk | Managed auth with OAuth; free up to 10K MAU |
| State / Caching | React Query (TanStack) | Optimistic updates, stale-while-revalidate |
| Agent Orchestration | LangGraph (Python) | Stateful multi-agent graphs, built-in retry logic |
| LLM (Filter + Summary) | Claude `claude-opus-4-5` via Anthropic API | Best-in-class classification and summarization |
| LLM (Cheap classification) | Claude `claude-haiku-4-5` | Fast, cheap first-pass categorizer |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) | $0.02/MTok, high quality, proven |
| Primary Database | Supabase (PostgreSQL 15) | Managed, built-in pgvector, free tier for MVP |
| Vector Search | `pgvector` extension on Supabase | Co-located with primary DB, no extra service |
| Job Queue | Celery 5+ (`celery[redis]`) via Upstash Redis | Native Python, managed retries and concurrency, no infra overhead |
| Email | Resend | Simple API, 100 emails/day free |
| Observability | LangSmith | LangGraph-native tracing for agent debugging |
| Deployment (FE) | Vercel | Zero-config Next.js deployment |
| Deployment (Workers) | Railway | Simple container deployment, ~$5–10/month |
| CI/CD | GitHub Actions | Automated tests and lint on every PR |

## 6. Data Sources

| Source | Access Method | Rate Limit | MVP Phase |
|---|---|---|---|
| Anthropic Blog | RSS: `https://www.anthropic.com/rss.xml` | None | Phase 1–2 |
| OpenAI Blog | RSS: `https://openai.com/news/rss.xml` | None | Phase 1–2 |
| Arxiv (cs.AI + cs.CL) | REST API: `http://export.arxiv.org/api/query` | 1 req/3s | Phase 1–2 |
| Google DeepMind Blog | RSS: `https://deepmind.google/blog/rss.xml` | None | Phase 3–4 |
| GitHub Trending | GitHub Search API (filter: topic=ai, sort=stars) | 5,000 req/hr (authenticated PAT) | Phase 3–4 |
| Hacker News | Firebase API: `https://hacker-news.firebaseio.com/v0/` | None | Phase 3–4 |

## 7. Cost Estimates

| Phase | Service | Cost/Month |
|---|---|---|
| 1–2 (MVP) | Supabase Free | $0 |
| 1–2 | Vercel Hobby | $0 |
| 1–2 | Railway (1 worker container) | ~$5 |
| 1–2 | Upstash Redis (free tier) | $0 |
| 1–2 | Claude API (~200 articles/day, haiku filter + opus summary) | ~$15–20 |
| 1–2 | OpenAI Embeddings (~200 articles/day × 500 tokens) | <$1 |
| 1–2 | LangSmith (free tier) | $0 |
| **MVP Total** | | **~$21/month** |
| 3–4 | Supabase Pro (pgvector perf + storage) | $25 |
| 3–4 | Vercel Hobby | $0 |
| 3–4 | Railway (worker, scaled) | ~$10 |
| 3–4 | Upstash Redis (free tier) | $0 |
| 3–4 | Claude API (6 sources + deep-dive prompts) | ~$30–35 |
| 3–4 | OpenAI Embeddings (~400 articles/day) | ~$2 |
| 3–4 | Clerk (free under 10K MAU) | $0 |
| 3–4 | Resend (free under 100 emails/day) | $0 |
| 3–4 | LangSmith (free tier) | $0 |
| **Full Product Total** | | **~$67–72/month** |

> Cost cap strategy: Celery tasks are dropped (`Ignore()`) automatically if daily token usage exceeds the budget threshold. See ARCHITECTURE.md §8.

## 8. Project Roadmap

| Phase | Goal | Key Deliverable |
|---|---|---|
| 1 — Foundation | DB schema, Next.js scaffold, auth, static UI | Dashboard with seed data, full schema deployed |
| 2 — Ingestion | LangGraph filter, 3-source scrapers, Celery worker | Articles flowing into DB automatically |
| 3 — Intelligence | Deep-dives, semantic search, ⌘+K palette, 3 more sources | Searchable, rich article detail views |
| 4 — Personalization | Watchlist, personalized feed, weekly email digest | Email brief sent, personalized feed working |

## 9. Success Metrics

| Metric | Target |
|---|---|
| Signal accuracy | >95% of stored articles are strictly technical |
| False positive rate | <5% non-technical articles pass the noise filter |
| Actionability | >90% of score ≥8 articles have at least one implementation step |
| Engagement | Users visit ≥3×/week on average |
| Click-through | ≥20% of viewed articles trigger "View Source" or "Implementation Guide" |
| Dashboard load | <1.5s P95 |
| Monthly LLM cost | <$50 enforced via rate cap |
