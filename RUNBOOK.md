# AI News Solution — Cómo correr y matar el proyecto

## Estado limpio (punto de partida)

Antes de arrancar, verifica que no haya nada corriendo:

```bash
docker ps                          # debe estar vacío
ss -tlnp | grep -E "543|6379|3000" # no debe mostrar nada
```

---

## Arrancar el proyecto

Abre **4 terminales separadas** en este orden:

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

Abre **http://localhost:3000** y entra con el `AUTH_PASSWORD` de `.env.local`.

### Terminal 3 — Worker Celery (pipeline LangGraph) ⚠️ requiere API keys

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
celery -A worker.celery_app.app worker --loglevel=info
```

> Sin `ANTHROPIC_API_KEY`, Celery arranca pero las tareas fallan silenciosamente.
> El frontend sigue funcionando igual.

### Terminal 4 — APScheduler (scrapers)

```bash
cd ~/projects/ai-news-solution
source worker/.venv/bin/activate
python worker/main.py
```

> RSS, Arxiv, DeepMind y HN funcionan sin API keys.
> GitHub scraper necesita `GITHUB_TOKEN` (opcional, cae a 60 req/hr sin él).

---

## Matar el proyecto (en orden correcto)

> ⚠️ `Ctrl+C` y `pkill` solo matan procesos del sistema (Next.js, Celery, Python).
> Los contenedores Docker (Supabase, Redis) requieren comandos propios — no se detienen solos.

### Opción A — Matar todo de un golpe (recomendado)

```bash
# 1. Procesos del sistema
pkill -f "next" 2>/dev/null; pkill -f "celery" 2>/dev/null; pkill -f "main.py" 2>/dev/null

# 2. Contenedores Docker
docker stop ai-news-redis
export PATH="$HOME/.local/bin:$PATH" && supabase stop
```

### Opción B — Terminal por terminal

1. En la terminal de **Next.js** → `Ctrl+C`
2. En la terminal de **Celery** → `Ctrl+C`
3. En la terminal de **APScheduler** → `Ctrl+C`
4. Luego en cualquier terminal:

```bash
docker stop ai-news-redis
export PATH="$HOME/.local/bin:$PATH" && supabase stop
```

### Verificar que todo está muerto

```bash
docker ps                                        # debe mostrar tabla vacía
ss -tlnp | grep -E "543|6379|3000" || echo "OK" # no debe mostrar puertos
pgrep -la "next|celery|python" || echo "limpio"  # no debe mostrar procesos
```

Los tres comandos deben dar salida vacía o "OK/limpio".

---

## Qué puedes ver SIN API Keys

Con solo las Terminales 1 y 2 activas:

| URL | Funciona | Contenido |
|---|---|---|
| `http://localhost:3000/login` | ✅ | Login local |
| `http://localhost:3000/` | ✅ | Feed con 5 artículos de muestra |
| `http://localhost:3000/article/[id]` | ✅ | Vista de detalle completa |
| `http://localhost:3000/watchlist` | ✅ | Gestión de tecnologías seguidas |
| `http://localhost:3000/admin/usage` | ✅ | Dashboard de costos LLM |
| `http://localhost:3000/search?q=rag` | ✅ | Devuelve resultado vacío con mensaje claro |

---

## Variables de entorno necesarias por componente

| Variable | Archivo | Para qué |
|---|---|---|
| `AUTH_SECRET` | `.env.local` | 🔑 JWT firma (ya generado) |
| `AUTH_PASSWORD` | `.env.local` | 🔑 Contraseña de login (cámbiala de `changeme`) |
| `SUPABASE_URL` | `.env.local` | DB local (ya configurado) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | DB local (ya configurado) |
| `OPENAI_API_KEY` | `.env.local` | Solo para búsqueda semántica (`/search`) |
| `ANTHROPIC_API_KEY` | `worker/.env` | Pipeline LangGraph (categorizar, resumir) |
| `OPENAI_API_KEY` | `worker/.env` | Embeddings en el pipeline |
| `GITHUB_TOKEN` | `worker/.env` | Scraper GitHub (opcional) |
| `RESEND_API_KEY` | `worker/.env` | Email digest semanal (opcional) |

---

## Reinicio rápido tras reboot

```bash
cd ~/projects/ai-news-solution
bash setup-docker.sh   # Terminal 1
pnpm dev               # Terminal 2
```

Las terminales 3 y 4 son opcionales hasta que tengas las API keys.
