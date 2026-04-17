# KNOWN-ISSUES.md — Pendientes para 100% de implementación

> Auditoría completa del proyecto AI News Intelligence Platform.
> Fecha: 16 de abril de 2026 · Estado actual: **~90% completo**

---

## 🔴 Críticos (bloqueantes para funcionalidad completa)

### 1. ~~Endpoint `/api/unsubscribe` — NO EXISTE~~ ✅ RESUELTO

**Estado:** Implementado — `GET /api/unsubscribe?uid=<user_id>&token=<hmac>`

- Valida HMAC-SHA256 token con timing-safe comparison
- Marca `active=false` en `email_subscriptions`
- Retorna página HTML de confirmación
- Rate limited: 10 req/min
- 7 tests en `__tests__/api/unsubscribe.test.ts`

---

### 2. ~~Endpoint `/api/email-subscribe` — NO EXISTE~~ ✅ RESUELTO

**Estado:** Implementado — `POST /api/email-subscribe` + `GET /api/email-subscribe` + componente UI.

- POST: valida email (RFC 5322), upsert con reactivación si ya existía
- GET: retorna estado de suscripción actual
- Componente `EmailSubscribe` en la home page con React Query
- Rate limited: 5 req/min
- 10 tests en `__tests__/api/email-subscribe.test.ts`

---

### 3. ~~Monitoreo de errores (Sentry) — NO INTEGRADO~~ ✅ RESUELTO

**Estado:** Implementado — `@sentry/nextjs` (frontend) + `sentry-sdk` (worker).

- Frontend: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Worker: `sentry_sdk.init()` en `worker/main.py`
- DSNs via env vars: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_WORKER_DSN`
- 10% trace sampling en producción
- CSP actualizado para dominios de Sentry

---

## 🟡 Importantes (calidad y operabilidad)

### 4. ~~Logging estructurado — BÁSICO~~ ✅ RESUELTO

**Estado:** Implementado — `structlog` con JSON en producción, coloreado en desarrollo.

- `worker/logging_config.py` con `setup_logging()` configurable
- `LOG_FORMAT=json|dev`, `LOG_LEVEL=INFO|DEBUG|etc`
- Silencia loggers ruidosos (httpx, httpcore, celery)
- Envuelve stdlib logging para compatibilidad

---

### 5. Dead Letter Queue (DLQ) para Celery — NO EXISTE

**Archivo faltante:** migración SQL para tabla `failed_tasks`, actualización en `worker/tasks/process_article.py`

Los tasks de Celery que fallan después de 3 reintentos se pierden silenciosamente. No hay tabla ni UI para inspeccionar o reintentar.

**Qué implementar:**
- Tabla `failed_tasks (id, task_name, args, kwargs, exception, traceback, failed_at)`.
- Signal handler `task_failure` en Celery para capturar y guardar.
- Vista en `/admin/tasks` para inspeccionar y reintentar.

**Esfuerzo estimado:** 3 horas.

---

### 6. ~~Rate limiting en API routes — NO EXISTE~~ ✅ RESUELTO

**Estado:** Implementado — rate limiter in-memory con sliding window en `lib/rate-limit.ts`.

- `/api/search`: 10 req/min (consume embeddings)
- `/api/news`: 60 req/min (feed browsing)
- `/api/watchlist`: 30 req/min (POST/DELETE)
- `/api/tags`: 30 req/min
- Retorna 429 + header `Retry-After` cuando se excede
- 7 tests en `__tests__/lib/rate-limit.test.ts`

---

### 7. ~~Tags dinámicos via API — HARDCODEADOS~~ ✅ RESUELTO

**Estado:** Implementado — `GET /api/tags` consulta `tech_tags` ordenados por nombre.

- `NewsFeed` consume `/api/tags` con React Query (staleTime: 5 min)
- Fallback a array hardcodeado si el API falla
- Cache-Control: 5 min server-side
- 3 tests en `__tests__/api/tags.test.ts`

---

### 8. ~~Tests de componentes React — 0 TESTS~~ ✅ RESUELTO

**Estado:** Implementado — 25 tests de componentes con `@testing-library/react` + `vitest`.

- `ArticleCard` — 10 tests (render, score bars, colores emerald/amber, minimal mode, tags, links)
- `WatchlistManager` — 8 tests (toggle optimista, rollback on failure, disabled while inflight, conteo)
- `NewsFeed` — 7 tests (loading skeletons, error state, empty state, tag filter, infinite scroll)

**Archivos:** `__tests__/components/article-card.test.tsx`, `watchlist-manager.test.tsx`, `news-feed.test.tsx`

---

### 9. ~~Tests E2E (Playwright) — INSTALADO PERO NO CONFIGURADO~~ ✅ RESUELTO

**Estado:** Configurado y funcional.

- `playwright.config.ts` con base URL y webServer auto-start
- 7 tests E2E en `e2e/navigation.spec.ts`: Home (3), Search (2), Article detail (1), Watchlist (1)
- Scripts: `pnpm test:e2e` y `pnpm test:e2e:ui`

---

### 10. ~~Variable `DAILY_TOKEN_CAP` — DEFINIDA PERO NO USADA~~ ✅ RESUELTO

**Estado:** Implementado en `worker/pipeline/graph.py`.

- Lee `DAILY_TOKEN_CAP` del env (default: 400,000 tokens)
- `_check_daily_token_cap()` consulta `llm_usage_log` para tokens del día
- Si se excede, lanza `DailyTokenCapExceeded` y bloquea nuevas llamadas LLM
- 5 tests en `worker/tests/pipeline/test_daily_cap.py`
- Set `DAILY_TOKEN_CAP=0` para desactivar

---

### 11. Guía de deployment a producción — NO EXISTE

No hay guía para desplegar en Railway (worker) + Vercel (frontend). No existen archivos `railway.json`, `vercel.json` ni `.env.production.example`.

**Qué implementar:**
- Guía paso a paso en `DEPLOYMENT.md`.
- `railway.json` con configuración del worker.
- `.env.production.example` con todas las variables requeridas.

**Esfuerzo estimado:** 3 horas.

---

## 🟢 Deseables (pulido y mejora)

### 12. Toggle Dark/Light mode — HARDCODEADO

**Archivo:** `app/layout.tsx` línea 30

La clase `dark` está hardcodeada en el `<html>`. No hay toggle ni persistencia de preferencia del usuario.

**Esfuerzo estimado:** 1 hora.

---

### 13. Soft-delete para artículos descartados

Los artículos con `is_filtered=false` se eliminan permanentemente después de 30 días. No se puede retrainar o auditar lo que fue descartado.

**Qué implementar:** Columna `deleted_at` en `news_items`, trigger de soft-delete.

**Esfuerzo estimado:** 1 hora.

---

### 14. Audit log para cleanup jobs

`worker/tasks/cleanup_db.py` ejecuta la limpieza periódica pero los resultados solo se loggean a stdout. No hay tracking en base de datos.

**Qué implementar:** Tabla `cleanup_log (id, function, rows_affected, status, ran_at)`.

**Esfuerzo estimado:** 1.5 horas.

---

### 15. Tracking de versión de modelo de embeddings

No hay registro de qué versión del modelo de embeddings se usó para cada artículo. Si el modelo se actualiza, los embeddings viejos quedan incompatibles sin forma de detectar cuáles son.

**Qué implementar:** Columna `embedding_model TEXT DEFAULT 'all-MiniLM-L6-v2'` en `news_items`.

**Esfuerzo estimado:** 30 minutos.

---

### 16. ~~Accesibilidad (ARIA labels y navegación por teclado)~~ ✅ RESUELTO

**Estado:** Implementado — ARIA labels, roles y landmarks en todos los componentes interactivos.

- `ArticleCard`: role="article", aria-label, progressbar roles
- `NewsFeed`: nav landmark, role="feed", aria-busy, aria-pressed en filtros
- `WatchlistManager`: role="region", role="alert", aria-pressed, aria-live

---

### 17. Endpoint de exportación `/api/export`

No hay forma de exportar artículos a JSON o CSV. Mencionado en `IMPROVEMENTS.md` como P3.

**Esfuerzo estimado:** 2 horas.

---

### 18. ~~Indicador de truncamiento en infinite scroll~~ ✅ RESUELTO

**Estado:** Implementado — cuando el scroll alcanza el límite de MAX_PAGES (20 páginas, ~400 artículos), muestra "Showing X of Y articles" en vez de "All caught up".

---

### 19. Autenticación multi-usuario — NO IMPLEMENTADA (decisión de diseño)

La app usa un modelo single-user con `OWNER_ID='owner'` hardcodeado. Los directorios `app/login/`, `app/actions/`, `app/api/auth/` y `hooks/` fueron eliminados en la iteración 2 (cleanup). Si se quisiera auth multi-usuario, habría que implementar flujo completo con Supabase Auth.

**Nota:** Esto es una decisión de arquitectura, no un bug. Documentado en `ARCHITECTURE.md`.

---

## 📊 Resumen

| Prioridad | Items | Resueltos | Pendientes | Esfuerzo restante |
|-----------|-------|-----------|------------|-------------------|
| 🔴 Críticos | 3 | 3 | 0 | 0 horas |
| 🟡 Importantes | 8 | 7 | 1 | ~3 horas |
| 🟢 Deseables | 8 | 2 | 6 | ~7.5 horas |
| **Total** | **19 items** | **12 resueltos** | **7 pendientes** | **~10.5 horas** |

### Lo que SÍ funciona (implementado al 100%)

- ✅ Pipeline de ingesta: 4 scrapers (RSS, Arxiv, DeepMind, HN) → LangGraph 7 nodos → Supabase
- ✅ Rotación automática de modelos LLM (ModelPool con 9 modelos gratuitos)
- ✅ Embeddings locales (all-MiniLM-L6-v2, 384 dims, CPU-only)
- ✅ Búsqueda semántica via pgvector (cosine similarity)
- ✅ Feed con infinite scroll y filtro por tags
- ✅ Detalle de artículo con resumen técnico, implementation steps, artículos relacionados
- ✅ Watchlist personalizada por tags
- ✅ Dashboard de uso de LLM (tokens, costo por modelo)
- ✅ Command Palette (Cmd+K) para búsqueda rápida
- ✅ Weekly email digest (Resend + HMAC unsubscribe tokens)
- ✅ Retención de datos (30d discard, 90d archive, 6mo usage cleanup)
- ✅ CSP headers, XSS sanitization, deployment guards
- ✅ CI/CD con 4 jobs (frontend, pipeline, accuracy, docker)
- ✅ 48 tests frontend (vitest: 30 API routes + 25 componentes React)
- ✅ 17 tests de infraestructura (vitest: 7 rate-limit + 3 tags API + 7 unsubscribe)
- ✅ 24 tests backend (pytest: scrapers, embed server, pipeline, daily cap)
- ✅ 7 tests E2E (Playwright: navegación completa)
- ✅ Rate limiting en todos los API routes (in-memory sliding window)
- ✅ Tags dinámicos via `/api/tags` (con fallback hardcodeado)
- ✅ Indicador de truncamiento en infinite scroll
- ✅ Daily token cap enforcement (DAILY_TOKEN_CAP en pipeline)
- ✅ Docker Compose para levantar todo con un solo comando
