# AI News Intelligence Platform — Plan de Mejoras

> **Autor:** Bryan Escamilla — Applaudo Studios  
> **Fecha:** Abril 2026  
> **Propósito:** Issues actuales, mejoras pendientes y plan de iteración post-MVP.

---

## Errores Actuales (Bugs Conocidos)

### 🔴 Críticos

| # | Error | Archivo | Estado |
|---|-------|---------|--------|
| 1 | **Embed service devuelve HTTP 200 en fallo** — cuando el embed server está caído, `/api/search` retorna `{ data: [], error: "..." }` con status 200. El usuario ve "sin resultados" en vez de "servicio no disponible". | `app/api/search/route.ts` L23-26 | Pendiente |
| 2 | **Race condition en watchlist toggle** — clicks rápidos en el mismo tag causan estado inconsistente. El optimistic update se invierte y la UI se desincroniza del servidor. | `components/watchlist-manager.tsx` | Pendiente |
| 3 | **Search stale requests** — al escribir rápido en el CommandPalette, requests anteriores pueden completarse después de las nuevas. No hay `AbortController` para cancelar requests obsoletos. | `components/command-palette.tsx` | Pendiente |
| 4 | **Weekly brief HMAC token** — el código comenta que usa HMAC-SHA256 para unsubscribe links, pero la implementación no genera ni valida el token. | `worker/tasks/weekly_brief.py` | Pendiente |
| 5 | **HTML injection en weekly brief** — regex para convertir Markdown a HTML no escapa caracteres especiales (`"`, `<`, `>`) en URLs y títulos de artículos. | `worker/tasks/weekly_brief.py` L82 | Pendiente |

### 🟡 Menores

| # | Error | Archivo |
|---|-------|---------|
| 6 | Truncamiento de texto en search results sin indicador `…` | `app/search/page.tsx` |
| 7 | Tags hardcodeados en `NewsFeed` en vez de consultados de la DB | `components/news-feed.tsx` |
| 8 | Tags denormalizados (`news_items.tags[]`) pueden desincronizarse de la tabla `news_item_tags` si se renombra un tag | Schema de DB |
| 9 | `MAX_PAGES = 20` en infinite scroll silenciosamente oculta artículos después del #400 sin indicar al usuario | `components/news-feed.tsx` |

---

## Áreas de Mejora por Prioridad

### P0 — Mejorar antes de presentar

| # | Mejora | Justificación | Esfuerzo |
|---|--------|---------------|----------|
| 1 | **Guardia de deployment** — agregar check que bloquee APIs sensibles si no es localhost | Si se despliega accidentalmente en URL pública, watchlist y admin quedan expuestos | 30 min |
| 2 | **Corregir status HTTP del embed service** — retornar 503 en vez de 200 cuando el embed server falla | Error de diseño de API que oculta fallos del sistema | 15 min |
| 3 | **AbortController en CommandPalette y Search** — cancelar requests anteriores al escribir | Race condition visible para el usuario | 30 min |
| 4 | **Input validation en `/api/search`** — limitar longitud del query a 512 chars, strip control characters | Permite enviar payloads de 100KB al embed server | 15 min |
| 5 | **Debounce guard en watchlist** — prevenir toggles duplicados mientras hay una request en vuelo | Estado inconsistente visible | 20 min |

### P1 — Mejoras Arquitectónicas

| # | Mejora | Justificación | Esfuerzo |
|---|--------|---------------|----------|
| 6 | **Cache-Control headers en API routes** — `max-age=60, stale-while-revalidate=300` para `/api/news` | Reduce carga en DB; profesionaliza el comportamiento HTTP | 1 hora |
| 7 | **Structured logging (JSON)** — reemplazar `logger.info("msg %s", var)` con structlog o JSON formatter | Los líderes de Applaudo esperan logs que se puedan indexar en Datadog/ELK | 2 horas |
| 8 | **Dead Letter Queue para Celery** — almacenar tasks fallidos para inspección manual | Actualmente tasks que fallan 3 veces se pierden silenciosamente | 3 horas |
| 9 | **Error tracking (Sentry)** — integrar Sentry en Next.js y en el worker Python | Sin monitoreo, no sabrás cuando algo falla en producción | 2 horas |
| 10 | **Content-Security-Policy header** — reforzar seguridad del frontend contra XSS | Ya hay headers de seguridad, pero CSP es el estándar de la industria | 1 hora |

### P2 — Testing

| # | Mejora | Justificación | Esfuerzo |
|---|--------|---------------|----------|
| 11 | **Tests unitarios del frontend** — test para componentes NewsFeed, ArticleCard, WatchlistManager | 0 tests de frontend actualmente. Los leaders van a preguntar por esto. | 4-6 horas |
| 12 | **Tests de API routes** — mock Supabase, verificar responses y edge cases | Las API routes son el contrato entre frontend y backend | 3-4 horas |
| 13 | **Tests de scrapers** — mock HTTP responses, verificar parsing y sanitización | Los scrapers son código propio y procesan input externo | 3 horas |
| 14 | **E2E test mínimo** — Playwright/Cypress para flujo: home → search → article → back | Demuestra que la integración completa funciona | 4 horas |
| 15 | **Test de embed server** — verificar `/embed` y `/health` con inputs buenos y malos | El embed server es una superficie de ataque | 1 hora |

### P3 — UX y Polish

| # | Mejora | Justificación | Esfuerzo |
|---|--------|---------------|----------|
| 16 | **Tags dinámicos** — endpoint `/api/tags` + cache en React Query en vez de array hardcodeado | Hacer los tags extensibles sin tocar código | 1 hora |
| 17 | **Paginación visible** — mostrar "Mostrando 1-20 de 150 artículos" en vez de cortar silenciosamente | UX profesional | 30 min |
| 18 | **Dark/Light mode toggle** — actualmente forced dark mode sin opción | Accesibilidad y preferencia del usuario | 1 hora |
| 19 | **Export de datos** — endpoint `/api/export` para JSON/CSV de artículos y watchlist | Feature esperada en herramientas de inteligencia | 2 horas |
| 20 | **ARIA labels y keyboard nav** — score bars, tag toggles, card navigation por teclado | Accesibilidad (importante para Applaudo, que sigue estándares WCAG) | 2 horas |
| 21 | **Loading states mejorados** — Suspense boundaries con error boundaries y retry button | Resiliencia visible para el usuario | 1 hora |

### P4 — Infraestructura y DevOps

| # | Mejora | Justificación | Esfuerzo |
|---|--------|---------------|----------|
| 22 | **Healthcheck en Dockerfile** — exponer `/health` endpoint para Railway/K8s | Sin healthcheck, Railway no sabe si el container está vivo | 30 min |
| 23 | **Rate limiting en API routes** — `@upstash/ratelimit` o in-memory limiter | Protección contra bots si se despliega públicamente | 2 horas |
| 24 | **Pinear versión del modelo de embeddings** — usar hash o version tag explícito | Si HuggingFace actualiza MiniLM, embeddings existentes se invalidan | 30 min |
| 25 | **CI pipeline: agregar test de Docker build** — `docker build -t test .` en CI | Verificar que la imagen se construye correctamente | 30 min |
| 26 | **Soft-delete para artículos descartados** — `deleted_at` en vez de hard DELETE | Preservar datos para re-entrenamiento del noise filter | 1 hora |

---

## Scorecard de Evaluación Actual

| Categoría | Nota | Detalle |
|-----------|------|---------|
| **Arquitectura** | 8/10 | Modular monolith bien diseñado. Separación limpia frontend/worker vía DB. LangGraph pipeline bien estructurado con 7 nodos. |
| **Seguridad** | 6/10 | Buenos headers, sanitización de input, RLS. Falta CSP, rate limiting, y deployment guard. |
| **Testing** | 3/10 | Solo 1 archivo de test (pipeline accuracy). 0 tests de frontend, 0 tests de API, 0 E2E. |
| **Código** | 7/10 | TypeScript + Python bien escritos. Buena separación de concerns. Algunos anti-patterns menores. |
| **Documentación** | 9/10 | ARCHITECTURE.md, RUNBOOK.md, GUIDE.md, README.md — profesional y completo. |
| **DevOps/CI** | 6/10 | CI con typecheck + lint + pytest. Falta Docker build test, healthcheck, monitoring. |
| **UX** | 7/10 | Dark mode, infinite scroll, Cmd+K search, score bars. Falta accesibilidad, loading states. |
| **Costos** | 10/10 | $0 en LLM + embeddings. Arquitectura diseñada para free-tier. Impresionante. |
| **Innovación** | 8/10 | LangGraph pipeline agentico, embeddings locales, noise filter multi-LLM, pgvector search. |
| **Producción** | 4/10 | No hay rate limiting, monitoring, DLQ, ni observabilidad. Single point of failure en embed server. |

**Nota global: 6.8/10** — Sólido como MVP/demo técnica. Necesita 2-3 iteraciones más para ser production-grade.

---

## ¿Cuántas Iteraciones Más?

### Iteración 1 — "Demo-Ready" (1-2 días)
Corregir los 5 bugs P0. Esto sube la nota de 6.8 a ~7.5.
- Deployment guard
- HTTP status correcto en embed failure
- AbortController en search
- Input validation
- Watchlist debounce

### Iteración 2 — "Production-Aware" (3-5 días)
Implementar P1 (arquitectónicos) + tests mínimos.
- Cache-Control headers
- Structured logging
- Sentry integration
- Tests de API routes (al menos 3-4)
- 1 test E2E (Playwright)
- CSP header

Esto sube la nota a ~8.5 y demuestra madurez de engineering ante los líderes.

### Iteración 3 — "Enterprise-Ready" (1-2 semanas)
P2 completo + P3 selectivo.
- Full test coverage (unit + API + E2E)
- Rate limiting
- DLQ + admin panel para failed tasks
- Export de datos
- Accesibilidad WCAG
- Healthchecks + Docker optimization

Esto llevaría el proyecto a ~9.0 — nivel que impresionaría a líderes de enterprise-grade projects.

---

## Archivos Modificados en las Sesiones Anteriores (Referencia)

### Sesión 1-2 (Auditoría de Seguridad)
- `next.config.ts` — Security headers
- `components/code-block.tsx` — XSS fix (hast-util-to-jsx-runtime)
- `app/api/**/*.ts` — Error sanitization, self-fetch removal
- `worker/scrapers/rss.py` — defusedxml + bleach
- `worker/pipeline/graph.py` — JSON parsing resiliente

### Sesión 3 (Limpieza)
- Eliminados: `app/login/`, `app/actions/`, `app/api/auth/`, `hooks/`, `CLAUDE.md`, SVGs
- Reescritos: `README.md`, `ARCHITECTURE.md`, `RUNBOOK.md`
- Corregidos: test fixtures, source names, pyproject.toml

### Sesión 4 (Optimización)
- `worker/requirements.txt` — PyTorch CPU-only pinned
- `worker/Dockerfile` — CPU-only index
- `worker/pipeline/graph.py` — `_openrouter_chat()` retry con backoff
- `setup-docker.sh` — Redis 127.0.0.1, Supabase exclude studio/mailpit/analytics
- Creados: `GUIDE.md`
