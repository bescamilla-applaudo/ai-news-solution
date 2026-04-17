# Code Review Report — AI News Intelligence Platform

**Date:** 2026-04-17
**Scope:** PR `feature/docker-fixes` → `develop` (2 commits: Docker build fixes + documentation sync)
**Branch:** `feature/docker-fixes`
**Files reviewed:** 11

---

## Summary

| Category | Checklist § | Status | Findings |
|----------|-------------|--------|----------|
| TypeScript (Frontend) | §1 | — | *Skipped (no TS files changed)* |
| Python (Worker) | §2 | — | *Skipped (no Python files changed)* |
| Security | §3 | — | *Skipped (no security-relevant code changed)* |
| Design Patterns | §4 | — | *Skipped (no application code changed)* |
| Testing | §5 | — | *Skipped (no new code requiring tests)* |
| Database | §6 | — | *Skipped (no migrations changed)* |
| Docker / DevOps | §7 | ⚠️ | 1 |
| Documentation | §8 | ⚠️ | 1 |

---

## Findings

### 🔴 Critical

*None.*

### 🟡 Warning

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 1 | `worker/Dockerfile` | L27-28 | **Worker container inherits embed-server HEALTHCHECK.** The `HEALTHCHECK CMD curl -f http://localhost:8001/health` is baked into the Dockerfile, but the worker service runs `python -m worker.main` (Celery), not the embed server. Since `docker-compose.yml` doesn't override the healthcheck for the `worker` service, Docker will mark it as `unhealthy` permanently. Nothing depends on `worker` with `condition: service_healthy`, so the container keeps running — but `docker ps` will show it as unhealthy, which is misleading. | Add `healthcheck: {disable: true}` to the `worker` service in `docker-compose.yml`, or add a Celery-specific healthcheck (e.g., `celery -A worker.celery_app inspect ping`). |
| 2 | `ARCHITECTURE.md`, `README.md`, `GUIDE.md` | — | **Test counts out of sync with actual codebase.** Actual counts: **75 vitest** (33 API + 25 components + 17 infra), **27 pytest** (24 + 3 categorizer), **7 Playwright** = **109 total**. Discrepancies: ARCHITECTURE.md says "65 vitest" and "7 infrastructure" (actual: 75 and 17). README.md says 27 pytest correctly but ARCHITECTURE.md says 24. GUIDE.md says "96 total" (actual: 109). The `rate-limit.test.ts` grew from 7 → 17 tests but docs weren't updated. | Update all 4 docs (ARCHITECTURE.md, README.md, GUIDE.md, RUNBOOK.md) to reflect: 75 vitest (33 API + 25 components + 17 infra), 24 pytest (excl. categorizer), 27 total pytest, 109 total. |

### 🔵 Info

*None.*

---

## Passing Items

### §7 Docker & DevOps

- ✅ Worker: `COPY . ./worker/` preserves Python package structure
- ✅ Frontend: `.next/` dir created with correct ownership before `USER` switch
- ✅ Both Dockerfiles: non-root `USER` set before `CMD`
- ✅ Worker: `HEALTHCHECK` instruction present
- ✅ Both `.dockerignore` files exclude `node_modules/`, `.venv/`, `.next/`, `.env*`, tests
- ✅ `host.docker.internal:host-gateway` in `extra_hosts` for worker and frontend
- ✅ Redis (`127.0.0.1:6379`), embed-server (`127.0.0.1:8001`), frontend (`127.0.0.1:3000`) bind to loopback only
- ✅ Worker `env_file` → `./worker/.env`
- ✅ `depends_on` with `condition: service_healthy` on redis (worker) and embed-server (frontend)

### §8 Documentation

- ✅ Dockerfile snippets in ARCHITECTURE.md §9 match actual `worker/Dockerfile` and `Dockerfile.frontend`
- ✅ `.dockerignore` documented in ARCHITECTURE.md §9

---

## Score

| Criterion | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Zero critical issues | 30% | 10 | No critical findings |
| Pattern compliance | 20% | 9 | Docker setup follows all project patterns; misleading HEALTHCHECK is minor |
| Security posture | 20% | 10 | Non-root users, loopback-only ports, .env excluded from context |
| Test coverage for changes | 15% | 10 | Docker/docs changes don't require new tests |
| Documentation sync | 15% | 7 | Test counts out of sync across 4 docs |

**Weighted score: 9.35/10**

Formula: `(10×0.30 + 9×0.20 + 10×0.20 + 10×0.15 + 7×0.15) = 3.0 + 1.8 + 2.0 + 1.5 + 1.05 = 9.35`

---

## Verdict

**⚠️ Approved with comments** — No critical issues. The two warnings should be addressed before or shortly after merge:

1. Disable or replace the inherited HEALTHCHECK on the `worker` compose service.
2. Update test counts in all 4 documentation files to match actual counts (75/27/7/109).
