# AI News Intelligence Platform — Guía Técnica Completa

> **Autor:** Bryan Escamilla — Applaudo Studios  
> **Última actualización:** Abril 2026  
> **Propósito:** Documento de referencia integral para entender, explicar y presentar el proyecto a nivel técnico, arquitectónico y profesional.

---

## Tabla de Contenidos

1. [¿Qué es este proyecto?](#1-qué-es-este-proyecto)
2. [Problema que resuelve](#2-problema-que-resuelve)
3. [Stack tecnológico y justificación](#3-stack-tecnológico-y-justificación)
4. [Arquitectura del sistema](#4-arquitectura-del-sistema)
5. [Flujo de datos completo (End-to-End)](#5-flujo-de-datos-completo-end-to-end)
6. [Pipeline agentico (LangGraph)](#6-pipeline-agentico-langgraph)
7. [Frontend: rutas, componentes y UX](#7-frontend-rutas-componentes-y-ux)
8. [Base de datos y modelo de datos](#8-base-de-datos-y-modelo-de-datos)
9. [Búsqueda semántica (pgvector)](#9-búsqueda-semántica-pgvector)
10. [Modelo de seguridad](#10-modelo-de-seguridad)
11. [Resiliencia y manejo de errores](#11-resiliencia-y-manejo-de-errores)
12. [Costos operativos](#12-costos-operativos)
13. [Decisiones de diseño clave](#13-decisiones-de-diseño-clave)
14. [Estructura del código fuente](#14-estructura-del-código-fuente)
15. [Testing y calidad](#15-testing-y-calidad)
16. [Despliegue y CI/CD](#16-despliegue-y-cicd)
17. [Glosario](#17-glosario)

---

## 1. ¿Qué es este proyecto?

Una plataforma de inteligencia de noticias de IA que **automáticamente:**

1. **Recolecta** artículos de 5 fuentes públicas (HuggingFace, OpenAI, DeepMind, Arxiv, Hacker News)
2. **Filtra ruido** con un pipeline agentico multi-LLM — descarta contenido financiero, político y genérico
3. **Enriquece** artículos técnicos con puntuaciones de impacto, resúmenes Markdown, pasos de implementación con código, y tags
4. **Indexa** semánticamente con embeddings vectoriales para búsqueda por similitud
5. **Presenta** todo en un dashboard moderno con búsqueda semántica via Cmd+K, watchlist personalizado, y visualización de uso de tokens

**En una frase:** Un feed de noticias inteligente que solo muestra lo que importa a un desarrollador full-stack, con resúmenes técnicos generados por IA — y cuesta $0 en LLM/embeddings.

---

## 2. Problema que resuelve

| Problema | Solución |
|----------|----------|
| Sobrecarga informativa: 100+ artículos/día de IA, 90% ruido | Noise filter agentico con ≥95% accuracy (Technical vs. no-Technical) |
| Artículos sin contexto práctico | Resúmenes técnicos enfocados en "qué cambió" + pasos de implementación con código |
| No hay forma de buscar "artículos similares a X" | Búsqueda semántica con pgvector (384 dims, cosine similarity) |
| APIs de LLM son caras | 100% modelos gratuitos via OpenRouter + embeddings locales |
| Complejidad de pipeline ML en producción | LangGraph + Celery para orquestación resiliente con retries |

---

## 3. Stack tecnológico y justificación

### Frontend & API

| Tecnología | Versión | ¿Por qué? |
|------------|---------|-----------|
| **Next.js** (App Router) | 16.2+ | Server Components para SEO + API Routes en el mismo repo. Turbopack para builds rápidos. |
| **React** | 19 | Server Components nativos, mejor streaming. |
| **TypeScript** | 5.x | Type safety desde la DB hasta el UI. |
| **Tailwind CSS** | v4 | Dark mode por defecto. Utility-first. |
| **Shadcn/UI** (@base-ui/react) | Latest | Componentes accesibles y personalizables sin lock-in. |
| **TanStack React Query** | v5 | Caching de servidor, optimistic updates, infinite scroll. |
| **react-markdown + Shiki** | Latest | Syntax highlighting seguro sin `dangerouslySetInnerHTML`. |

### Pipeline Agentico (Python Worker)

| Tecnología | ¿Por qué? |
|------------|-----------|
| **Python 3.11** | Ecosistema ML/LLM líder. |
| **LangGraph** | Grafos dirigidos con estado para pipelines multi-nodo. Retry/fallback edges. Tipado fuerte con TypedDict. |
| **OpenRouter** (OpenAI SDK) | Modelos LLM gratuitos (Gemma 4 31B, Nemotron 120B). API compatible con OpenAI — hotswap sin cambiar código. |
| **sentence-transformers** | Embeddings locales (all-MiniLM-L6-v2, 384 dims). $0, offline, sin API key. |
| **PyTorch CPU-only** | Reduce imagen Docker en ~3 GB vs build CUDA. No hay GPU disponible. |
| **Celery + Redis** | Cola distribuida con retries exponenciales, concurrencia configurable, persistencia de jobs. |
| **APScheduler** | Cron in-process para polling de sources (30-60 min). |
| **bleach + defusedxml** | Sanitización de HTML/RSS antes de enviar a LLMs. Protección contra XML bombs. |

### Infraestructura

| Servicio | Costo | Hosting |
|----------|-------|---------|
| **Supabase** (PostgreSQL 15 + pgvector) | $0 | Free tier (500 MB DB) |
| **Redis** | $0 | Docker local / Upstash (~$5/mo en prod) |
| **OpenRouter** (LLM inference) | **$0** | Free-tier models |
| **Embeddings** (sentence-transformers) | **$0** | Local, sin internet |
| **Vercel** (frontend) | $0 | Hobby plan |
| **Railway** (worker) | ~$5-10/mo | Docker container |
| **Total** | **~$5-10/month** | |

---

## 4. Arquitectura del sistema

### Vista macro

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FUENTES DE DATOS                                │
│  HuggingFace Blog │ OpenAI Blog │ DeepMind Blog │ Arxiv (cs.AI) │ HN        │
└────────┬──────────┴──────┬──────┴───────┬───────┴──────┬────────┴───────────┘
         │                 │              │              │
         ▼                 ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      SCRAPERS (APScheduler — Terminal 5)                     │
│  rss.py (HF, OpenAI, DeepMind) │ arxiv.py │ hn.py                          │
│  • Polling: 30-60 min          │          │                                  │
│  • Sanitización con bleach     │          │                                  │
│  • Deduplicación contra DB     │          │                                  │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ Celery .apply_async()
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      REDIS (Cola de tareas — Broker)                         │
│  127.0.0.1:6379                                                              │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ Celery worker consume
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│               LANGGRAPH PIPELINE (Celery Worker — Terminal 4)                │
│                                                                              │
│  ┌─────────────┐    ┌────────────┐    ┌─────────────┐    ┌───────────┐     │
│  │ Categorizer │───▶│ Evaluator  │───▶│ Summarizer  │───▶│ Embedder  │     │
│  │ (Gemma 31B) │    │(Nemotron   │    │(Nemotron    │    │(MiniLM-L6 │     │
│  │   FREE $0   │    │ 120B) FREE │    │ 120B) FREE  │    │  local)   │     │
│  └──────┬──────┘    └────────────┘    └─────────────┘    └─────┬─────┘     │
│         │                                                      │            │
│    Non-Technical                                          Technical         │
│         │                                                      │            │
│         ▼                                                      ▼            │
│  ┌──────────────┐                                    ┌──────────────┐      │
│  │ discard_node │                                    │ storage_node │      │
│  │is_filtered=F │                                    │is_filtered=T │      │
│  └──────────────┘                                    └──────────────┘      │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ Upsert
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              SUPABASE (PostgreSQL 15 + pgvector — Terminal 1)                │
│                                                                              │
│  news_items (artículos + embeddings 384D + metadata)                        │
│  tech_tags / news_item_tags (taxonomía controlada)                          │
│  user_watchlist (single-owner)                                               │
│  llm_usage_log (telemetría de tokens)                                       │
│                                                                              │
│  RPC: match_articles() — búsqueda semántica por cosine similarity           │
│                                                                              │
│  Puerto: 127.0.0.1:54321 (API) │ :54322 (PostgreSQL directo)                │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ Supabase SDK queries
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              NEXT.JS FRONTEND + API ROUTES (Terminal 2)                       │
│                                                                              │
│  API Layer:                                                                  │
│    /api/news         → Feed paginado (impact_score DESC)                    │
│    /api/search       → Embed query → pgvector similarity                    │
│    /api/article/[id] → Artículo individual                                  │
│    /api/article/[id]/related → Top 5 por similitud vectorial                │
│    /api/watchlist    → GET/POST/DELETE (OWNER_ID='owner')                   │
│    /api/admin/usage  → Telemetría de tokens LLM                             │
│                                                                              │
│  UI Layer:                                                                   │
│    /              → NewsFeed (infinite scroll + tag filter)                  │
│    /article/[id]  → Detalle técnico + CodeBlock + related                   │
│    /search        → Búsqueda semántica                                       │
│    /watchlist     → Lista personalizada por tags                             │
│    /admin/usage   → Dashboard de costos LLM                                 │
│                                                                              │
│  Puerto: localhost:3000                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                   ▲
┌──────────────────────────────────┴───────────────────────────────────────────┐
│              EMBED SERVER (Terminal 3)                                        │
│                                                                              │
│  worker/embed_server.py — HTTP server stdlib                                 │
│  POST /embed {"text":"..."} → {"embedding": [384 floats]}                   │
│  GET  /health             → {"ok": true, "model": "all-MiniLM-L6-v2"}      │
│                                                                              │
│  Modelo: all-MiniLM-L6-v2 (~80 MB, lazy-loaded, en memoria)                │
│  Puerto: 127.0.0.1:8001                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Principio de diseño: Modular Monolith

El frontend y el worker **no se comunican directamente** — la base de datos es el único punto de integración. Esto permite:

- Escalar el worker independientemente del frontend
- Reemplazar el worker (ej: migrar de LangGraph a CrewAI) sin tocar el frontend
- Desplegar frontend en Vercel y worker en Railway sin acoplamiento

---

## 5. Flujo de datos completo (End-to-End)

### Flujo de ingestión (artículo nuevo → dashboard)

```
Tiempo    Acción                                    Componente
──────    ──────                                    ──────────
t+0       APScheduler dispara job de scraping       main.py
t+1s      Scraper fetches RSS/API de HuggingFace    rss.py
t+2s      bleach limpia HTML del contenido          rss.py
t+3s      Deduplicación: ¿URL ya existe en DB?      main.py → Supabase
t+4s      Artículo nuevo → Celery task enqueue      process_article.apply_async()
t+5s      Redis recibe task                         Redis broker
t+6s      Celery worker consume task                process_article.py
t+7s      ¿Token cap diario excedido? → skip        process_article.py
t+8s      LangGraph pipeline inicia                 graph.py
t+9s      categorizer_node (Gemma 31B via OpenRouter)
          → "¿Es técnico?" Responde: "Technical"
t+12s     evaluator_node (Nemotron 120B)
          → depth=8, impact=9, tags=["RAG","LangGraph"]
          → workflows=["Agent Orchestration","RAG Pipelines"]
t+20s     summarizer_node (Nemotron 120B)
          → Markdown summary (400-800 palabras)
          → 3 implementation steps con código extraído
t+22s     embedder_node (all-MiniLM-L6-v2 local)
          → 384-dim vector
t+23s     storage_node
          → Upsert en news_items (is_filtered=TRUE)
          → Insert en news_item_tags (junction)
          → Log tokens en llm_usage_log
t+24s     ✅ Artículo visible en dashboard (siguiente refresh)
```

### Flujo de búsqueda semántica

```
Usuario escribe "RAG pipelines with LangGraph" en Cmd+K
          │
          ▼ (300ms debounce)
Frontend: fetch("/api/search?q=RAG pipelines with LangGraph")
          │
          ▼
API Route /api/search:
  1. POST http://localhost:8001/embed {"text": "RAG pipelines with LangGraph"}
  2. Embed server retorna [0.023, -0.041, ...] (384 floats)
  3. supabase.rpc("match_articles", {query_embedding, match_count: 10})
          │
          ▼
PostgreSQL:
  SELECT *, 1 - (embedding <=> query_embedding) AS similarity
  FROM news_items
  WHERE is_filtered = TRUE AND archived = FALSE
  ORDER BY embedding <=> query_embedding
  LIMIT 10
          │
          ▼
Frontend muestra 10 resultados ordenados por similitud (89%, 84%, 79%...)
```

### Flujo de artículos relacionados

```
Usuario abre /article/abc-123
          │
          ▼
Server Component (page.tsx):
  1. getArticle(id) → supabase.from("news_items").select("*").eq("id", id)
  2. getRelated(id) → usa el embedding del artículo actual
     → supabase.rpc("match_articles", {query_embedding: article.embedding, filter_id: id})
          │
          ▼
Sidebar muestra 5 artículos más similares (excluyendo el actual)
```

---

## 6. Pipeline agentico (LangGraph)

### Topología del grafo

```
START ──────▶ categorizer_node
                    │
            ┌───────┴───────┐
            │               │
       Technical       Non-Technical
            │               │
            ▼               ▼
     evaluator_node    discard_node ──▶ END
            │
            ▼
     summarizer_node
            │
            ▼
      embedder_node
            │
            ▼
      storage_node ──▶ END

  Cualquier excepción ──▶ error_node ──▶ Celery RetryError
```

### Detalle de cada nodo

#### `categorizer_node` — Noise Filter

| Propiedad | Valor |
|-----------|-------|
| **Modelo** | `google/gemma-4-31b-it:free` via OpenRouter |
| **Costo** | $0 |
| **Input** | Título + primeros 500 caracteres del contenido |
| **Output** | Una palabra: `Technical`, `Financial`, `Political`, o `General` |
| **Max tokens** | 10 |
| **Prompt** | Reglas claras: Technical = LLM internals, frameworks, código, APIs, benchmarks, model releases. Financial = rounds, valuaciones. Political = regulación, policy. General = todo lo demás. |
| **Fallback** | Si la respuesta no es una categoría válida → `General` |
| **Accuracy medida** | ≥95% en suite de 20 artículos (10 técnicos, 10 no-técnicos) |

#### `evaluator_node` — Scoring & Tagging

| Propiedad | Valor |
|-----------|-------|
| **Modelo** | `nvidia/nemotron-3-super-120b-a12b:free` via OpenRouter |
| **Solo ejecuta** | Artículos con category=`Technical` |
| **Output** | JSON: `{depth_score, impact_score, affected_workflows, tags}` |
| **Scores** | 1-10 (clamped). Impact = cuánto afecta workflows dev. Depth = complejidad técnica. |
| **Tags** | Filtrado contra vocabulario controlado: Multi-Agent, LLM-Release, RAG, Dev-Tools, Research, Methodologies, LangGraph, Claude, Agents, Embeddings |
| **Workflows** | Hasta 4 strings: "RAG Pipelines", "Agent Orchestration", etc. |

#### `summarizer_node` — Technical Summary

| Propiedad | Valor |
|-----------|-------|
| **Modelo** | `nvidia/nemotron-3-super-120b-a12b:free` |
| **Output** | JSON: `{technical_summary (Markdown), implementation_steps}` |
| **Summary** | Enfocado en "qué cambió" y "qué necesitan saber los devs" |
| **Steps** | Hasta 5 pasos con `{step, description, code, link}` |
| **Seguridad** | El código en `code` se **valida contra raw_content** — si el snippet no existe literalmente en el artículo, se anula (`code: null`). Esto previene alucinaciones de código. |

#### `embedder_node` — Vector Generation

| Propiedad | Valor |
|-----------|-------|
| **Modelo** | `all-MiniLM-L6-v2` (sentence-transformers, local) |
| **Dimensiones** | 384 |
| **Input** | `technical_summary` (truncado) |
| **Normalización** | `normalize_embeddings=True` |
| **Costo** | $0, sin red, ~200ms/artículo en CPU |

#### `storage_node` / `discard_node`

- **storage_node**: Upsert en `news_items` con `is_filtered=TRUE` + insertar tags en junction + log de tokens
- **discard_node**: Insert con `is_filtered=FALSE`, categoria original. **No se pierde** — queda para auditoría. Limpiado automáticamente a los 30 días.

### Parser JSON resiliente

```python
def _parse_llm_json(text: str) -> dict:
    """
    Los LLMs a veces envuelven JSON en ```json ... ```, o agregan texto
    antes/después. Este parser:
    1. Stripea markdown code fences
    2. Encuentra { ... } en texto mixto
    3. Parsea con json.loads()
    """
```

### Retry con backoff en rate limits

```python
def _openrouter_chat(*, model, messages, max_tokens):
    """
    Wrapper que reintenta hasta 4x en HTTP 429 (rate limit):
    Intento 1: inmediato
    Intento 2: espera 5s
    Intento 3: espera 10s
    Intento 4: espera 20s
    Si falla 4 veces: raise exception → error_node → Celery retry
    """
```

---

## 7. Frontend: rutas, componentes y UX

### Mapa de rutas

| Ruta | Tipo | Descripción |
|------|------|-------------|
| `/` | Server + Client | Feed principal. Infinite scroll. Filtro por tags. Cmd+K para búsqueda. |
| `/article/[id]` | Server Component | Detalle completo: summary Markdown, score chips, steps accordion, código con syntax highlighting, artículos relacionados. |
| `/search?q=...` | Client Component | Búsqueda semántica. Input con 300ms debounce. Resultados por similitud. |
| `/watchlist` | Server + Client | Feed personalizado por tags. Toggle tags con optimistic updates. |
| `/admin/usage` | Server Component | Dashboard de uso de tokens LLM por día y modelo. |

### Componentes clave

#### `NewsFeed` — Feed con infinite scroll

```
useInfiniteQuery("news", fetchPage)
  │
  ├─ Página 0,1,2... → GET /api/news?page=X&tag=Y
  ├─ 20 artículos por página
  ├─ Máximo 20 páginas (400 artículos)
  ├─ Ordenado por impact_score DESC, published_at DESC
  └─ Scroll listener → fetchNextPage() al llegar al fondo
```

- **Filtro por tags:** Client-side. Click en un tag → re-query con `.contains("tags", [tag])`.
- **Estado vacío:** Skeleton cards mientras carga.

#### `ArticleCard` — Tarjeta de artículo

Muestra:
- **Título** (link a `/article/[id]`)
- **Badge de source** (coloreado: huggingface=yellow, openai=green, arxiv=blue, deepmind=violet, hn=amber)
- **Score bars** — Impact y Depth (1-10). Color coding: 1-4=zinc, 5-7=amber, 8-10=emerald
- **Top 3 tags** como pills
- **Tiempo relativo** ("Just now", "2h ago", "Apr 15")
- **Link al artículo original** (source_url)

#### `CodeBlock` — Código con syntax highlighting

- Motor: **Shiki** con tema `github-dark`
- Renderizado: `hast-util-to-jsx-runtime` → genera JSX tree, no HTML string
- **Seguridad:** Nunca usa `dangerouslySetInnerHTML`. Elimina vector XSS.
- Detección de lenguaje: json, python, typescript, bash, sql

#### `CommandPalette` — Búsqueda global (Cmd+K)

- Atajos: `Cmd+K` (Mac) / `Ctrl+K` (Linux/Windows)
- 300ms debounce → `GET /api/search?q=...`
- Basado en Shadcn CommandDialog
- **AbortController:** Cada keystroke cancela la request anterior via `AbortController.abort()`, eliminando race conditions de requests obsoletos
- **Degradación graceful:** Si el embed server no está disponible (HTTP 503), muestra estado de error

#### `WatchlistManager` — Gestión de tecnologías seguidas

- Lista de todos los tags con toggles
- **Per-tag inflight tracking:** Cada tag tiene su propio estado de carga (via `Set<string>`). Solo el botón del tag en vuelo se deshabilita, no todos.
- **Optimistic updates:** Toggle → actualiza UI inmediatamente → API call → rollback si falla
- API: `POST/DELETE /api/watchlist` con body `{tag_id, user_id: "owner"}`

### API Routes

| Ruta | Método | Query | Respuesta |
|------|--------|-------|-----------|
| `/api/news` | GET | `page`, `tag`, `limit` | Artículos paginados (is_filtered=TRUE) |
| `/api/search` | GET | `q` | Top 10 por similitud semántica |
| `/api/article/[id]` | GET | — | Artículo con tags joinados |
| `/api/article/[id]/related` | GET | — | Top 5 artículos similares |
| `/api/watchlist` | GET/POST/DELETE | `tag_id` | Watchlist del owner |
| `/api/admin/usage` | GET | — | Uso de tokens por día y modelo |

---

## 8. Base de datos y modelo de datos

### Diagrama entidad-relación

```
┌────────────────────────────────┐     ┌──────────────┐
│          news_items            │     │  tech_tags   │
├────────────────────────────────┤     ├──────────────┤
│ id (UUID) PK                   │     │ id (UUID) PK │
│ source_url (TEXT) UNIQUE       │     │ name (TEXT)  │
│ source_name (TEXT)             │     │ category     │
│ title (TEXT)                   │     └──────┬───────┘
│ raw_content (TEXT)             │            │
│ technical_summary (TEXT)       │            │ N:M
│ impact_score (SMALLINT 1-10)  │            │
│ depth_score (SMALLINT 1-10)   │     ┌──────┴───────────┐
│ implementation_steps (JSONB)   │     │ news_item_tags   │
│ affected_workflows (TEXT[])    │     ├──────────────────┤
│ embedding VECTOR(384)          │◀────│ news_item_id FK  │
│ category (TEXT)                │     │ tech_tag_id FK   │
│ tags (TEXT[])                  │     └──────────────────┘
│ published_at (TIMESTAMPTZ)     │
│ ingested_at (TIMESTAMPTZ)      │     ┌──────────────────┐
│ is_filtered (BOOLEAN)          │     │ user_watchlist    │
│ archived (BOOLEAN)             │     ├──────────────────┤
└────────────────────────────────┘     │ user_id (TEXT)   │
                                        │ tech_tag_id FK   │
┌────────────────────────────────┐     │ created_at       │
│        llm_usage_log           │     └──────────────────┘
├────────────────────────────────┤
│ id (UUID) PK                   │     ┌──────────────────────┐
│ timestamp (TIMESTAMPTZ)        │     │ email_subscriptions  │
│ model (TEXT)                   │     ├──────────────────────┤
│ input_tokens (INT)             │     │ user_id (TEXT) PK    │
│ output_tokens (INT)            │     │ email (TEXT)         │
│ job_id (TEXT)                  │     │ active (BOOLEAN)     │
└────────────────────────────────┘     └──────────────────────┘
```

### Columnas clave de `news_items`

| Columna | Tipo | Significado |
|---------|------|-------------|
| `source_url` | TEXT UNIQUE | **Clave de deduplicación.** Si un artículo se scrapea 2 veces, el upsert lo ignora. |
| `is_filtered` | BOOLEAN | `TRUE` = pasó el noise filter, visible en el dashboard. `FALSE` = descartado, no visible, limpiado a los 30 días. |
| `archived` | BOOLEAN | `TRUE` = soft-archived por retención (>6 meses). No se muestra pero no se borra. |
| `embedding` | VECTOR(384) | Embedding de `technical_summary` generado por all-MiniLM-L6-v2. Usado para búsqueda semántica y artículos relacionados. |
| `implementation_steps` | JSONB | Array de objetos `{step, description, code, link}`. El código se valida contra el artículo original. |

### Índices

```sql
-- Búsqueda semántica (IVFFlat, 100 listas, coseno)
CREATE INDEX news_items_embedding_idx ON news_items
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Queries frecuentes
CREATE INDEX news_items_filtered_published_idx ON news_items (is_filtered, published_at DESC);
CREATE INDEX news_items_impact_score_idx ON news_items (impact_score DESC);
```

### Row Level Security (RLS)

| Tabla | Política | Detalle |
|-------|----------|---------|
| `news_items` | `public_read_filtered` | SELECT solo donde `is_filtered = TRUE`. El cliente nunca ve artículos descartados. |
| `tech_tags` | `public_read` | Lectura completa. |
| `user_watchlist` | Service role only | API routes usan service key. Sin acceso directo del cliente. |
| `llm_usage_log` | Service role only | Solo escritura desde el worker. |

### Retención automática

| Política | Retención | Ejecución |
|----------|-----------|-----------|
| Artículos descartados (`is_filtered = FALSE`) | 30 días | Diario a las 03:00 UTC |
| Logs de tokens LLM | 90 días | Diario a las 03:00 UTC |
| Artículos antiguos | Archived después de 6 meses (soft delete) | Diario a las 03:00 UTC |

---

## 9. Búsqueda semántica (pgvector)

### ¿Cómo funciona?

1. **Indexación:** Cada artículo técnico recibe un embedding de 384 dimensiones generado por `all-MiniLM-L6-v2` a partir de su `technical_summary`.
2. **Búsqueda:** El query del usuario se convierte a embedding en el embed server local (puerto 8001), y PostgreSQL calcula la distancia coseno contra todos los artículos.
3. **Resultado:** Los artículos más cercanos en el espacio vectorial son los más relevantes semánticamente.

### Función RPC

```sql
-- Retorna los N artículos más similares al query embedding
SELECT id, title, 1 - (embedding <=> query_embedding) AS similarity
FROM news_items
WHERE is_filtered = TRUE AND archived = FALSE
ORDER BY embedding <=> query_embedding
LIMIT match_count;
```

### ¿Por qué 384 dimensiones y no 1536?

| Modelo | Dims | Tamaño | Costo | MTEB Score |
|--------|------|--------|-------|-----------|
| all-MiniLM-L6-v2 | 384 | 80 MB | **$0** | 56.3 |
| text-embedding-3-small | 1536 | API | $0.02/1M tokens | 62.3 |
| text-embedding-3-large | 3072 | API | $0.13/1M tokens | 64.6 |

**Trade-off consciente:** 384 dims es suficiente para <10K artículos y búsqueda dentro de un dominio estrecho (noticias técnicas de IA). La diferencia de calidad es mínima en este caso de uso, y el costo es $0.

---

## 10. Modelo de seguridad

| Medida | Implementación |
|--------|----------------|
| **Aislamiento de API keys** | `OPENROUTER_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son server-side only. Nunca en `NEXT_PUBLIC_*`. |
| **Sanitización de input** | Todo HTML/RSS se limpia con `bleach.clean(tags=[], strip=True)` antes de LLMs. |
| **Protección XML** | Tamaño de respuesta RSS limitado a 2 MB. `defusedxml` previene XML bombs. |
| **Prevención XSS** | Código renderizado con `hast-util-to-jsx-runtime`, nunca `dangerouslySetInnerHTML`. |
| **Content-Security-Policy** | `default-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `connect-src 'self' https://*.supabase.co`, `frame-ancestors 'none'`. Bloquea XSS, clickjacking e inyección de recursos externos. |
| **Headers de seguridad** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. Camera, mic, geolocation denegados. |
| **Deployment guard** | `lib/guards.ts` — todas las API routes verifican que `SUPABASE_URL` y `SERVICE_ROLE_KEY` existen. Si no están configurados (deploy accidental), retornan HTTP 503 en vez de errores crípticos. |
| **Cache-Control** | API routes incluyen headers `Cache-Control` apropiados: `s-maxage=60` para news/search, `s-maxage=300` para articles, `no-store` para watchlist/admin. |
| **HMAC unsubscribe** | Weekly brief genera tokens HMAC-SHA256 para links de unsubscribe. Requiere `HMAC_SECRET` en env. |
| **Sanitización de errores** | Errores del server se loggean full; al cliente solo llegan mensajes genéricos. |
| **Red aislada** | Embed server y Redis ligados a `127.0.0.1`. Studio, Mailpit y Analytics excluidos del arranque. Worker en Docker corre como non-root. |
| **RLS** | Los clientes solo pueden leer artículos con `is_filtered = TRUE`. Escritura requiere service role key. |
| **Rate limiting** | HN scraper con `Semaphore(20)`. Infinite scroll tope 20 páginas. OpenRouter retry con backoff exponencial. |
| **Sin superficie de auth** | Diseño single-user elimina vectores de session fixation, JWT forgery y credential stuffing. |

---

## 11. Resiliencia y manejo de errores

### Capas de resilencia

```
Capa 1: _openrouter_chat() — Retry 4x con backoff (5s→10s→20s→40s) en HTTP 429
         │
Capa 2: LangGraph error_node — Atrapa excepciones de cualquier nodo → raise RetryError
         │
Capa 3: Celery task retry — max_retries=3, countdown exponencial (5s→10s→20s)
         │
Capa 4: Daily token cap — Si DAILY_TOKEN_CAP excedido, task se dropea silenciosamente
         │
Capa 5: Frontend — Si pipeline falla, dashboard sigue mostrando artículos cached
```

### Degradación graceful

| Escenario | Comportamiento |
|-----------|----------------|
| OpenRouter caído | Pipeline reintenta 4x, luego Celery reintenta 3x. Frontend no se afecta. |
| Embed server caído | `/api/search` retorna HTTP 503 con mensaje "Search unavailable". CommandPalette muestra estado de error. |
| Redis caído | Celery no puede encolar. Frontend sigue con artículos existentes. |
| Supabase caído | Todo se detiene. Pero Supabase local tiene ~99.9% uptime. |
| Rate limit diario agotado (50 req/día free) | Tasks se pausan hasta reset. Frontend no se afecta. |

---

## 12. Costos operativos

### Desglose mensual

| Servicio | Local | Producción | Notas |
|----------|-------|------------|-------|
| LLM inference (OpenRouter) | **$0** | **$0** | Modelos gratuitos: Gemma 4 31B + Nemotron 120B |
| Embeddings (sentence-transformers) | **$0** | **$0** | Local, no requiere internet |
| PostgreSQL + pgvector (Supabase) | $0 | $0 | Free tier: 500 MB, 2 GB egress |
| Redis | $0 | ~$5 | Local Docker / Upstash en prod |
| Frontend (Vercel) | — | $0 | Hobby plan |
| Worker container (Railway) | — | ~$5-10 | Docker |
| **Total** | **$0** | **~$5-10/mes** | |

### OpenRouter free tier — Límites

| Límite | Valor | Reset |
|--------|-------|-------|
| Requests por minuto | 16-20 | Cada minuto |
| Requests por día | 50 | Cada día a las 00:00 UTC |
| Upgrade | $10 de créditos → 1000 req/día | Inmediato |

> **Nota:** Con 50 req/día gratuitas y ~3 LLM calls por artículo (categorizer + evaluator + summarizer), se pueden procesar ~16 artículos técnicos/día. Artículos no-técnicos solo usan 1 call (categorizer), por lo que el throughput real es mayor.

---

## 13. Decisiones de diseño clave

### ¿Por qué sentence-transformers locales en vez de OpenAI Embeddings?

| Factor | Local (all-MiniLM-L6-v2) | OpenAI (text-embedding-3) |
|--------|--------------------------|---------------------------|
| Costo | $0 | $0.02-0.13/1M tokens |
| Latencia | <200ms (CPU local) | 200-500ms (API call) |
| Privacidad | Queries nunca salen de la máquina | Datos enviados a OpenAI |
| Offline | ✅ Funciona sin internet | ❌ Requiere internet |
| API key | No necesita | Sí, con billing |
| Calidad | Suficiente para <10K docs en dominio estrecho | Superior para dominio amplio |

**Decisión:** Para un proyecto personal con <10K artículos en un dominio estrecho (noticias de IA), la calidad de MiniLM es suficiente y el costo + privacidad no tienen comparación.

### ¿Por qué OpenRouter y no la API directa de cada modelo?

- **Acceso gratuito** a modelos como Gemma 4 31B y Nemotron 120B que normalmente cuestan
- **API OpenAI-compatible** — usa el SDK de OpenAI estándar, cambiar de modelo es cambiar un string
- **Sin tarjeta de crédito** — key gratuita inmediata
- **Hotswap:** Si OpenRouter desaparece, solo hay que cambiar `OPENROUTER_BASE_URL` a otro provider compatible

### ¿Por qué Modular Monolith (no microservicios)?

- **Complejidad proporcional:** Es un proyecto personal, no una plataforma multi-tenant con 100 devs
- **Deployment simple:** 2 deployments (Vercel + Railway) en vez de 6+ servicios
- **Base de datos como contrato:** Frontend y Worker se acoplan vía schema SQL, no APIs internas
- **Escalabilidad suficiente:** Celery puede escalar horizontalmente si el volumen crece

### ¿Por qué no autenticación?

- Es una herramienta personal (single-user)
- Se despliega en localhost (no expuesta a internet)
- `OWNER_ID = 'owner'` está hardcoded — no hay multi-tenancy
- Elimina toda una clase de vulnerabilidades: session fixation, JWT forgery, credential stuffing, CSRF

---

## 14. Estructura del código fuente

```
ai-news-solution/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root: dark mode, QueryProvider, Cmd+K listener
│   ├── page.tsx                  # / — NewsFeed + CommandPalette
│   ├── globals.css               # Tailwind v4 config
│   ├── article/[id]/page.tsx     # Detalle del artículo (Server Component)
│   ├── search/page.tsx           # Búsqueda semántica (Client Component)
│   ├── watchlist/page.tsx        # Feed personalizado + tag manager
│   ├── admin/usage/page.tsx      # Dashboard de tokens LLM
│   └── api/
│       ├── news/route.ts         # GET: feed paginado
│       ├── search/route.ts       # GET: embed → pgvector similarity
│       ├── article/[id]/
│       │   ├── route.ts          # GET: artículo individual
│       │   └── related/route.ts  # GET: top 5 similares
│       ├── watchlist/route.ts    # GET/POST/DELETE: watchlist
│       └── admin/usage/route.ts  # GET: uso de tokens
│
├── components/
│   ├── news-feed.tsx             # Infinite scroll con useInfiniteQuery
│   ├── article-card.tsx          # Tarjeta de artículo (scores, tags, time)
│   ├── code-block.tsx            # Syntax highlighting con Shiki (seguro)
│   ├── command-palette.tsx       # Cmd+K búsqueda global
│   ├── watchlist-manager.tsx     # Toggle de tags con optimistic updates
│   ├── providers/
│   │   └── query-provider.tsx    # TanStack React Query provider
│   └── ui/                      # Shadcn/UI primitives
│       ├── button.tsx, card.tsx, badge.tsx, dialog.tsx...
│
├── lib/
│   ├── guards.ts                 # Deployment guard: requireSupabase() → 503
│   ├── supabase.ts               # Singleton del cliente Supabase (service role)
│   ├── database.types.ts         # Tipos TypeScript generados del schema
│   └── utils.ts                  # cn() helper (clsx + tailwind-merge)
│
├── __tests__/api/                # Tests de API routes (vitest)
│   ├── search.test.ts            # 4 tests: queries, 503
│   ├── news.test.ts              # 3 tests: paginación, caching
│   └── watchlist.test.ts          # 6 tests: CRUD, validación
│
├── worker/                       # Pipeline Python
│   ├── main.py                   # Entry point: APScheduler + Celery startup
│   ├── celery_app.py             # Configuración de Celery (broker, retries)
│   ├── db.py                     # Cliente Supabase Python (service role)
│   ├── embed_server.py           # HTTP server local (puerto 8001)
│   ├── pipeline/
│   │   └── graph.py              # LangGraph pipeline completo (7 nodos)
│   ├── scrapers/
│   │   ├── rss.py                # RSS genérico (HF, OpenAI, DeepMind)
│   │   ├── arxiv.py              # Arxiv API (cs.AI, cs.CL)
│   │   ├── deepmind.py           # DeepMind blog RSS wrapper
│   │   └── hn.py                 # Hacker News Firebase API
│   ├── tasks/
│   │   ├── process_article.py    # Celery task → LangGraph pipeline
│   │   └── weekly_brief.py       # Email digest semanal (Resend)
│   ├── tests/
│   │   ├── scrapers/
│   │   │   ├── test_rss.py           # 6 tests: HTML strip, HTTP error, parsing
│   │   │   ├── test_hn.py            # 6 tests: keyword filter, HTTP error
│   │   │   └── test_arxiv.py         # 2 tests: HTTP error, Atom feed
│   │   ├── test_embed_server.py      # 5 tests: health, embed, 404
│   │   └── pipeline/
│   │       └── test_categorizer.py  # 20 fixtures, ≥95% accuracy target
│   ├── Dockerfile                # CPU-only PyTorch, HEALTHCHECK, non-root
│   ├── requirements.txt          # Pinned deps + CPU PyTorch index
│   └── .env                      # OPENROUTER_API_KEY, SUPABASE keys, Redis, HMAC_SECRET
│
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql   # Tablas, RLS, índices, RPC
│       ├── 0002_seed_articles.sql    # 10 artículos de ejemplo
│       └── 0003_embeddings_384.sql   # Migración de 1536→384 dims
│
├── setup-docker.sh               # Un comando para levantar infra
├── ARCHITECTURE.md               # Arquitectura técnica
├── RUNBOOK.md                    # Guía operativa paso a paso
├── GUIDE.md                      # ← Este documento
├── IMPROVEMENTS.md               # Plan de mejoras y scorecard
├── next.config.ts                # Security headers + CSP
├── vitest.config.ts              # Configuración de vitest (@ alias)
└── package.json                  # pnpm, scripts, dependencias frontend
```

---

## 15. Testing y calidad

### Tests del pipeline — Accuracy (Python, requiere API key)

**Archivo:** `worker/tests/pipeline/test_categorizer.py`

| Test | Qué valida | Target |
|------|-----------|--------|
| `test_technical_articles_are_classified_correctly` | 10 artículos técnicos reales → todos clasificados como "Technical" | ≥95% accuracy |
| `test_non_technical_articles_are_filtered_out` | 10 artículos no-técnicos (financieros, políticos, etc.) → ninguno clasificado como "Technical" | ≥95% accuracy |
| `test_overall_signal_accuracy` | Combinado de los 20 artículos | ≥95% accuracy |

**Ejecución:**
```bash
cd worker && source .venv/bin/activate
set -a && source .env && set +a  # cargar OPENROUTER_API_KEY
pytest tests/pipeline/ -v
```

> **Nota:** Estos tests hacen llamadas reales a OpenRouter (20 LLM calls). Pueden fallar por rate limits en el free tier (50 req/día). Los tests se skipean si `OPENROUTER_API_KEY` no está en el env.

### Tests unitarios del worker (Python, sin API key)

**Scrapers** (`worker/tests/scrapers/`):

| Archivo | Tests | Qué valida |
|---------|-------|------------|
| `test_rss.py` | 6 | `_strip_html` (tags, entidades, whitespace), `fetch_rss` (error HTTP, respuesta >2 MB, parsing RSS válido) |
| `test_hn.py` | 6 | `_is_relevant` (keywords técnicos), `fetch_hn` (error HTTP) |
| `test_arxiv.py` | 2 | Error HTTP y parsing de Atom feed válido |

**Embed server** (`worker/tests/test_embed_server.py`):

| Tests | Qué valida |
|-------|------------|
| 5 | `/health` 200 (modelo OK), `/health` 503 (modelo falla), `/embed` 200, ruta inválida 404 |

**Ejecución:**
```bash
cd worker && source .venv/bin/activate
pytest tests/scrapers/ tests/test_embed_server.py -v  # 19 tests, sin API key
```

### Tests del frontend (TypeScript, vitest)

**Archivos** (`__tests__/api/`):

| Archivo | Tests | Qué valida |
|---------|-------|------------|
| `search.test.ts` | 4 | Query vacío, query corto, query >200 chars → 400, embed down → 503 |
| `news.test.ts` | 3 | Metadata de paginación, header Cache-Control, page negativo clamped |
| `watchlist.test.ts` | 6 | GET retorna data + no-store, POST/DELETE sin tag_id → 400, tipo inválido, JSON inválido |

**Ejecución:**
```bash
pnpm test        # 13 tests con vitest
pnpm test:watch  # modo interactivo
```

### Calidad del frontend

| Check | Herramienta | Comando | Umbral |
|-------|-------------|---------|--------|
| Type safety | `tsc --noEmit` | `pnpm typecheck` | 0 errores |
| Linting | ESLint 9 | `pnpm lint` | 0 warnings |
| Unit tests | vitest | `pnpm test` | 13 tests pasando |

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml — 4 jobs
jobs:
  frontend:           # pnpm install → typecheck → lint → vitest (13 tests)
  pipeline:           # pip install → pytest scrapers + embed server (19 tests, sin API key)
  pipeline-accuracy:  # Solo en main → pytest pipeline accuracy (3 tests, requiere OPENROUTER_API_KEY)
  docker:             # docker build → verificar que la imagen se construye
```

---

## 16. Despliegue y CI/CD

### Ambientes

| Ambiente | Frontend | Worker | Base de datos |
|----------|----------|--------|---------------|
| **Desarrollo** | `localhost:3000` | Local venv (5 terminales) | Supabase CLI (local Docker) |
| **Producción** | Vercel (Hobby) | Railway (Docker) | Supabase cloud |

### Worker Dockerfile (optimizado)

```dockerfile
FROM python:3.11-slim
WORKDIR /app

# Deps de sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl && rm -rf /var/lib/apt/lists/*

# Python deps con PyTorch CPU-only (~2 GB vs ~5 GB con CUDA)
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

COPY . .

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

RUN useradd --create-home --shell /bin/bash --uid 1000 worker
USER worker
CMD ["python", "-m", "worker.main"]
```

**Optimización aplicada:** PyTorch CPU-only reduce la imagen en ~3 GB. No hay GPU disponible en Railway hobby tier.

### Variables de entorno en producción

Las mismas que en desarrollo (ver sección 3 de ARCHITECTURE.md), pero:
- `SUPABASE_URL` apunta a la instancia cloud
- `CELERY_BROKER_URL` apunta a Upstash Redis (o similar)
- `NEXT_PUBLIC_SUPABASE_URL` apunta a la instancia cloud

---

## 17. Glosario

| Término | Definición |
|---------|-----------|
| **Noise filter** | Primer nodo del pipeline (categorizer_node) que clasifica artículos como Technical o Non-Technical. Solo los Technical pasan al resto del pipeline. |
| **pgvector** | Extensión de PostgreSQL para almacenar y buscar vectores. Soporta IVFFlat y HNSW para búsqueda aproximada. |
| **Embedding** | Representación numérica (vector de 384 floats) del significado semántico de un texto. Artículos con embeddings similares tratan temas similares. |
| **Cosine similarity** | Métrica de similitud entre vectores. 1.0 = idénticos, 0.0 = sin relación. El operador `<=>` de pgvector calcula la distancia coseno. |
| **IVFFlat** | Tipo de índice vectorial. Divide el espacio en "listas" de clusters para buscar más rápido. Requiere ~1000 filas para ser efectivo. |
| **LangGraph** | Framework de LangChain para orquestar pipelines de LLM como grafos dirigidos con estado tipado. |
| **OpenRouter** | Gateway de LLM que ofrece acceso a múltiples modelos (incluyendo gratuitos) con API compatible con OpenAI. |
| **Celery** | Cola de tareas distribuida para Python. Los scrapers enqueue tareas, los workers las procesan con retries. |
| **APScheduler** | Scheduler in-process para Python. Ejecuta jobs periódicos (scraping cada 30-60 min). |
| **RLS (Row Level Security)** | Política de Supabase/PostgreSQL que restringe qué filas puede leer/escribir un cliente basándose en su rol. |
| **Modular Monolith** | Arquitectura donde frontend y worker viven en el mismo repo pero se comunican solo vía base de datos, no APIs directas. |
| **Optimistic update** | Patrón de UI donde el cambio se refleja inmediatamente en la interfaz antes de confirmarse en el servidor. Si falla, se revierte. |
| **sentence-transformers** | Librería Python de Hugging Face para generar embeddings de texto con modelos pre-entrenados. |
| **Service role key** | Clave de Supabase que bypasa RLS. Se usa en API routes (server-side) y en el worker. Nunca se expone al cliente. |

---

> **Para ejecutar el proyecto:** Consulta `RUNBOOK.md`.  
> **Para detalles técnicos de despliegue:** Consulta `ARCHITECTURE.md`.
