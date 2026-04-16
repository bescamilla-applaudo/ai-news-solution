# NON-RESOLVED.md — Pendientes para 100% de implementación

> Auditoría completa del proyecto AI News Intelligence Platform.
> Fecha: 16 de abril de 2026 · Estado actual: **~85% completo**

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

### 8. Tests de componentes React — 0 TESTS

**Archivos faltantes:** `__tests__/components/*.test.tsx`

Existen 13 tests de API routes (vitest) pero **cero tests de componentes**. Los componentes `NewsFeed`, `ArticleCard`, `WatchlistManager`, `CommandPalette` no tienen pruebas de renderizado, interacción ni estados (loading/error/empty).

**Qué implementar:**
- Configurar vitest con `@testing-library/react`.
- Tests para `ArticleCard` (render con props, score bars, colores).
- Tests para `WatchlistManager` (toggle optimista, rollback).
- Tests para `NewsFeed` (infinite scroll, tag filter).

**Esfuerzo estimado:** 4-6 horas.

---

### 9. Tests E2E (Playwright) — INSTALADO PERO NO CONFIGURADO

`@playwright/test` aparece en `pnpm-lock.yaml` pero no existe `playwright.config.ts` ni ningún archivo de test.

**Qué implementar:**
- `playwright.config.ts` con base URL a localhost.
- Test flows: Home → Search → Article detail → Watchlist → (Unsubscribe cuando exista).
- Integrar en CI pipeline.

**Esfuerzo estimado:** 4 horas setup + 2 horas por escenario.

---

### 10. Variable `DAILY_TOKEN_CAP` — DEFINIDA PERO NO USADA

**Archivo:** `worker/.env` define `DAILY_TOKEN_CAP=400000` y `RUNBOOK.md` la documenta, pero **ningún código la lee ni la valida**. El cap de tokens diario mencionado en la documentación no se aplica realmente.

**Qué implementar:**
- Leer `DAILY_TOKEN_CAP` en `worker/pipeline/graph.py`.
- Consultar `usage_log` para tokens consumidos hoy.
- Si se excede el cap, rechazar nuevos articles y loggear warning.

**Esfuerzo estimado:** 1.5 horas.

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

### 19. Página `/login` — CARPETA VACÍA

El directorio `app/login/` existe pero no tiene `page.tsx`. Actualmente la app usa un modelo single-user con `OWNER_ID='owner'` hardcodeado (decisión de diseño intencional). Si se quisiera auth multi-usuario, habría que implementar flujo completo con Supabase Auth.

**Nota:** Esto es una decisión de arquitectura, no un bug. Documentado en `ARCHITECTURE.md`.

---

## 📊 Resumen

| Prioridad | Items | Esfuerzo estimado |
|-----------|-------|-------------------|
| 🔴 Críticos | 3 | ~5 horas |
| 🟡 Importantes | 8 | ~20 horas |
| 🟢 Deseables | 8 | ~10 horas |
| **Total** | **19 items** | **~35 horas** |

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
- ✅ 13 tests frontend (vitest) + 22 tests backend (pytest)
- ✅ Docker Compose para levantar todo con un solo comando
