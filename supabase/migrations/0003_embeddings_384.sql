-- Migration: 0003_embeddings_384.sql
-- Change embedding column from vector(1536) (OpenAI text-embedding-3-small)
-- to vector(384) (sentence-transformers/all-MiniLM-L6-v2, local, no API key).
--
-- This drops all existing embeddings — they will be regenerated when articles
-- are re-processed through the updated pipeline.

-- Drop old IVFFlat index (tied to dimensionality)
DROP INDEX IF EXISTS news_items_embedding_idx;

-- Change column type
ALTER TABLE news_items
  ALTER COLUMN embedding TYPE VECTOR(384)
  USING NULL;  -- existing 1536-dim vectors are incompatible; reset to NULL

-- Recreate IVFFlat index for 384-dim cosine similarity
CREATE INDEX news_items_embedding_idx
  ON news_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Update the match_articles RPC to accept 384-dim query vectors
CREATE OR REPLACE FUNCTION match_articles(
  query_embedding VECTOR(384),
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
