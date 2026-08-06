# Smart Stock — Production Deployment (MVP)

Deploy Smart Stock on a single Ubuntu VPS behind Cloudflare using Docker Compose. **Host-level Nginx** (not managed by this repository) terminates TLS on ports 80/443 and reverse-proxies to the Docker stack on loopback.

Architecture overview: [`backend/docs/deployment_architecture.md`](../backend/docs/deployment_architecture.md)

---

## Prerequisites

- Ubuntu 22.04+ VPS (Contabo or similar)
- Docker Engine + Docker Compose plugin
- **Host Nginx** installed and configured for `stockwealthbd.com` and `api.stockwealthbd.com` (TLS certificates and virtual hosts live outside this repo)
- Domain `stockwealthbd.com` on Cloudflare (proxy enabled)
- UFW: allow `22`, `80`, `443`

---

## 1. Server setup

```bash
sudo apt update && sudo apt install -y git
# Install Docker: https://docs.docker.com/engine/install/ubuntu/
# Install and configure host Nginx (see architecture doc for traffic flow)

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Clone the repository:

```bash
sudo mkdir -p /opt/stockwealthbd
sudo chown $USER:$USER /opt/stockwealthbd
git clone <your-repo-url> /opt/stockwealthbd
cd /opt/stockwealthbd
```

---

## 2. Configure environment

```bash
cp .env.docker.example .env
```

Edit `.env` and set at minimum:

- `POSTGRES_PASSWORD` — strong random password
- `JWT_SECRET_KEY` — long random string
- `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` — bootstrap admin
- `NEXT_PUBLIC_API_BASE_URL` — `https://api.stockwealthbd.com/api/v1`
- `NEXT_PUBLIC_SITE_URL` — `https://stockwealthbd.com` (canonical URLs, sitemap, JSON-LD; frontend build-time)
- OAuth / SMTP values if used
- `SYSTEM_JOB_QUEUE_POLL_SECONDS` — normally `10`
- `STOCK_DETAILS_SYNC_SCHEDULER_ENABLED` — set explicitly for the rollout
- `STOCK_DETAILS_SYNC_TIME` / `STOCK_DETAILS_SYNC_BATCH_SIZE` — normally `15:35` and `50`

Never commit `.env`.

**Config vs admin panel:** Root `.env` feeds backend `Settings` at runtime. Admin → Configuration stores some of the same operational keys in the database, but **env wins today** until DB merge is implemented. Details: [Configuration precedence](../backend/docs/deployment_architecture.md#configuration-precedence).

---

## 3. Host Nginx and TLS

TLS certificates and virtual-host configuration are **managed outside this repository** on the VPS host Nginx.

Traffic flow:

```text
Cloudflare → host Nginx (:443) → loopback upstreams
  stockwealthbd.com      → 127.0.0.1:3000  (frontend)
  api.stockwealthbd.com  → 127.0.0.1:8000  (backend-api)
```

Host Nginx should:

- Terminate TLS (Cloudflare SSL mode: **Full (strict)**)
- Set `X-Forwarded-Proto https` and forward `CF-Connecting-IP` / `X-Forwarded-For`
- Restore real client IP from Cloudflare (`real_ip_header CF-Connecting-IP` and Cloudflare IP ranges)
- Redirect `www.stockwealthbd.com` to `stockwealthbd.com`
- Serve ACME challenges on port 80 if using Let's Encrypt on the host

Deploy scripts **do not** restart, reload, or modify host Nginx.

---

## 4. Cloudflare DNS

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | VPS IP | Proxied |
| A | `api` | VPS IP | Proxied |

SSL/TLS mode: **Full (strict)**

---

## 5. Build and start

```bash
docker compose build
docker compose up -d
```

The `backend-migrate` one-shot service runs migrations before the API and
scheduler are allowed to start:

```bash
docker compose ps -a backend-migrate
```

For migration-only recovery, run:

```bash
docker compose run --rm backend-migrate
```

First-time data bootstrap:

```bash
docker compose exec backend-api python -m app.scripts.seed_stocks
docker compose exec backend-api python -m app.scripts.seed_super_admin
```

---

## 6. Verify

```bash
curl -f https://api.stockwealthbd.com/api/v1/health
curl -f https://api.stockwealthbd.com/api/v1/health/ready
curl -fsS https://api.stockwealthbd.com/api/v1/system | jq .data
curl -fsS "https://api.stockwealthbd.com/api/v1/market/pulse/summary?exchange=DSE" | jq .success
curl -fsS "https://api.stockwealthbd.com/api/v1/market/freshness?exchange=DSE" | jq .success
curl -fsS https://stockwealthbd.com/build-info.json | jq .
curl -fI https://stockwealthbd.com
```

`deploy.sh` runs the pulse/freshness/overview smoke checks automatically after `/system`. A `422` on pulse summary usually means a broken FastAPI dependency import — treat it as a failed deploy.

docker compose ps
docker compose logs backend-scheduler | tail -30
```

Scheduler logs should show:

```
Scheduler process starting (RUN_SCHEDULER=true)
System job queue worker started (poll=10s)
Market snapshot scheduler started
...
Scheduler process ready — waiting for shutdown signal
```

After signing in as an administrator, verify Admin → Dashboard shows the
`backend-scheduler` heartbeat as **Online**. It becomes Offline when the latest
persisted heartbeat is older than two minutes; the configured scheduler toggles
are displayed separately from liveness.

Register OAuth production origins (Google Console, Facebook app) for `https://stockwealthbd.com`.

---

## 7. Subsequent deploys

Use the deploy scripts so every release gets fresh build metadata, a rebuilt frontend, container recreation, and optional Cloudflare purge.

**Frontend-only** (UI/CSS/JS or `NEXT_PUBLIC_*` changes):

```bash
git pull
bash deploy/scripts/deploy-frontend.sh
```

**Full stack** (backend + frontend + migrations):

```bash
git pull
bash deploy/scripts/deploy.sh
```

Manual equivalent (not recommended — skips version verification and Cloudflare purge):

```bash
git pull
docker compose up -d --build
```

### Identify the running version

```bash
curl -s https://api.stockwealthbd.com/api/v1/system | jq .data
curl -s https://stockwealthbd.com/build-info.json | jq .
```

Example:

```json
{
  "version": "2026.06.18.3",
  "git_sha": "7e2a9d1",
  "build_time": "2026-06-18T16:30:00Z"
}
```

After a full deploy, backend `/api/v1/system` and frontend `/build-info.json` should match.

Set `CF_API_TOKEN` and `CF_ZONE_ID` in `.env` to purge Cloudflare automatically after deploy. Cache rules: [`deploy/cloudflare/cache-rules.md`](cloudflare/cache-rules.md).

---

## 8. Migrating from project-owned Nginx

If the VPS previously ran the Docker `nginx` service with `deploy/nginx/` and `deploy/certs/`:

1. **Configure host Nginx** with virtual hosts pointing to `127.0.0.1:3000` (frontend) and `127.0.0.1:8000` (API). Move TLS certificates to the host (e.g. `/etc/letsencrypt/` or `/etc/ssl/stockwealthbd/`).
2. **Test host Nginx** with `nginx -t`, then `sudo systemctl reload nginx`.
3. **Stop the old stack** (or at least the Docker nginx container) so ports 80/443 are free for host Nginx if it was not already bound.
4. **Update the repo** at `/opt/stockwealthbd` (rename from `/opt/smart-stock` if needed): `git pull`.
5. **Recreate the stack:** `docker compose up -d --build` — confirm `127.0.0.1:3000` and `127.0.0.1:8000` are listening.
6. **Remove obsolete artifacts:** delete `deploy/nginx/`, `deploy/certs/`, and any stopped `smart-stock-nginx` container (`docker compose rm -f nginx` on the old compose file if needed).
7. **Verify:** public HTTPS curls from section 6; loopback checks: `curl -f http://127.0.0.1:3000/build-info.json` and `curl -f http://127.0.0.1:8000/api/v1/health`.

Deploy scripts do not manage host Nginx — reload or reconfigure it separately when changing TLS or proxy rules.

---

## 9. Useful Docker commands

Run all commands from the **repo root** (where `docker-compose.yml` lives), e.g. `/opt/stockwealthbd`.

**Compose services:** `postgres`, `redis`, `backend-migrate` (one-shot schema job), `backend-api` (HTTP only), `backend-scheduler` (background jobs), `frontend`.

**Loopback ports (host Nginx upstreams):** frontend `127.0.0.1:3000`, backend-api `127.0.0.1:8000`.

**Frontend runtime env (dashboard SSR):** `SERVER_API_BASE_URL` must point at the internal API from the frontend container (default in Compose: `http://backend-api:8000/api/v1`). This is separate from build-time `NEXT_PUBLIC_API_BASE_URL`, which the browser uses. Stock detail SSR still uses the public/build-time API URL with Next.js ISR; dashboard core SSR uses the internal URL with `cache: no-store` so Redis remains the only server-side market cache.

> **Note:** `docker compose down` affects the **entire stack**, not a single service. There is no `docker compose down frontend`. Frontend-only replacements can use `--no-deps`; backend replacements should retain the migration dependency.

### Stack lifecycle

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `docker compose up -d` | Start all services (create if missing) | `-d` = detached (background) | All containers running; uses existing images unless config changed |
| `docker compose down` | Stop and remove **all** containers | *(none)* | Site offline; **named volumes kept** (`postgres_data` survives) |
| `docker compose down -v` | Stop stack and delete volumes | `-v` = remove named volumes | **Destructive** — wipes Postgres data unless you have a backup |
| `docker compose ps` | Show container status | | Running / healthy / exited per service |
| `docker compose logs <service>` | Tail service logs | `--tail=100`, `-f` (follow) | Debug crashes, scheduler jobs, API errors |
| `docker compose restart <service>` | Restart without rebuild | e.g. `backend-api` | New process, **same image**; picks up `.env` changes after recreate may be needed for some vars |

### Deploy / rebuild (manual)

Prefer `bash deploy/scripts/deploy-frontend.sh` or `deploy.sh` for version checks and Cloudflare purge. Manual equivalents:

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `docker compose build` | Rebuild **all** images | | New images tagged `smart-stock-backend:latest`, `smart-stock-frontend:latest` |
| `docker compose build frontend` | Rebuild frontend only | | Required after UI/CSS/JS or `NEXT_PUBLIC_*` changes |
| `docker compose build backend-api backend-scheduler` | Rebuild backend image | Both services share `smart-stock-backend:latest` | Required after Python/API code changes |
| `docker compose up -d --force-recreate` | Recreate all containers | `--force-recreate` = replace even if config unchanged | Full stack uses freshly built images |
| `docker compose up -d --build --no-deps frontend` | Frontend-only quick deploy | `--build` = build first; `--no-deps` = don't touch api/scheduler/postgres | New frontend container; brief frontend-only rollout |
| `docker compose build frontend && docker compose up -d --force-recreate --no-deps frontend` | Frontend-only (script equivalent) | `--force-recreate` guarantees new container from new image | Same as `deploy-frontend.sh` without verification/purge |

### Frontend only

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `bash deploy/scripts/deploy-frontend.sh` | **Recommended** frontend deploy | Sets `APP_VERSION` / `GIT_SHA` / `BUILD_TIME`; optional Cloudflare purge | Build → recreate `frontend` → health + `build-info.json` checks |
| `docker compose up -d --build --no-deps frontend` | Manual frontend deploy | | Rebuilds and starts `frontend` only |
| `docker compose stop frontend` | Stop frontend container | | Site 502 via host Nginx until started again |
| `docker compose rm -f frontend` | Remove frontend container | | Container gone; image remains; follow with `up` |
| `docker compose logs -f frontend` | Follow frontend logs | | Next.js / Node startup errors |

### Backend — API only (`backend-api`)

HTTP API only. **`RUN_SCHEDULER=false`** — no market sync or scheduled jobs in this container.

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `docker compose up -d --build backend-api` | Rebuild and restart API | Starts migration dependency first | New API processes (Gunicorn workers); scheduler **unchanged** |
| `docker compose restart backend-api` | Quick restart after `.env` change | | Same image; `get_settings()` cache cleared on new process |
| `docker compose run --rm backend-migrate` | Run DB migrations manually | | Recovery/migration-only path |
| `docker compose exec backend-api python -m app.scripts.seed_stocks` | Bootstrap stock universe | First-time / recovery | Data seed only |
| `docker compose logs -f backend-api` | Follow API logs | | Request errors, DB connection issues |

### Backend — full functionality (API + scheduler)

Production needs **both** `backend-api` and `backend-scheduler`. The scheduler
produces market snapshot, daily sync, and due stock-details work, executes the
durable PostgreSQL queue, and records its heartbeat (`RUN_SCHEDULER=true`).
Restarting only `backend-api` does **not** reload scheduler jobs.

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `bash deploy/scripts/deploy.sh` | **Recommended** full deploy | Build all → recreate all → migration service → `/system` + market API smoke checks | API + scheduler + frontend all updated |
| `docker compose build backend-api backend-scheduler` | Rebuild shared backend image | Single image used by both services | New `smart-stock-backend:latest` |
| `docker compose up -d --build backend-api backend-scheduler` | Redeploy API + scheduler | Starts migration dependency first | Both use new image; frontend keeps running |
| `docker compose restart backend-scheduler` | Restart jobs process | | Scheduler re-reads env; jobs restart; **no HTTP** on this container |
| `docker compose logs -f backend-scheduler` | Verify scheduler health | | Expect queue-runtime and producer start lines, no crash loop; confirm persisted heartbeat in Admin |
| `docker compose run --rm backend-migrate` | Migrations after backend deploy | Recovery path | API and scheduler are gated on migration success |

### Data layer

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `docker compose up -d postgres` | Start / recreate Postgres | | DB available on `127.0.0.1:5432` on host (SSH tunnel only) |
| `docker compose up -d redis` | Start Redis | Optional cache | Dashboard section cache; omit `REDIS_URL` in `.env` to run without |

### Inspect running version

| Command | Purpose | Outcome |
|---------|---------|---------|
| `curl -s https://api.stockwealthbd.com/api/v1/system \| jq .data` | Backend version | `version`, `git_sha`, `build_time` |
| `curl -s https://stockwealthbd.com/build-info.json \| jq .` | Frontend version | Should match backend after full deploy |
| `docker compose exec -T frontend wget -qO- http://127.0.0.1:3000/build-info.json` | Frontend version inside container | Bypasses Cloudflare |

### Flags cheat sheet

| Flag | Meaning |
|------|---------|
| `-d` | Detached — run in background |
| `--build` | Build image(s) before starting |
| `--force-recreate` | Replace container even if Compose thinks nothing changed |
| `--no-deps` | Do not start/recreate dependency services (use for single-service deploys) |
| `-v` (on `down`) | Remove named volumes — **deletes Postgres data** |

---

## 10. Remote database access (DBeaver via SSH tunnel)

Postgres is published on the VPS **loopback only** (`127.0.0.1:5432`). It is not reachable from the public internet. Do **not** open port 5432 in UFW.

After changing `docker-compose.yml`, recreate the postgres container on the VPS:

```bash
docker compose up -d postgres
```

### 1. SSH tunnel (Windows PowerShell or terminal)

Keep this session open while using DBeaver:

```bash
ssh -L 5433:127.0.0.1:5432 junayed@173.212.215.28
```

- Local port `5433` avoids clashing with a Postgres instance on your machine at `5432`.
- Use your VPS IP or hostname instead of `173.212.215.28` if it changed.

### 2. DBeaver connection

Create a **PostgreSQL** connection:

| Setting | Value |
|---------|--------|
| Host | `localhost` |
| Port | `5433` |
| Database | `smart_stock` (or `POSTGRES_DB` from `.env`) |
| Username | `smartstock` (or `POSTGRES_USER` from `.env`) |
| Password | `POSTGRES_PASSWORD` from root `.env` |

**Optional:** DBeaver can manage the tunnel under **SSH** → enable **Use SSH Tunnel**, host `173.212.215.28`, user `junayed`, then set DB host `127.0.0.1` and port `5432` (remote side inside the VPS).

### 3. Copying local data to production

1. On production: `docker compose run --rm backend-migrate`
2. From DBeaver: export local database or use **Tools → Restore** / `pg_dump` on data tables
3. Import into the tunneled production connection

Local and production should be on the same Alembic migration head before a data-only restore.

---

## 11. Troubleshooting

| Issue | Check |
|-------|-------|
| API unhealthy | `docker compose logs backend-api` — DB connection, migrations run? |
| Scheduler restart loop | `docker compose logs backend-scheduler` — `RUN_SCHEDULER` must be `true` |
| Scheduler shown Offline | Check `backend-scheduler` logs and database connectivity; Admin requires a persisted heartbeat no older than two minutes |
| Admin job remains Pending | Check the scheduler container is running and `SYSTEM_JOB_QUEUE_POLL_SECONDS`; only the dedicated scheduler claims work |
| Abandoned job shown Failed | Expected after scheduler restart; inspect recoverable error metadata and enqueue again if safe |
| 502 from host Nginx | `docker compose ps` — are frontend and backend-api healthy? `curl -f http://127.0.0.1:3000/build-info.json` and `curl -f http://127.0.0.1:8000/api/v1/health` on the VPS |
| CORS errors | `BACKEND_CORS_ORIGINS` includes `https://stockwealthbd.com` |
| Wrong API URL in browser | Rebuild frontend with correct `NEXT_PUBLIC_API_BASE_URL` |
| Stale UI after deploy | Run `bash deploy/scripts/deploy-frontend.sh`; compare `/build-info.json` vs `/api/v1/system` |
| Old version still showing | `docker compose ps frontend` — confirm healthy; check `curl -s …/build-info.json` |

---

## 12. Migration safety

The one-shot migration service is intentionally separate from the API image
entrypoint. Failed migrations leave the API and scheduler stopped, making the
deployment failure visible instead of serving application code against an old
schema. Do not use `alembic stamp head` to bypass a failed migration; repair the
database or migration first.
