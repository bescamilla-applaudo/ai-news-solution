# NON-RESOLVED.md — Pendientes para 100% de implementación

> Auditoría completa del proyecto AI News Intelligence Platform.
> Fecha: 16 de abril de 2026 · Estado actual: **~90% completo**

---

## 🔴 Críticos (bloqueantes para funcionalidad completa)

### 1. Endpoint `/api/unsubscribe` — NO EXISTE

**Archivo faltante:** `app/api/unsubscribe/route.ts`

El weekly brief genera links de unsubscribe con tokens HMAC-SHA256 (`worker/tasks/weekly_brief.py` línea 131), pero no existe ningún handler que procese esos links. Si un usuario hace click → recibe un **404**.

**Qué implementar:**
- `GET /api/unsubscribe?token=<hmac>&uid=<user_id>` — validar token HMAC, marcar `active=false` en tabla `email_subscriptions`, mostrar página de confirmación.

**Esfuerzo estimado:** 1–2 horas.

---

### 2. Endpoint `/api/email-subscribe` — NO EXISTE

**Archivo faltante:** `app/api/email-subscribe/route.ts`

La tabla `email_subscriptions` existe en el schema (migración `0001_initial_schema.sql`) pero no hay ningún endpoint ni UI para que un usuario se suscriba al digest semanal. Los suscriptores solo pueden agregarse vía SQL directo.

**Qué implementar:**
- `POST /api/email-subscribe` — acepta `{ email }`, valida formato, inserta en `email_subscriptions`, retorna confirmación.
- Componente de UI (formulario email) en la home o footer.

**Esfuerzo estimado:** 2 horas (endpoint + UI).

---

### 3. Monitoreo de errores (Sentry) — NO INTEGRADO

No hay integración con Sentry ni ningún servicio de error tracking ni en el frontend (Next.js) ni en el worker (Python). Los errores en producción se pierden en stdout.

**Qué implementar:**
- `@sentry/nextjs` para el frontend.
- `sentry-sdk` para el worker Python.
- Configurar DSN via variables de entorno.

**Esfuerzo estimado:** 2 horas.

---

## 🟡 Importantes (calidad y operabilidad)

### 4. Logging estructurado — BÁSICO

**Archivos afectados:** `worker/main.py`, `worker/pipeline/graph.py`, `worker/tasks/*.py`

El logging actual usa `logging.basicConfig(format="%(asctime)s ...")` — texto plano sin estructura. No se puede filtrar, agregar ni buscar en producción.

**Qué implementar:**
- Usar `structlog` o formatter JSON.
- Logs como JSON a stdout para parsing en producción (ELK/Datadog/CloudWatch).

**Esfuerzo estimado:** 2 horas.

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

### 6. Rate limiting en API routes — NO EXISTE

**Archivos afectados:** Todas las rutas en `app/api/`

No hay rate limiting en ningún endpoint. Si se despliega públicamente, vulnerable a abuso y brute-force.

**Qué implementar:**
- `@upstash/ratelimit` o rate limiter in-memory.
- Proteger especialmente `/api/search` (consume embeddings) y `/api/watchlist`.
- Retornar 429 + header `Retry-After`.

**Esfuerzo estimado:** 2 horas.

---

### 7. Tags dinámicos via API — HARDCODEADOS

**Archivo afectado:** `components/news-feed.tsx` líneas 9-11

Los tags del filtro están hardcodeados en el frontend:
```tsx
const ALL_TAGS = ["LLM-Release","Agents","RAG","Embeddings","Dev-Tools","Multi-Agent","Research","Claude","LangGraph"]
```

Si se agregan nuevos tags en la base de datos, no aparecen en el filtro.

**Qué implementar:**
- `GET /api/tags` — consulta `SELECT DISTINCT name FROM tech_tags ORDER BY name`.
- `NewsFeed` consume este endpoint en vez del array hardcodeado.

**Esfuerzo estimado:** 1 hora.

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

### 16. Accesibilidad (ARIA labels y navegación por teclado)

Mínima accesibilidad. Los toggles de tags en `WatchlistManager` y los filtros en `NewsFeed` no tienen `aria-label`, `role`, ni soporte de navegación por teclado.

**Esfuerzo estimado:** 2 horas.

---

### 17. Endpoint de exportación `/api/export`

No hay forma de exportar artículos a JSON o CSV. Mencionado en `IMPROVEMENTS.md` como P3.

**Esfuerzo estimado:** 2 horas.

---

### 18. Indicador de truncamiento en infinite scroll

`NewsFeed` tiene `MAX_PAGES=20` (~400 artículos). Cuando se alcanza el límite, no se muestra ningún mensaje al usuario ("Mostrando 400 de 1024").

**Esfuerzo estimado:** 30 minutos.

---

### 19. Autenticación multi-usuario — NO IMPLEMENTADA (decisión de diseño)

La app usa un modelo single-user con `OWNER_ID='owner'` hardcodeado. Los directorios `app/login/`, `app/actions/`, `app/api/auth/` y `hooks/` fueron eliminados en la iteración 2 (cleanup). Si se quisiera auth multi-usuario, habría que implementar flujo completo con Supabase Auth.

**Nota:** Esto es una decisión de arquitectura, no un bug. Documentado en `ARCHITECTURE.md`.

---

## 📊 Resumen

| Prioridad | Items | Resueltos | Pendientes | Esfuerzo restante |
|-----------|-------|-----------|------------|-------------------|
| 🔴 Críticos | 3 | 0 | 3 | ~5 horas |
| 🟡 Importantes | 8 | 3 | 5 | ~10 horas |
| 🟢 Deseables | 8 | 0 | 8 | ~10 horas |
| **Total** | **19 items** | **3 resueltos** | **16 pendientes** | **~25 horas** |

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
- ✅ 38 tests frontend (vitest: 13 API routes + 25 componentes React)
- ✅ 27 tests backend (pytest: scrapers, embed server, pipeline, daily cap)
- ✅ 7 tests E2E (Playwright: navegación completa)
- ✅ Daily token cap enforcement (DAILY_TOKEN_CAP en pipeline)
- ✅ Docker Compose para levantar todo con un solo comando
