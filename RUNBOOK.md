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

Hay dos formas de levantar el proyecto. Elige la que prefieras:

### Opción A — Docker Compose (recomendado, 2 terminales)

La forma más rápida. Solo necesitas Supabase aparte porque corre como CLI.

#### Terminal 1 — Supabase

```bash
cd ~/projects/ai-news-solution
supabase start --exclude edge-runtime,studio,mailpit,logflare,vector
```

Espera `All services are running.`. Copia el `service_role key` del output.

#### Terminal 2 — Todo lo demás (Redis + Embed Server + Worker + Frontend)

```bash
cd ~/projects/ai-news-solution
docker compose up --build
```

Esto levanta **4 servicios**: Redis, embed-server, worker (APScheduler + Celery), y frontend (Next.js).

> Los archivos `.dockerignore` excluyen `node_modules/`, `.venv/`, `.next/` y tests del contexto de build. Rebuilds típicos toman ~10 segundos.

Abre **http://localhost:3000** — sin login, acceso directo.

> Para modo detached: `docker compose up --build -d` y luego `docker compose logs -f` para ver logs.

---

### Opción B — Manual (5 terminales, sin Docker Compose)

Útil para desarrollo cuando necesitas reiniciar servicios individualmente.

#### Terminal 1 — Infraestructura (Supabase + Redis)

```bash
cd ~/projects/ai-news-solution
bash setup-docker.sh
```

Espera hasta ver `All services are running.` (~30 seg). Esto inicia:
- **Supabase** en `http://127.0.0.1:54321` (solo API + PostgreSQL)
- **Redis** en `127.0.0.1:6379` (localhost only)

> Studio, Mailpit, Analytics y Vector se excluyen del arranque. Vector depende de logflare (analytics) para enviar logs — sin logflare, Vector no puede arrancar. Si necesitas Studio temporalmente: `supabase start --exclude edge-runtime,vector`.

#### Terminal 2 — Frontend Next.js

```bash
cd ~/projects/ai-news-solution
pnpm dev
```

Abre **http://localhost:3000** — sin login, acceso directo.

#### Terminal 3 — Embed Server (búsqueda semántica local)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/embed_server.py
```

> Primera vez: descarga el modelo `all-MiniLM-L6-v2` (~80 MB). Luego queda en caché.  
> Necesario para que la búsqueda semántica (`/search`) funcione.

#### Terminal 4 — Worker Celery (pipeline LangGraph)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
celery -A worker.celery_app.app worker --loglevel=info
```

> ⚠️ Requiere `OPENROUTER_API_KEY` en `worker/.env`.  
> Sin la key, Celery arranca pero cada tarea falla con `EnvironmentError`.  
> El frontend sigue mostrando los artículos ya procesados.

#### Terminal 5 — APScheduler (scrapers)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/main.py
```

> RSS, Arxiv, DeepMind y HN funcionan sin API keys adicionales.  
> Los artículos se encolan en Redis y esperan a que Celery los procese.

---

## Modo mínimo (solo lectura, sin API key)

Solo necesitas **Terminales 1, 2 y 3** (o Docker Compose sin worker). Esto permite:

| URL | Estado | Descripción |
|-----|--------|-------------|
| `http://localhost:3000/` | ✅ | Feed con artículos seed + procesados |
| `http://localhost:3000/article/[id]` | ✅ | Vista de detalle completa |
| `http://localhost:3000/search?q=agents` | ✅ | Búsqueda semántica (requiere embed server) |
| `http://localhost:3000/watchlist` | ✅ | Gestión de tecnologías seguidas |
| `http://localhost:3000/admin/usage` | ✅ | Dashboard de uso de tokens LLM |

> Las Terminales 4 y 5 son opcionales — solo se necesitan para ingestar artículos nuevos.

---

## Matar el proyecto

### Si usaste Docker Compose

```bash
docker compose down          # para todos los servicios
supabase stop                # para Supabase
```

### Si usaste la opción manual

#### Todo de un golpe (recomendado)

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

#### Terminal por terminal

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

## Variables de entorno

### `.env.local` (Frontend — Next.js)

```bash
cp .env.local.example .env.local
```

| Variable | Requerida | Propósito |
|----------|-----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL de Supabase local (`http://127.0.0.1:54321`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Acceso server-side a la DB (del output de `supabase start`) |
| `WORKER_EMBED_URL` | No | URL del embed server (default: `http://localhost:8001`) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN para error tracking del frontend |
| `NEXT_PUBLIC_APP_URL` | No | URL base de la app |

### `worker/.env` (Pipeline — Python)

```bash
cp worker/.env.example worker/.env
```

| Variable | Requerida | Propósito |
|----------|-----------|-----------|
| `SUPABASE_URL` | Sí | URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Acceso de escritura a la DB |
| `OPENROUTER_API_KEY` | Sí | Key gratuita de [openrouter.ai/keys](https://openrouter.ai/keys) |
| `CELERY_BROKER_URL` | Sí | `redis://localhost:6379/0` |
| `CELERY_RESULT_BACKEND` | Sí | `redis://localhost:6379/0` |
| `DAILY_TOKEN_CAP` | No | Límite diario de tokens LLM (default: `400000`, `0` = sin límite) |
| `RESEND_API_KEY` | No | Solo para el digest semanal por email |
| `HMAC_SECRET` | No | Clave HMAC-SHA256 para tokens de unsubscribe (weekly brief) |
| `SENTRY_WORKER_DSN` | No | Sentry DSN para error tracking del worker |
| `LOG_FORMAT` | No | `json` (producción) o `dev` (consola coloreada). Default: `dev` |
| `LOG_LEVEL` | No | Nivel de log Python. Default: `INFO` |
| `APP_URL` | No | URL base de la app para links de unsubscribe (default: `http://localhost:3000`) |

---

## Reinicio rápido tras reboot

### Con Docker Compose (recomendado)

```bash
cd ~/projects/ai-news-solution
supabase start --exclude edge-runtime,studio,mailpit,logflare,vector
docker compose up --build -d
```

### Manual

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

# Tests del frontend (vitest — 65 tests: 33 API routes + 25 componentes React + 7 infraestructura)
pnpm test

# Tests E2E (Playwright — requiere app corriendo)
pnpm test:e2e

# Tests unitarios del worker (scrapers + embed server + daily cap — 24 tests, sin API keys)
cd worker && source .venv/bin/activate && pytest tests/ -v --ignore=tests/pipeline/test_categorizer.py

# Tests de accuracy del pipeline (requiere OPENROUTER_API_KEY)
cd worker && source .venv/bin/activate && pytest tests/pipeline/test_categorizer.py -v

# Estado de los workers Celery
celery -A worker.celery_app.app inspect active

# Cola de Redis
docker exec ai-news-redis redis-cli llen celery

# Logs de Supabase
supabase db logs
```
