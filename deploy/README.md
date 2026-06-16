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

```bash
git pull
docker compose build
docker compose up -d
docker compose exec backend-api alembic upgrade head
```

Rebuild the frontend image whenever `NEXT_PUBLIC_*` variables change.

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| API unhealthy | `docker compose logs backend-api` — DB connection, migrations run? |
| Scheduler restart loop | `docker compose logs backend-scheduler` — `RUN_SCHEDULER` must be `true` |
| 502 from Nginx | `docker compose ps` — are frontend and backend-api healthy? |
| CORS errors | `BACKEND_CORS_ORIGINS` includes `https://stockwealthbd.com` |
| Wrong API URL in browser | Rebuild frontend with correct `NEXT_PUBLIC_API_BASE_URL` |

---

## Future: automated migrations

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
