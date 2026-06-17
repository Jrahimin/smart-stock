# Production Deployment Architecture

This document explains how Smart Stock is deployed to production: components, traffic flow, and the design choices behind the Docker setup.

For step-by-step commands, see [`deploy/README.md`](../../deploy/README.md).

---

## Overview

Production runs on a **single Ubuntu VPS** (Contabo) using **Docker Compose**. **Cloudflare** sits in front as DNS proxy, WAF, and CDN. **Nginx** on the VPS terminates TLS (Full Strict with Cloudflare) and reverse-proxies to internal containers.

| Domain | Service |
|--------|---------|
| `stockwealthbd.com` | Next.js frontend |
| `api.stockwealthbd.com` | FastAPI backend |

PostgreSQL is **internal only** — not exposed on the host.

---

## Components

```mermaid
flowchart TB
    subgraph internet [Internet]
        Browser[Browser]
    end

    subgraph cloudflare [Cloudflare]
        CF[DNS proxy + WAF + CDN]
    end

    subgraph vps [Contabo VPS]
        Nginx[Nginx :443 TLS]

        subgraph docker [Docker app-network]
            FE[frontend :3000]
            API[backend-api :8000]
            SCH[backend-scheduler]
            PG[(postgres :5432)]
            RD[(redis :6379 optional)]
        end
    end

    Browser --> CF
    CF --> Nginx
    Nginx --> FE
    Nginx --> API
    API --> PG
    API -.->|optional cache| RD
    SCH --> PG
    SCH -.->|invalidate on sync| RD
    Browser -.->|API calls| CF
```

| Component | Role | Process |
|-----------|------|---------|
| **Cloudflare** | Public edge — DNS, TLS to visitors, DDoS protection | Managed service |
| **Nginx** | Origin TLS, reverse proxy, real client IP from `CF-Connecting-IP` | `nginx:1.27-alpine` |
| **frontend** | Next.js App Router (standalone build) | `node server.js` |
| **backend-api** | REST API | Gunicorn + Uvicorn workers |
| **backend-scheduler** | Background jobs only — no HTTP | `python -m app.jobs.scheduler` |
| **postgres** | Primary database | `postgres:17-alpine` |
| **redis** | Optional dashboard section cache | `redis:7-alpine` — omit `REDIS_URL` to run without Redis |

Dashboard cache architecture: [market_dashboard.md](market_dashboard.md).

---

## Request flows

### Browser → frontend

```mermaid
sequenceDiagram
    participant Browser
    participant Cloudflare
    participant Nginx
    participant Frontend

    Browser->>Cloudflare: HTTPS stockwealthbd.com
    Cloudflare->>Nginx: HTTPS origin
    Nginx->>Frontend: HTTP frontend:3000
    Frontend-->>Browser: HTML / JS / assets
```

### Browser → API

```mermaid
sequenceDiagram
    participant Browser
    participant Cloudflare
    participant Nginx
    participant API
    participant Postgres

    Browser->>Cloudflare: HTTPS api.stockwealthbd.com/api/v1/...
    Cloudflare->>Nginx: HTTPS origin
    Nginx->>API: HTTP backend-api:8000
    Note over Nginx,API: X-Forwarded-Proto https
    API->>Postgres: async SQLAlchemy
    Postgres-->>API: data
    API-->>Browser: JSON response
```

The frontend calls the API **from the browser** using `NEXT_PUBLIC_API_BASE_URL` (baked at Docker build time). Server-side Next.js does not proxy API traffic through Nginx internally.

---

## Why API and scheduler are split

Market data and email jobs previously started inside the FastAPI process (`app.main` lifespan). That breaks down with **Gunicorn multi-worker** — each worker would start duplicate schedulers.

**Solution:**

| Container | `RUN_SCHEDULER` | Runs |
|-----------|-----------------|------|
| `backend-api` | `false` | HTTP only (2+ workers) |
| `backend-scheduler` | `true` | `python -m app.jobs.scheduler` — no FastAPI |

The scheduler entrypoint:

- **Fail-fast** if `RUN_SCHEDULER=false`
- **Fail-fast** (exit 1) if initialization fails — Docker `restart: unless-stopped` recovers
- **Graceful shutdown** on SIGTERM/SIGINT — stops APScheduler and cancels asyncio market-data tasks
- **No HTTP healthcheck** — operability via `docker compose logs backend-scheduler`

Per-job toggles (`MARKET_SNAPSHOT_SCHEDULER_ENABLED`, `DAILY_MARKET_SYNC_SCHEDULER_ENABLED`) are read from **environment** at scheduler startup. See [Configuration precedence](#configuration-precedence) for how admin DB settings relate to Docker env.

---

## Configuration precedence

Backend settings come from several places. They are **not** duplicate config systems — they are layers with different roles.

```text
core_config.py     → schema + defaults (what settings exist)
.env.docker / .env → values injected at container or process start
admin_config_settings → optional DB overrides (subset, admin UI)
```

`get_settings()` in [`core_config.py`](../app/core/core_config.py) loads **`Settings` from environment variables** (cached with `@lru_cache`). Docker Compose injects the repo-root `.env` into `backend-api` and `backend-scheduler`. [`.env.docker.example`](../../.env.docker.example) is the production template for that file — it does not bypass `core_config.py`; it **feeds** it.

### What each layer controls

| Category | Examples | Admin panel | Runtime source today |
|----------|----------|-------------|----------------------|
| **Infrastructure** | `DATABASE_URL`, `JWT_SECRET_KEY`, SMTP, OAuth secrets, `RUN_SCHEDULER`, `WEB_CONCURRENCY`, `FORWARDED_ALLOW_IPS`, `BACKEND_CORS_ORIGINS`, `FRONTEND_BASE_URL` | Not editable | **Environment only** |
| **Operational** | `MARKET_*` times, scheduler toggles, `AMARSTOCK_*_ENABLED` ingestion flags | Editable (`SAFE_OPERATIONAL_SETTINGS`) | **Environment only** (see caveat) |
| **Frontend (browser)** | `NEXT_PUBLIC_API_BASE_URL`, feature flags | Not applicable | **Docker build time** only |

`RUN_SCHEDULER` is set **per service** in `docker-compose.yml` (`false` on `backend-api`, `true` on `backend-scheduler`). It is not admin-editable and gates whether a process may start schedulers at all.

### Intended vs current behavior (admin DB)

[`admin_panel.md`](admin_panel.md) describes operational settings as overridable in `admin_config_settings`. The admin UI lists each key with `source: "environment"` or `source: "database"`.

**Current runtime:** schedulers and jobs call `get_settings()` directly. That reads **env only** — it does **not** merge DB rows from `admin_config_settings`. So:

- Values in `.env` (from `.env.docker.example` on the VPS) are what production **actually runs with** after container start.
- Changes in **Admin → Configuration** are **persisted and shown in the UI**, but **do not automatically change** scheduler or ingestion behavior until an effective-settings resolver is implemented.

This applies equally in local dev and Docker; Docker only makes the env layer more visible because all backend config goes through root `.env` + compose.

### Practical rules for production

| If you need to change… | Do this |
|------------------------|---------|
| Secrets, DB URL, CORS, mail, JWT | Edit root `.env`, then `docker compose up -d` (restart api + scheduler) |
| Default market / ingestion behavior | Edit root `.env` first; treat admin panel as stored preferences until DB→runtime merge exists |
| Whether schedulers run in a container | `RUN_SCHEDULER` in `docker-compose.yml` (not admin) |
| Public API URL in the browser | `NEXT_PUBLIC_*` in `.env`, then `docker compose build frontend` |

After any env change, restart affected containers. `get_settings()` is cached for the process lifetime.

### Overlap without automatic conflict

The same keys (e.g. `MARKET_SNAPSHOT_SCHEDULER_ENABLED`) can appear in both `.env` and `admin_config_settings`. There is no file-level conflict, but the UI may show a DB value while the scheduler still uses the env value. **Env wins at runtime** until DB merge is built.

Scheduler toggles in admin are marked `requires_restart: true` — even after DB merge, `backend-scheduler` would need a restart to pick up changes.

### Related docs

- Full admin rules: [`admin_panel.md`](admin_panel.md)
- Local env template: [`backend/.env.example`](../.env.example)
- Docker env template: [`.env.docker.example`](../../.env.docker.example)

---

## TLS and proxy trust

```text
Browser ──TLS──► Cloudflare ──TLS──► Nginx ──HTTP──► backend-api:8000
```

- **Cloudflare SSL mode:** Full (strict) — origin must present a valid certificate.
- **Certificates:** Let's Encrypt or Cloudflare Origin Certificate in `deploy/certs/`.
- **Gunicorn `forwarded_allow_ips`:** Restricted to `127.0.0.1` and Docker subnet `172.28.0.0/16` — only Nginx reaches the API on the internal network. Cloudflare never contacts Gunicorn directly, so Cloudflare IP ranges are configured in **Nginx** (`real_ip_header CF-Connecting-IP`), not in Gunicorn.

---

## Database and migrations (MVP)

- PostgreSQL 17 Alpine with a named volume `postgres_data`.
- **Migrations are manual** after first `docker compose up -d`:

  ```bash
  docker compose exec backend-api alembic upgrade head
  ```

- Readiness: `GET /api/v1/health/ready` runs `SELECT 1` — used by the `backend-api` Docker healthcheck.

A one-shot `backend-migrate` compose service may be added later for automated deploys.

---

## Environment variables

| Variable | When set | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_*` | **Docker build** (`docker compose build`) | Baked into frontend JS; not backend `Settings` |
| `JWT_SECRET_KEY`, `DATABASE_URL`, etc. | **Runtime** (root `.env`) | Never commit secrets; feeds `get_settings()` |
| `RUN_SCHEDULER` | **Per service** in compose | `false` on api, `true` on scheduler |
| `FORWARDED_ALLOW_IPS` | **backend-api** runtime | Docker internal subnet |

Copy [`.env.docker.example`](../../.env.docker.example) to `.env` at the repo root.

Operational keys in that file overlap with admin-editable settings — see [Configuration precedence](#configuration-precedence).

---

## Security choices

| Choice | Rationale |
|--------|-----------|
| Non-root containers | `appuser` (backend), `node` (frontend), official image users (postgres, nginx) |
| Postgres not on public interface | Bound to `127.0.0.1:5432` on the host for SSH tunnel access only; no UFW rule for 5432 |
| Log rotation on api/scheduler/nginx | `json-file` max 10m × 5 files — prevents disk fill on single VPS |
| Internal Docker network | Services resolve by name (`postgres`, `backend-api`, `frontend`) — never `localhost` |

---

## Local development vs production

| | Local | Production Docker |
|---|-------|-------------------|
| API | `uvicorn app.main:app --reload` | Gunicorn in `backend-api` |
| Schedulers | Optional `RUN_SCHEDULER=true` with uvicorn | Dedicated `backend-scheduler` container |
| Database | `localhost:5432` | `postgres:5432` |
| Frontend API URL | `http://localhost:8000/api/v1` | `https://api.stockwealthbd.com/api/v1` (build-time) |

---

## File map

```
docker-compose.yml          # Service definitions
.env.docker.example         # Environment template
deploy/
  README.md                 # Operational runbook
  nginx/                    # Reverse proxy config
  certs/                    # TLS certificates (gitignored)
  scripts/                  # backend entrypoint, postgres wait
backend/Dockerfile
frontend/Dockerfile
```

---

## Deferred (not in MVP)

- `backend-migrate` one-shot compose service
- CI/CD pipelines and image registries
- Automated backups and monitoring stacks
