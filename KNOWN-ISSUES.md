# KNOWN-ISSUES.md — Pendientes y Roadmap

> AI News Intelligence Platform  
> Última actualización: 17 de abril de 2026 · Estado actual: **~95% completo**

---

## 🟡 Importantes (calidad y operabilidad)

### 1. Dead Letter Queue (DLQ) para Celery

Los tasks de Celery que fallan después de 3 reintentos se pierden silenciosamente. No hay tabla ni UI para inspeccionar o reintentar.

**Qué implementar:**
- Tabla `failed_tasks (id, task_name, args, kwargs, exception, traceback, failed_at)`.
- Signal handler `task_failure` en Celery para capturar y guardar.
- Vista en `/admin/tasks` para inspeccionar y reintentar.

**Esfuerzo estimado:** 3 horas.

---

### 2. Guía de deployment a producción

No hay guía para desplegar en Railway (worker) + Vercel (frontend). No existen archivos `railway.json`, `vercel.json` ni `.env.production.example`.

**Qué implementar:**
- Guía paso a paso en `DEPLOYMENT.md`.
- `railway.json` con configuración del worker.
- `.env.production.example` con todas las variables requeridas.

**Esfuerzo estimado:** 3 horas.

---

## 🟢 Deseables (pulido y mejora)

### 3. Toggle Dark/Light mode

La clase `dark` está hardcodeada en `app/layout.tsx`. No hay toggle ni persistencia de preferencia del usuario.

**Esfuerzo estimado:** 1 hora.

---

### 4. Soft-delete para artículos descartados

Los artículos con `is_filtered=false` se eliminan permanentemente después de 30 días. No se puede auditar lo que fue descartado.

**Qué implementar:** Columna `deleted_at` en `news_items`, trigger de soft-delete.

**Esfuerzo estimado:** 1 hora.

---

### 5. Audit log para cleanup jobs

`worker/tasks/cleanup_db.py` ejecuta la limpieza periódica pero los resultados solo se loggean a stdout. No hay tracking en base de datos.

**Qué implementar:** Tabla `cleanup_log (id, function, rows_affected, status, ran_at)`.

**Esfuerzo estimado:** 1.5 horas.

---

### 6. Tracking de versión de modelo de embeddings

No hay registro de qué versión del modelo de embeddings se usó para cada artículo. Si el modelo se actualiza, los embeddings viejos quedan incompatibles sin forma de detectar cuáles son.

**Qué implementar:** Columna `embedding_model TEXT DEFAULT 'all-MiniLM-L6-v2'` en `news_items`.

**Esfuerzo estimado:** 30 minutos.

---

### 7. Endpoint de exportación `/api/export`

No hay forma de exportar artículos a JSON o CSV.

**Esfuerzo estimado:** 2 horas.

---

### 8. Autenticación multi-usuario (decisión de diseño)

La app usa un modelo single-user con `OWNER_ID='owner'` hardcodeado. Si se quisiera auth multi-usuario, habría que implementar flujo completo con Supabase Auth.

**Nota:** Esto es una decisión de arquitectura, no un bug. Documentado en `ARCHITECTURE.md`.

---

## 📊 Resumen

| Prioridad | Pendientes | Esfuerzo restante |
|-----------|------------|-------------------|
| 🟡 Importantes | 2 | ~6 horas |
| 🟢 Deseables | 6 | ~7 horas |
| **Total** | **8 pendientes** | **~13 horas** |

---

## ✅ Resueltos (referencia)

- `/api/unsubscribe` — HMAC-SHA256 validation, HTML confirmation page (7 tests)
- `/api/email-subscribe` — RFC 5322 validation, upsert, UI component (10 tests)
- Sentry error tracking — `@sentry/nextjs` + `sentry-sdk` (frontend + worker)
- Structured logging — `structlog` con JSON en producción, coloreado en desarrollo
- Rate limiting — in-memory sliding window en todos los API routes (7 tests)
- Tags dinámicos — `GET /api/tags` + LLM-powered tag generation en pipeline
- Tests de componentes React — 25 tests (ArticleCard, WatchlistManager, NewsFeed)
- Tests E2E — 7 Playwright tests de navegación
- DAILY_TOKEN_CAP enforcement — 5 pytest tests
- ARIA accessibility — roles, labels, landmarks en todos los componentes
- Indicador de truncamiento en infinite scroll
- CSP headers, XSS sanitization, deployment guards
