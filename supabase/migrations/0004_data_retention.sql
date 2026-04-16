-- Migration: 0004_data_retention.sql
-- Data retention policy for keeping the database clean and performant.
--
-- Policies:
--   1. Discarded articles (is_filtered=FALSE) older than 30 days → deleted
--   2. LLM usage logs older than 90 days → deleted
--   3. Archived flag for articles older than 6 months (soft archive)

-- Add archived column for soft-archiving old articles
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient retention queries
CREATE INDEX IF NOT EXISTS idx_news_items_published_filtered
  ON news_items (published_at, is_filtered)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_items_archived
  ON news_items (archived)
  WHERE archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_llm_usage_log_timestamp
  ON llm_usage_log (timestamp);

-- Function: delete discarded articles older than 30 days
CREATE OR REPLACE FUNCTION cleanup_discarded_articles(days_old INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM news_items
  WHERE is_filtered = FALSE
    AND published_at < NOW() - (days_old || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function: archive old articles (soft delete — keeps data but excludes from main queries)
CREATE OR REPLACE FUNCTION archive_old_articles(months_old INT DEFAULT 6)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  archived_count INT;
BEGIN
  UPDATE news_items
  SET archived = TRUE
  WHERE archived = FALSE
    AND published_at < NOW() - (months_old || ' months')::INTERVAL;
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

-- Function: purge old LLM usage logs
CREATE OR REPLACE FUNCTION cleanup_usage_logs(days_old INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM llm_usage_log
  WHERE timestamp < NOW() - (days_old || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
