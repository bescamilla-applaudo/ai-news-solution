-- Migration: Dynamic LLM-generated tags
-- The evaluator LLM now freely suggests tags instead of using a fixed vocabulary.
-- New tags are auto-created by the pipeline's storage_node.
-- This migration adds broader seed tags to cover trending AI development topics.

-- Add new seed tags for broader AI development coverage
INSERT INTO tech_tags (name, category) VALUES
  ('LLM',              'model'),
  ('Fine-Tuning',      'methodology'),
  ('Code-Generation',  'tool'),
  ('Vision',           'model'),
  ('Reasoning',        'methodology'),
  ('Inference',        'methodology'),
  ('Open-Source',      'methodology'),
  ('MCP',              'tool'),
  ('Evaluation',       'methodology'),
  ('Diffusion',        'model'),
  ('RL',               'methodology'),
  ('Transformers',     'framework'),
  ('API',              'tool'),
  ('Safety',           'methodology'),
  ('Benchmarks',       'methodology')
ON CONFLICT (name) DO NOTHING;
