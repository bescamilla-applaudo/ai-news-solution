# AI News Solution — Cómo correr y matar el proyecto

## Estado limpio (punto de partida)

Antes de arrancar, verifica que no haya nada corriendo:

```bash
docker ps                                        # debe estar vacío
ss -tlnp | grep -E "543|6379|3000|8001" || echo "OK"
```

---

## Arrancar el proyecto

Abre **5 terminales separadas** en este orden:

### Terminal 1 — Infraestructura (Supabase + Redis)

```bash
cd ~/projects/ai-news-solution
bash setup-docker.sh
```

Espera hasta ver `All services are running.` (~30 seg). Este paso inicia:
- **Supabase** en `http://127.0.0.1:54321` (DB + Studio en `54323`)
- **Redis** en `localhost:6379`

### Terminal 2 — Frontend Next.js

```bash
cd ~/projects/ai-news-solution
pnpm dev
```

Abre **http://localhost:3000** — sin login, acceso directo.

### Terminal 3 — Embed Server (búsqueda semántica local, sin API key)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/embed_server.py
```

> Primera vez: descarga el modelo `all-MiniLM-L6-v2` (~80MB). Luego queda en caché.
> Necesario para que `/search` funcione.

### Terminal 4 — Worker Celery (pipeline LangGraph) ⚠️ requiere OPENROUTER_API_KEY

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
celery -A worker.celery_app.app worker --loglevel=info
```

> Sin `OPENROUTER_API_KEY` en `worker/.env`, Celery arranca pero las tareas fallan silenciosamente.
> El frontend sigue mostrando los artículos ya procesados.

### Terminal 5 — APScheduler (scrapers)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/main.py
```

> RSS, Arxiv, DeepMind y HN funcionan sin API keys.
> Los artículos se encolan en Redis y esperan a que Celery los procese.

---

## Matar el proyecto (en orden correcto)

> ⚠️ `Ctrl+C` y `pkill` solo matan procesos del sistema (Next.js, Celery, Python).
> Los contenedores Docker (Supabase, Redis) requieren comandos propios — no se detienen solos.

### Opción A — Matar todo de un golpe (recomendado)

```bash
# 1. Procesos del sistema
pkill -f "next" 2>/dev/null; pkill -f "celery" 2>/dev/null; pkill -f "main.py" 2>/dev/null; pkill -f "embed_server" 2>/dev/null

# 2. Contenedores Docker
docker stop ai-news-redis
export PATH="$HOME/.local/bin:$PATH" && supabase stop
```

### Opción B — Terminal por terminal

1. En la terminal de **Next.js** → `Ctrl+C`
2. En la terminal de **Embed Server** → `Ctrl+C`
3. En la terminal de **Celery** → `Ctrl+C`
4. En la terminal de **APScheduler** → `Ctrl+C`
5. Luego en cualquier terminal:

```bash
docker stop ai-news-redis
export PATH="$HOME/.local/bin:$PATH" && supabase stop
```

### Verificar que todo está muerto

```bash
docker ps                                        # debe mostrar tabla vacía
ss -tlnp | grep -E "543|6379|3000|8001" || echo "OK"
pgrep -la "next|celery|python" || echo "limpio"
```

---

## Qué puedes ver SIN OPENROUTER_API_KEY

Con las Terminales 1, 2 y 3 activas:

| URL | Funciona | Contenido |
|---|---|---|
| `http://localhost:3000/` | ✅ | Feed con artículos (seed + procesados) |
| `http://localhost:3000/article/[id]` | ✅ | Vista de detalle completa |
| `http://localhost:3000/watchlist` | ✅ | Gestión de tecnologías seguidas |
| `http://localhost:3000/admin/usage` | ✅ | Dashboard de uso de tokens |
| `http://localhost:3000/search?q=rag` | ✅ | Búsqueda semántica (requiere Terminal 3) |

---

## Variables de entorno necesarias

### `.env.local` (frontend)

| Variable | Para qué |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | DB local (ya configurado) |
| `NEXT_PUBLIC_SUPABASE_URL` | DB local (ya configurado) |
| `WORKER_EMBED_URL` | URL del embed server (default: http://localhost:8001) |

### `worker/.env` (pipeline)

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | DB local (ya configurado) |
| `OPENROUTER_API_KEY` | **Pipeline LangGraph** — obtén gratis en https://openrouter.ai/keys |
| `RESEND_API_KEY` | Email digest semanal (opcional) |

---

## Reinicio rápido tras reboot

```bash
cd ~/projects/ai-news-solution
bash setup-docker.sh          # Terminal 1
pnpm dev                       # Terminal 2
python worker/embed_server.py  # Terminal 3 (con venv activado)
```

Las terminales 4 y 5 son opcionales hasta que configures `OPENROUTER_API_KEY`.
