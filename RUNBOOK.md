# AI News Intelligence Platform — Runbook

> **Autor:** Bryan Escamilla — Applaudo Studios  
> **Última actualización:** Abril 2026

---

## Pre-requisitos

| Herramienta | Versión | Instalación |
|-------------|---------|-------------|
| Node.js | 22+ | `nvm install 22` |
| pnpm | 10+ | `npm install -g pnpm` |
| Python | 3.11+ | Pre-instalado o `pyenv install 3.11` |
| Docker | 24+ | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| Supabase CLI | 2+ | `npm install -g supabase` |

---

## Estado limpio (punto de partida)

Antes de arrancar, verifica que no haya nada corriendo:

```bash
docker ps                                          # debe estar vacío
ss -tlnp | grep -E "543|6379|3000|8001" || echo "OK"
```

> **Nota de seguridad:** Tras el arranque, solo deben quedar expuestos 2 puertos en `0.0.0.0`: Supabase API (54321) y PostgreSQL (54322). Redis (6379) queda restringido a `127.0.0.1`. Studio, Mailpit y Analytics están excluidos por defecto.

---

## Arrancar el proyecto

Abre **5 terminales** en este orden:

### Terminal 1 — Infraestructura (Supabase + Redis)

```bash
cd ~/projects/ai-news-solution
bash setup-docker.sh
```

Espera hasta ver `All services are running.` (~30 seg). Esto inicia:
- **Supabase** en `http://127.0.0.1:54321` (solo API + PostgreSQL)
- **Redis** en `127.0.0.1:6379` (localhost only)

> Studio, Mailpit y Analytics se excluyen del arranque para reducir superficie de ataque. Si necesitas Studio temporalmente: `supabase start --exclude edge-runtime`.

### Terminal 2 — Frontend Next.js

```bash
cd ~/projects/ai-news-solution
pnpm dev
```

Abre **http://localhost:3000** — sin login, acceso directo.

### Terminal 3 — Embed Server (búsqueda semántica local)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/embed_server.py
```

> Primera vez: descarga el modelo `all-MiniLM-L6-v2` (~80 MB). Luego queda en caché.  
> Necesario para que la búsqueda semántica (`/search`) funcione.

### Terminal 4 — Worker Celery (pipeline LangGraph)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
celery -A worker.celery_app.app worker --loglevel=info
```

> ⚠️ Requiere `OPENROUTER_API_KEY` en `worker/.env`.  
> Sin la key, Celery arranca pero cada tarea falla con `EnvironmentError`.  
> El frontend sigue mostrando los artículos ya procesados.

### Terminal 5 — APScheduler (scrapers)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/main.py
```

> RSS, Arxiv, DeepMind y HN funcionan sin API keys adicionales.  
> Los artículos se encolan en Redis y esperan a que Celery los procese.

---

## Matar el proyecto

> ⚠️ `Ctrl+C` solo mata procesos del sistema (Next.js, Celery, Python).  
> Los contenedores Docker (Supabase, Redis) requieren comandos propios.

### Opción A — Todo de un golpe (recomendado)

```bash
# Procesos del sistema
pkill -f "next" 2>/dev/null
pkill -f "celery" 2>/dev/null
pkill -f "main.py" 2>/dev/null
pkill -f "embed_server" 2>/dev/null

# Contenedores Docker
docker stop ai-news-redis
supabase stop
```

### Opción B — Terminal por terminal

1. **Next.js** → `Ctrl+C`
2. **Embed Server** → `Ctrl+C`
3. **Celery** → `Ctrl+C`
4. **APScheduler** → `Ctrl+C`
5. Docker:

```bash
docker stop ai-news-redis
supabase stop
```

### Verificar que todo está detenido

```bash
docker ps                                          # tabla vacía
ss -tlnp | grep -E "543|6379|3000|8001" || echo "OK"
pgrep -la "next|celery|python" || echo "limpio"
```

---

## Qué funciona sin OPENROUTER_API_KEY

Con las Terminales 1, 2 y 3 activas:

| URL | Estado | Descripción |
|-----|--------|-------------|
| `http://localhost:3000/` | ✅ | Feed con artículos seed + procesados |
| `http://localhost:3000/article/[id]` | ✅ | Vista de detalle completa |
| `http://localhost:3000/search?q=agents` | ✅ | Búsqueda semántica (requiere Terminal 3) |
| `http://localhost:3000/watchlist` | ✅ | Gestión de tecnologías seguidas |
| `http://localhost:3000/admin/usage` | ✅ | Dashboard de uso de tokens LLM |

---

## Variables de entorno

### `.env.local` (Frontend — Next.js)

| Variable | Requerida | Propósito |
|----------|-----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL de Supabase local |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Acceso server-side a la DB |
| `WORKER_EMBED_URL` | No | URL del embed server (default: `http://localhost:8001`) |

### `worker/.env` (Pipeline — Python)

| Variable | Requerida | Propósito |
|----------|-----------|-----------|
| `SUPABASE_URL` | Sí | URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Acceso de escritura a la DB |
| `OPENROUTER_API_KEY` | Sí | Key gratuita de [openrouter.ai/keys](https://openrouter.ai/keys) |
| `CELERY_BROKER_URL` | Sí | `redis://localhost:6379/0` |
| `CELERY_RESULT_BACKEND` | Sí | `redis://localhost:6379/0` |
| `RESEND_API_KEY` | No | Solo para el digest semanal por email |
| `HMAC_SECRET` | No | Clave HMAC-SHA256 para tokens de unsubscribe (weekly brief) |
| `APP_URL` | No | URL base de la app para links de unsubscribe (default: `http://localhost:3000`) |

---

## Reinicio rápido tras reboot

```bash
cd ~/projects/ai-news-solution
bash setup-docker.sh                                           # Terminal 1
pnpm dev                                                        # Terminal 2
source worker/.venv/bin/activate && python worker/embed_server.py  # Terminal 3
```

Las terminales 4 y 5 son opcionales hasta que configures `OPENROUTER_API_KEY`.

---

## Comandos útiles

```bash
# Type-check del frontend
pnpm typecheck

# Linting
pnpm lint

# Tests del frontend (vitest — 13 tests de API routes)
pnpm test

# Tests unitarios del worker (scrapers + embed server — 19 tests, sin API keys)
cd worker && source .venv/bin/activate && pytest tests/scrapers/ tests/test_embed_server.py -v

# Tests de accuracy del pipeline (requiere OPENROUTER_API_KEY)
cd worker && source .venv/bin/activate && pytest tests/pipeline/ -v

# Estado de los workers Celery
celery -A worker.celery_app.app inspect active

# Cola de Redis
docker exec ai-news-redis redis-cli llen celery

# Logs de Supabase
supabase db logs
```
