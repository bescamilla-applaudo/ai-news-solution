---
description: "Use when: modifying the LangGraph pipeline, adding new pipeline nodes, changing article processing logic, or working with ModelPool/OpenRouter LLM calls."
applyTo: "worker/pipeline/**/*.py"
---
# Pipeline Standards

## LangGraph Architecture
The pipeline is a 7-node directed graph in `worker/pipeline/graph.py`:
```
categorizer → evaluator → summarizer → embedder → storage
                                                  ↘ discard
                                               error (catches exceptions)
```

## ModelPool
- 3 pools × 3 models each. Defined in `graph.py`.
- Categorizer pool: `gemma-4-31b-it`, `nemotron-nano-9b-v2`, `nemotron-3-nano-30b-a3b`.
- Evaluator/Summarizer pools: `nemotron-3-super-120b-a12b`, `gpt-oss-120b`, `minimax-m2.5`.
- On rate limit (429), ModelPool rotates to next model automatically.
- On daily token cap (`DAILY_TOKEN_CAP` env var), raises `DailyTokenCapExceeded`.

## Adding a New Node
1. Define the node function with `state: ArticleState` parameter.
2. Add it to the graph with `graph.add_node("node_name", node_fn)`.
3. Connect edges: `graph.add_edge("previous", "node_name")`.
4. Add conditional edges if routing is needed.
5. Write tests in `worker/tests/pipeline/`.

## LLM Prompt Design
- Keep prompts in the node functions (not separate files) for now.
- System prompts must enforce the "technical AI only" filter.
- Use structured output (JSON with schema) for categorization and scoring.
- Log token usage to `llm_usage_log` table for monitoring.

## Testing
- Mock LLM calls — never make real OpenRouter requests in tests.
- Categorizer accuracy tests (`test_categorizer.py`) DO use real API calls and require `OPENROUTER_API_KEY`.
- Daily cap tests (`test_daily_cap.py`) are fully mocked.
