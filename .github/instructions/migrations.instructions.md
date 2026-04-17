---
description: "Use when: writing or modifying Supabase migrations, changing database schema, adding RLS policies, or creating SQL functions. Covers migration safety and pgvector conventions."
applyTo: "supabase/migrations/**/*.sql"
---
# Migration Standards

## File Naming
- Sequential numbering: `0001_`, `0002_`, etc.
- Descriptive suffix: `0005_add_rate_limiting.sql`.

## Safety Rules
- Always create reversible migrations when possible (`DROP` counterpart documented in comments).
- Never drop columns in the same migration as the code change that removes their usage.
- Add `IF NOT EXISTS` / `IF EXISTS` guards on CREATE/DROP statements.
- Test migrations locally with `supabase db reset` before committing.

## RLS Policies (MANDATORY)
- Every new table must have RLS enabled: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
- For this single-user app, policies typically allow all operations for `OWNER_ID = 'owner'`.
- Document the policy intent in a SQL comment above each `CREATE POLICY`.

## pgvector
- Embeddings column: `vector(384)` (matches `all-MiniLM-L6-v2` output).
- Use cosine distance operator `<=>` for similarity search.
- Index: `CREATE INDEX ... USING ivfflat (...) WITH (lists = 100)`.

## Existing Migrations
- `0001_initial_schema.sql` — Core tables (articles, tags, watchlist, llm_usage_log), indexes, RLS.
- `0002_seed_articles.sql` — 10 seed articles for UI validation.
- `0003_embeddings_384.sql` — Migrate to 384-dim embeddings.
- `0004_data_retention.sql` — Cleanup/archive RPC functions.
