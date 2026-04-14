-- =============================================================
-- Migration: 0002_seed_articles.sql
-- 10 realistic seed articles for Phase 1 UI validation.
-- Manually inserted with is_filtered=TRUE so they appear in the feed.
-- These will be replaced by pipeline-ingested content in Phase 2.
-- =============================================================

-- Temporary variable to hold tag IDs
DO $$
DECLARE
  langgraph_id    UUID;
  claude_id       UUID;
  rag_id          UUID;
  agents_id       UUID;
  multiagent_id   UUID;
  embeddings_id   UUID;
  devtools_id     UUID;
  llmrelease_id   UUID;
  research_id     UUID;

  a1 UUID; a2 UUID; a3 UUID; a4 UUID; a5 UUID;
  a6 UUID; a7 UUID; a8 UUID; a9 UUID; a10 UUID;
BEGIN
  -- Look up tag IDs
  SELECT id INTO langgraph_id  FROM tech_tags WHERE name = 'LangGraph';
  SELECT id INTO claude_id     FROM tech_tags WHERE name = 'Claude';
  SELECT id INTO rag_id        FROM tech_tags WHERE name = 'RAG';
  SELECT id INTO agents_id     FROM tech_tags WHERE name = 'Agents';
  SELECT id INTO multiagent_id FROM tech_tags WHERE name = 'Multi-Agent';
  SELECT id INTO embeddings_id FROM tech_tags WHERE name = 'Embeddings';
  SELECT id INTO devtools_id   FROM tech_tags WHERE name = 'Dev-Tools';
  SELECT id INTO llmrelease_id FROM tech_tags WHERE name = 'LLM-Release';
  SELECT id INTO research_id   FROM tech_tags WHERE name = 'Research';

  -- Article 1
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://www.anthropic.com/news/claude-4',
    'anthropic',
    'Claude Opus 4.5: 200K Context, Improved Tool Use, and Structured Output API',
    E'## What Changed\n\nAnthropic released Claude Opus 4.5 with a 200K token context window (up from 100K) and a new Structured Output API that enforces JSON schema compliance without prompt engineering.\n\n## Key Changes for Developers\n\n- `max_tokens` now supports up to 200,000 input tokens\n- New `output_format` parameter accepts a JSON Schema object\n- Tool use latency reduced by ~30% via batch tool call processing\n- `claude-opus-4-5` replaces `claude-opus-4` as the recommended production model',
    9, 8, 'Technical',
    ARRAY['Claude', 'LLM-Release', 'Dev-Tools'],
    ARRAY['LLM Integration', 'Structured Output Pipelines', 'RAG Systems'],
    '[
      {"step": 1, "description": "Update model identifier in your API calls", "code": "model=\"claude-opus-4-5\"", "link": null},
      {"step": 2, "description": "Use the new output_format parameter for guaranteed JSON", "code": "response = client.messages.create(\n  model=\"claude-opus-4-5\",\n  max_tokens=1024,\n  output_format={\"type\": \"json_schema\", \"json_schema\": your_schema}\n)", "link": "https://docs.anthropic.com/structured-output"}
    ]'::jsonb,
    '2026-04-10T09:00:00Z', TRUE
  ) RETURNING id INTO a1;

  -- Article 2
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://blog.langchain.dev/langgraph-0-3-persistent-memory',
    'anthropic',
    'LangGraph 0.3: Persistent Memory Across Graph Runs and Multi-Turn Agents',
    E'## What Changed\n\nLangGraph 0.3 introduces a `MemoryStore` abstraction that persists state across graph invocations, enabling true multi-session agents without external Redis or database setup.\n\n## Key Changes for Developers\n\n- `InMemoryStore` for development, `SqliteStore` and `PostgresStore` for production\n- `get_state` and `update_state` APIs work across graph runs\n- Breaking: `checkpointer` is now optional; `store` is the preferred persistence layer',
    9, 9, 'Technical',
    ARRAY['LangGraph', 'Agents', 'Multi-Agent'],
    ARRAY['Agent Orchestration', 'Multi-Turn Conversations', 'Stateful Pipelines'],
    '[
      {"step": 1, "description": "Upgrade LangGraph", "code": "pip install langgraph>=0.3", "link": null},
      {"step": 2, "description": "Add a memory store to your graph", "code": "from langgraph.store.memory import InMemoryStore\nstore = InMemoryStore()\ngraph = workflow.compile(store=store)", "link": "https://langchain-ai.github.io/langgraph/concepts/memory/"}
    ]'::jsonb,
    '2026-04-09T14:30:00Z', TRUE
  ) RETURNING id INTO a2;

  -- Article 3
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://openai.com/blog/text-embedding-3-large-v2',
    'openai',
    'text-embedding-3-large v2: 40% Better Retrieval on MTEB, Same Price',
    E'## What Changed\n\nOpenAI released `text-embedding-3-large-v2` with a 40% improvement on the MTEB retrieval benchmark (62.4 → 87.1 on BEIR) at the same price of $0.13/MTok.\n\n## Key Changes for Developers\n\n- Drop-in replacement for `text-embedding-3-large`\n- Dimensions remain 3072 (or truncatable to 256/512/1024/1536)\n- Existing vector indexes must be rebuilt — embeddings are not compatible',
    8, 7, 'Technical',
    ARRAY['Embeddings', 'RAG', 'Dev-Tools'],
    ARRAY['RAG Pipelines', 'Semantic Search', 'Vector Databases'],
    '[
      {"step": 1, "description": "Update the model name", "code": "embeddings = client.embeddings.create(\n  model=\"text-embedding-3-large-v2\",\n  input=texts\n)", "link": null},
      {"step": 2, "description": "Rebuild your vector index — old embeddings are incompatible", "code": null, "link": "https://platform.openai.com/docs/guides/embeddings/migration"}
    ]'::jsonb,
    '2026-04-08T11:00:00Z', TRUE
  ) RETURNING id INTO a3;

  -- Article 4
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://arxiv.org/abs/2404.00001',
    'arxiv',
    'ReAct+ : Reasoning and Acting with Parallel Tool Execution in LLM Agents',
    E'## Summary\n\nThis paper extends the ReAct framework by enabling parallel tool execution when tools have no data dependencies. Benchmark results show 3.2× throughput improvement on multi-step tasks with 4 parallel tools.\n\n## Key Findings for Developers\n\n- Dependency graph analysis at inference time enables safe parallelism\n- Compatible with any LLM that supports function/tool calling\n- Reference implementation provided in Python with LangGraph and LlamaIndex adapters',
    7, 9, 'Technical',
    ARRAY['Research', 'Agents', 'Multi-Agent'],
    ARRAY['Agent Orchestration', 'Tool Integration'],
    '[
      {"step": 1, "description": "Install the reference implementation", "code": "pip install reactplus", "link": "https://github.com/example/reactplus"},
      {"step": 2, "description": "Wrap your existing ReAct agent", "code": "from reactplus import ParallelReActAgent\nagent = ParallelReActAgent(tools=your_tools, llm=your_llm)", "link": null}
    ]'::jsonb,
    '2026-04-07T08:00:00Z', TRUE
  ) RETURNING id INTO a4;

  -- Article 5
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://deepmind.google/research/gemini-2-5-pro-tool-use',
    'deepmind',
    'Gemini 2.5 Pro: Native Code Execution and Improved Multi-Step Tool Use',
    E'## What Changed\n\nGemini 2.5 Pro adds a native code execution environment (Python, JavaScript) that runs inside the model call, returning stdout/stderr as structured output. No separate sandbox needed.\n\n## Key Changes for Developers\n\n- New `code_execution` tool type, enabled per request\n- Execution is sandboxed; no network access, max 30s runtime\n- Available via `google-generativeai` SDK ≥ 0.8 and Vertex AI',
    7, 7, 'Technical',
    ARRAY['Dev-Tools', 'Agents'],
    ARRAY['Code Generation', 'Agent Orchestration'],
    '[
      {"step": 1, "description": "Enable code execution in your Gemini request", "code": "import google.generativeai as genai\nmodel = genai.GenerativeModel(\"gemini-2.5-pro\")\nresponse = model.generate_content(\n  prompt,\n  tools=[{\"code_execution\": {}}]\n)", "link": null}
    ]'::jsonb,
    '2026-04-06T16:00:00Z', TRUE
  ) RETURNING id INTO a5;

  -- Article 6
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://www.anthropic.com/news/model-context-protocol-1-0',
    'anthropic',
    'Model Context Protocol (MCP) 1.0: Standardized Tool and Resource API for LLM Agents',
    E'## What Changed\n\nAnthropic published MCP 1.0, a JSON-RPC 2.0-based protocol for connecting LLMs to external tools and resources in a vendor-neutral way. Claude natively supports MCP servers; LangChain and LlamaIndex adapters available.\n\n## Why This Matters\n\nMCP decouples tool implementation from agent framework, meaning you write a tool once and use it with Claude, GPT-4, Gemini, or any MCP-compatible agent.',
    9, 8, 'Technical',
    ARRAY['Dev-Tools', 'Agents', 'Multi-Agent'],
    ARRAY['Tool Integration', 'Agent Orchestration'],
    '[
      {"step": 1, "description": "Install the MCP Python SDK", "code": "pip install mcp", "link": "https://modelcontextprotocol.io"},
      {"step": 2, "description": "Expose a tool as an MCP server", "code": "from mcp.server import Server\nfrom mcp.server.stdio import stdio_server\n\nserver = Server(\"my-tool\")\n\n@server.tool()\ndef search(query: str) -> str:\n    return do_search(query)\n\nasync def main():\n    async with stdio_server() as (read, write):\n        await server.run(read, write)", "link": null}
    ]'::jsonb,
    '2026-04-05T10:00:00Z', TRUE
  ) RETURNING id INTO a6;

  -- Article 7
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://arxiv.org/abs/2404.00002',
    'arxiv',
    'GraphRAG v2: Query-Focused Summarization Over Knowledge Graphs at Scale',
    E'## Summary\n\nMicrosoft Research published GraphRAG v2, extending their graph-based RAG approach with incremental graph updates (no full rebuild on new documents) and a new local-query mode that avoids global community summarization costs.\n\n## Performance\n\n- Incremental indexing: 10× faster than full rebuild for documents < 20% of corpus size\n- Local query cost: 80% lower than global mode with < 5% quality degradation on benchmarks',
    8, 9, 'Technical',
    ARRAY['RAG', 'Research', 'Embeddings'],
    ARRAY['RAG Pipelines', 'Knowledge Bases'],
    '[
      {"step": 1, "description": "Upgrade graphrag", "code": "pip install graphrag>=2.0", "link": "https://github.com/microsoft/graphrag"},
      {"step": 2, "description": "Enable incremental indexing in config", "code": "# graphrag_config.yaml\nincremental: true\nquery_mode: local  # cheaper than global", "link": null}
    ]'::jsonb,
    '2026-04-04T12:00:00Z', TRUE
  ) RETURNING id INTO a7;

  -- Article 8
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://openai.com/blog/gpt-4-1-api',
    'openai',
    'GPT-4.1: 1M Token Context, 50% Cost Reduction, and JSON Mode Improvements',
    E'## What Changed\n\nOpenAI released GPT-4.1 with a 1M token context window via the API, a 50% price reduction vs GPT-4-turbo, and a new `strict` JSON mode that guarantees schema adherence.\n\n## Migration Notes\n\n- Model ID: `gpt-4.1` (not `gpt-4-1`)\n- Old `response_format: {"type": "json_object"}` still works; new `"strict": true` flag enforces schema\n- Context window > 128K requires opt-in parameter `allow_long_context: true`',
    8, 7, 'Technical',
    ARRAY['LLM-Release', 'Dev-Tools'],
    ARRAY['LLM Integration', 'Structured Output Pipelines'],
    '[
      {"step": 1, "description": "Switch to gpt-4.1", "code": "response = client.chat.completions.create(\n  model=\"gpt-4.1\",\n  messages=messages,\n  response_format={\"type\": \"json_schema\", \"json_schema\": schema, \"strict\": True}\n)", "link": null}
    ]'::jsonb,
    '2026-04-03T09:00:00Z', TRUE
  ) RETURNING id INTO a8;

  -- Article 9
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://arxiv.org/abs/2404.00003',
    'arxiv',
    'Mixture-of-Agents: Routing LLM Calls to Specialized Sub-Models at Inference Time',
    E'## Summary\n\nThis paper proposes Mixture-of-Agents (MoA), a routing layer that dispatches subtasks to specialized models based on task classification, then merges outputs via a coordinator LLM. Achieves GPT-4 quality at 40% cost on MMLU and HumanEval.\n\n## Implementation Pattern\n\nThe coordinator classifies the task (code, math, language, reasoning) and routes to the best-performing cheap model for that category.',
    7, 8, 'Technical',
    ARRAY['Research', 'Multi-Agent', 'Agents'],
    ARRAY['Cost Optimization', 'Agent Orchestration'],
    '[
      {"step": 1, "description": "Install the reference router", "code": "pip install moa-router", "link": "https://github.com/example/moa-router"}
    ]'::jsonb,
    '2026-04-02T15:00:00Z', TRUE
  ) RETURNING id INTO a9;

  -- Article 10
  INSERT INTO news_items (
    source_url, source_name, title, technical_summary,
    impact_score, depth_score, category, tags,
    affected_workflows, implementation_steps, published_at, is_filtered
  ) VALUES (
    'https://supabase.com/blog/pgvector-0-8-ivfflat-improvements',
    'anthropic',
    'pgvector 0.8: 3× Faster IVFFlat Queries and Parallel Index Builds',
    E'## What Changed\n\npgvector 0.8 brings significant performance improvements to IVFFlat: 3× faster approximate nearest-neighbor queries via SIMD instructions and parallel index builds that no longer block writes.\n\n## Key Changes for Developers\n\n- No API changes — upgrade is transparent\n- Supabase projects auto-upgraded on next restart\n- For self-hosted: `ALTER EXTENSION vector UPDATE;` then `REINDEX INDEX CONCURRENTLY your_vector_index;`',
    7, 6, 'Technical',
    ARRAY['Embeddings', 'Dev-Tools', 'RAG'],
    ARRAY['Vector Databases', 'RAG Pipelines', 'Semantic Search'],
    '[
      {"step": 1, "description": "Update pgvector (self-hosted)", "code": "ALTER EXTENSION vector UPDATE;\nREINDEX INDEX CONCURRENTLY news_items_embedding_idx;", "link": "https://github.com/pgvector/pgvector/releases/tag/v0.8.0"}
    ]'::jsonb,
    '2026-04-01T10:00:00Z', TRUE
  ) RETURNING id INTO a10;

  -- Associate tags via news_item_tags join table

  -- Article 1: Claude, LLM-Release, Dev-Tools
  INSERT INTO news_item_tags VALUES (a1, claude_id), (a1, llmrelease_id), (a1, devtools_id);
  -- Article 2: LangGraph, Agents, Multi-Agent
  INSERT INTO news_item_tags VALUES (a2, langgraph_id), (a2, agents_id), (a2, multiagent_id);
  -- Article 3: Embeddings, RAG, Dev-Tools
  INSERT INTO news_item_tags VALUES (a3, embeddings_id), (a3, rag_id), (a3, devtools_id);
  -- Article 4: Research, Agents, Multi-Agent
  INSERT INTO news_item_tags VALUES (a4, research_id), (a4, agents_id), (a4, multiagent_id);
  -- Article 5: Dev-Tools, Agents
  INSERT INTO news_item_tags VALUES (a5, devtools_id), (a5, agents_id);
  -- Article 6: Dev-Tools, Agents, Multi-Agent
  INSERT INTO news_item_tags VALUES (a6, devtools_id), (a6, agents_id), (a6, multiagent_id);
  -- Article 7: RAG, Research, Embeddings
  INSERT INTO news_item_tags VALUES (a7, rag_id), (a7, research_id), (a7, embeddings_id);
  -- Article 8: LLM-Release, Dev-Tools
  INSERT INTO news_item_tags VALUES (a8, llmrelease_id), (a8, devtools_id);
  -- Article 9: Research, Multi-Agent, Agents
  INSERT INTO news_item_tags VALUES (a9, research_id), (a9, multiagent_id), (a9, agents_id);
  -- Article 10: Embeddings, Dev-Tools, RAG
  INSERT INTO news_item_tags VALUES (a10, embeddings_id), (a10, devtools_id), (a10, rag_id);
END $$;
