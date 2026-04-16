-- =============================================================
-- Migration: 0001_initial_schema.sql
-- Run via Supabase Dashboard > SQL Editor, or:
--   supabase db push
-- =============================================================

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================
-- TABLES
-- =============================================================

CREATE TABLE IF NOT EXISTS news_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url           TEXT UNIQUE NOT NULL,
  source_name          TEXT NOT NULL,           -- 'huggingface' | 'openai' | 'arxiv' | 'deepmind' | 'hn'
  title                TEXT NOT NULL,
  raw_content          TEXT,
  technical_summary    TEXT,
  impact_score         SMALLINT CHECK (impact_score BETWEEN 1 AND 10),
  depth_score          SMALLINT CHECK (depth_score BETWEEN 1 AND 10),
  implementation_steps JSONB,                   -- [{"step": 1, "description": "...", "code": "...", "link": "..."}]
  affected_workflows   TEXT[],
  embedding            VECTOR(1536),            -- all-MiniLM-L6-v2 (384 dims after migration 0003); populated by pipeline
  category             TEXT,                    -- 'Technical' | 'Financial' | 'Political' | 'General'
  tags                 TEXT[],                  -- denormalized tag names (source of truth: news_item_tags)
  published_at         TIMESTAMPTZ,
  ingested_at          TIMESTAMPTZ DEFAULT NOW(),
  is_filtered          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tech_tags (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL                        -- 'framework' | 'model' | 'methodology' | 'tool'
);

CREATE TABLE IF NOT EXISTS news_item_tags (
  news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  tech_tag_id  UUID NOT NULL REFERENCES tech_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (news_item_id, tech_tag_id)
);

CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id     TEXT NOT NULL,                    -- Single-user app (hardcoded 'owner')
  tech_tag_id UUID NOT NULL REFERENCES tech_tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tech_tag_id)
);

CREATE TABLE IF NOT EXISTS email_subscriptions (
  user_id    TEXT PRIMARY KEY,                  -- Single-user app (hardcoded 'owner')
  email      TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     TIMESTAMPTZ DEFAULT NOW(),
  model         TEXT NOT NULL,
  input_tokens  INT,
  output_tokens INT,
  job_id        TEXT
);

-- =============================================================
-- INDEXES
-- =============================================================

-- Vector similarity search (IVFFlat, 100 lists; effective after ~1000 rows)
CREATE INDEX IF NOT EXISTS news_items_embedding_idx
  ON news_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS news_items_published_at_idx ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_impact_score_idx ON news_items (impact_score DESC);
CREATE INDEX IF NOT EXISTS news_items_filtered_published_idx ON news_items (is_filtered, published_at DESC);
CREATE INDEX IF NOT EXISTS news_item_tags_tag_idx ON news_item_tags (tech_tag_id);
CREATE INDEX IF NOT EXISTS news_item_tags_item_idx ON news_item_tags (news_item_id);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

-- news_items: public SELECT for filtered articles only; no client writes
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_filtered" ON news_items
  FOR SELECT USING (is_filtered = TRUE);

-- tech_tags: fully public read
ALTER TABLE tech_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON tech_tags FOR SELECT USING (TRUE);

-- news_item_tags: public read
ALTER TABLE news_item_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON news_item_tags FOR SELECT USING (TRUE);

-- user_watchlist: single-user personal app — server routes use service role key.
-- RLS enabled but policies allow all operations (the session middleware is the
-- real access gate; no other user exists to protect against).
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON user_watchlist FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- email_subscriptions: same reasoning as user_watchlist.
ALTER TABLE email_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON email_subscriptions FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- llm_usage_log: no client access; written by worker via service role key only
ALTER TABLE llm_usage_log ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy: inaccessible from client. Admin reads via service role.

-- =============================================================
-- RPC FUNCTION: match_articles (used by /api/search and /api/article/[id]/related)
-- =============================================================

CREATE OR REPLACE FUNCTION match_articles(
  query_embedding VECTOR(1536),
  match_count     INT DEFAULT 10,
  filter_id       UUID DEFAULT NULL
)
RETURNS TABLE (
  id                 UUID,
  title              TEXT,
  source_name        TEXT,
  source_url         TEXT,
  technical_summary  TEXT,
  impact_score       SMALLINT,
  depth_score        SMALLINT,
  tags               TEXT[],
  published_at       TIMESTAMPTZ,
  similarity         FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ni.id,
    ni.title,
    ni.source_name,
    ni.source_url,
    ni.technical_summary,
    ni.impact_score,
    ni.depth_score,
    ni.tags,
    ni.published_at,
    1 - (ni.embedding <=> query_embedding) AS similarity
  FROM news_items ni
  WHERE
    ni.is_filtered = TRUE
    AND ni.embedding IS NOT NULL
    AND (filter_id IS NULL OR ni.id != filter_id)
  ORDER BY ni.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- =============================================================
-- SEED DATA: controlled vocabulary for tech_tags
-- =============================================================

INSERT INTO tech_tags (name, category) VALUES
  ('Multi-Agent',    'methodology'),
  ('LLM-Release',    'model'),
  ('RAG',            'methodology'),
  ('Dev-Tools',      'tool'),
  ('Research',       'methodology'),
  ('Methodologies',  'methodology'),
  ('LangGraph',      'framework'),
  ('Claude',         'model'),
  ('Agents',         'methodology'),
  ('Embeddings',     'methodology')
ON CONFLICT (name) DO NOTHING;
