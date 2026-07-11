# Smart Stock — Production Deployment (MVP)

Deploy Smart Stock on a single Ubuntu VPS behind Cloudflare using Docker Compose.

Architecture overview: [`backend/docs/deployment_architecture.md`](../backend/docs/deployment_architecture.md)

---

## Prerequisites

- Ubuntu 22.04+ VPS (Contabo or similar)
- Docker Engine + Docker Compose plugin
- Domain `stockwealthbd.com` on Cloudflare (proxy enabled)
- UFW: allow `22`, `80`, `443`

---

## 1. Server setup

```bash
sudo apt update && sudo apt install -y git
# Install Docker: https://docs.docker.com/engine/install/ubuntu/

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Clone the repository:

```bash
sudo mkdir -p /opt/smart-stock
sudo chown $USER:$USER /opt/smart-stock
git clone <your-repo-url> /opt/smart-stock
cd /opt/smart-stock
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

Never commit `.env`.

**Config vs admin panel:** Root `.env` feeds backend `Settings` at runtime. Admin → Configuration stores some of the same operational keys in the database, but **env wins today** until DB merge is implemented. Details: [Configuration precedence](../backend/docs/deployment_architecture.md#configuration-precedence).

---

## 3. TLS certificates

Place certificates in `deploy/certs/`:

| File | Permissions |
|------|-------------|
| `fullchain.pem` | `644` |
| `privkey.pem` | `600` |

**Option A — Let's Encrypt (certbot on host):**

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d stockwealthbd.com -d www.stockwealthbd.com -d api.stockwealthbd.com
sudo cp /etc/letsencrypt/live/stockwealthbd.com/fullchain.pem deploy/certs/
sudo cp /etc/letsencrypt/live/stockwealthbd.com/privkey.pem deploy/certs/
sudo chmod 644 deploy/certs/fullchain.pem
sudo chmod 600 deploy/certs/privkey.pem
```

**Option B — Cloudflare Origin Certificate:** Generate in Cloudflare dashboard → SSL/TLS → Origin Server, save files to `deploy/certs/`.

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

Wait for services to become healthy, then run migrations manually:

```bash
docker compose exec backend-api alembic upgrade head
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
curl -fsS https://stockwealthbd.com/build-info.json | jq .
curl -fI https://stockwealthbd.com

docker compose ps
docker compose logs backend-scheduler | tail -30
```

Scheduler logs should show:

```
Scheduler process starting (RUN_SCHEDULER=true)
Market snapshot scheduler started
...
Scheduler process ready — waiting for shutdown signal
```

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
docker compose build
docker compose up -d
docker compose exec backend-api alembic upgrade head
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

## 8. Useful Docker commands

Run all commands from the **repo root** (where `docker-compose.yml` lives), e.g. `/opt/smart-stock`.

**Compose services:** `postgres`, `redis`, `backend-api` (HTTP only), `backend-scheduler` (background jobs), `frontend`, `nginx`.

**Frontend runtime env (dashboard SSR):** `SERVER_API_BASE_URL` must point at the internal API from the frontend container (default in Compose: `http://backend-api:8000/api/v1`). This is separate from build-time `NEXT_PUBLIC_API_BASE_URL`, which the browser uses. Stock detail SSR still uses the public/build-time API URL with Next.js ISR; dashboard core SSR uses the internal URL with `cache: no-store` so Redis remains the only server-side market cache.

> **Note:** `docker compose down` affects the **entire stack**, not a single service. There is no `docker compose down frontend`. To replace one service, use `up` with a service name and `--no-deps`.

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
| `docker compose up -d --build --no-deps frontend` | Frontend-only quick deploy | `--build` = build first; `--no-deps` = don't touch api/scheduler/postgres/nginx | New frontend container; brief frontend-only rollout |
| `docker compose build frontend && docker compose up -d --force-recreate --no-deps frontend` | Frontend-only (script equivalent) | `--force-recreate` guarantees new container from new image | Same as `deploy-frontend.sh` without verification/purge |

### Frontend only

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `bash deploy/scripts/deploy-frontend.sh` | **Recommended** frontend deploy | Sets `APP_VERSION` / `GIT_SHA` / `BUILD_TIME`; optional Cloudflare purge | Build → recreate `frontend` → health + `build-info.json` checks |
| `docker compose up -d --build --no-deps frontend` | Manual frontend deploy | | Rebuilds and starts `frontend` only |
| `docker compose stop frontend` | Stop frontend container | | Site 502 via nginx until started again |
| `docker compose rm -f frontend` | Remove frontend container | | Container gone; image remains; follow with `up` |
| `docker compose logs -f frontend` | Follow frontend logs | | Next.js / Node startup errors |

### Backend — API only (`backend-api`)

HTTP API only. **`RUN_SCHEDULER=false`** — no market sync or scheduled jobs in this container.

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `docker compose up -d --build --no-deps backend-api` | Rebuild and restart API | `--no-deps` | New API processes (Gunicorn workers); scheduler **unchanged** |
| `docker compose restart backend-api` | Quick restart after `.env` change | | Same image; `get_settings()` cache cleared on new process |
| `docker compose exec backend-api alembic upgrade head` | Run DB migrations | | Schema updated; run after backend deploys with migrations |
| `docker compose exec backend-api python -m app.scripts.seed_stocks` | Bootstrap stock universe | First-time / recovery | Data seed only |
| `docker compose logs -f backend-api` | Follow API logs | | Request errors, DB connection issues |

### Backend — full functionality (API + scheduler)

Production needs **both** `backend-api` and `backend-scheduler`. The scheduler runs market snapshots, daily sync, and other jobs (`RUN_SCHEDULER=true`). Restarting only `backend-api` does **not** reload scheduler jobs.

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `bash deploy/scripts/deploy.sh` | **Recommended** full deploy | Build all → recreate all → `alembic upgrade head` → version check | API + scheduler + frontend + nginx all updated |
| `docker compose build backend-api backend-scheduler` | Rebuild shared backend image | Single image used by both services | New `smart-stock-backend:latest` |
| `docker compose up -d --force-recreate --no-deps backend-api backend-scheduler` | Redeploy API + scheduler | `--no-deps` | Both use new image; frontend/nginx keep running |
| `docker compose restart backend-scheduler` | Restart jobs process | | Scheduler re-reads env; jobs restart; **no HTTP** on this container |
| `docker compose logs -f backend-scheduler` | Verify scheduler health | | Expect `RUN_SCHEDULER=true`, job start lines, no crash loop |
| `docker compose exec backend-api alembic upgrade head` | Migrations after backend deploy | Always run after schema changes | Required for API; scheduler depends on same DB schema |

### Data layer & edge

| Command | Purpose | Key flags / params | Outcome |
|---------|---------|-------------------|---------|
| `docker compose up -d postgres` | Start / recreate Postgres | | DB available on `127.0.0.1:5432` on host (SSH tunnel only) |
| `docker compose up -d redis` | Start Redis | Optional cache | Dashboard section cache; omit `REDIS_URL` in `.env` to run without |
| `docker compose restart nginx` | Reload edge proxy | | Picks up cert/config volume changes after file edits on host |
| `docker compose up -d --force-recreate --no-deps nginx` | Recreate nginx container | After `deploy/nginx/` or cert changes | New container mounting current `deploy/certs/` |

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

## 9. Remote database access (DBeaver via SSH tunnel)

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

1. On production: `docker compose exec backend-api alembic upgrade head`
2. From DBeaver: export local database or use **Tools → Restore** / `pg_dump` on data tables
3. Import into the tunneled production connection

Local and production should be on the same Alembic migration head before a data-only restore.

---

## 10. Troubleshooting

| Issue | Check |
|-------|-------|
| API unhealthy | `docker compose logs backend-api` — DB connection, migrations run? |
| Scheduler restart loop | `docker compose logs backend-scheduler` — `RUN_SCHEDULER` must be `true` |
| 502 from Nginx | `docker compose ps` — are frontend and backend-api healthy? |
| CORS errors | `BACKEND_CORS_ORIGINS` includes `https://stockwealthbd.com` |
| Wrong API URL in browser | Rebuild frontend with correct `NEXT_PUBLIC_API_BASE_URL` |
| Stale UI after deploy | Run `bash deploy/scripts/deploy-frontend.sh`; compare `/build-info.json` vs `/api/v1/system` |
| Old version still showing | `docker compose ps frontend` — confirm healthy; check `curl -s …/build-info.json` |

---

## 11. Future: automated migrations

When ready to automate deploys, add a one-shot compose service:

```yaml
backend-migrate:
  image: smart-stock-backend:latest
  command: alembic upgrade head
  restart: "no"
  depends_on:
    postgres:
      condition: service_healthy
```

Not included in the MVP compose file.
