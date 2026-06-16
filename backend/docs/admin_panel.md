# Admin Panel

Lightweight operational admin surface inside the existing Smart Stock Next.js app and FastAPI backend.

## Roles

| Role | Access |
|------|--------|
| `USER` | Standard product access only |
| `ADMIN` | Admin panel read/operate except high-impact controls |
| `SUPER_ADMIN` | Role changes, soft delete, configuration updates, manual job triggers |

## Bootstrap

From `backend/`, add credentials to `.env` (or export them), then run:

```bash
python -m app.scripts.seed_super_admin
alembic upgrade head
```

Example `.env` entries:

```env
SUPER_ADMIN_EMAIL=you@example.com
SUPER_ADMIN_PASSWORD=your-secure-password
SUPER_ADMIN_DISPLAY_NAME=Super Admin
```

The seeder creates or updates one verified `SUPER_ADMIN` account. Keep credentials in `.env` locally and out of version control.

## Frontend routes

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard, data health, recent jobs |
| `/admin/users` | User management and session activity |
| `/admin/configuration` | Safe runtime operational settings (`SUPER_ADMIN`) |
| `/admin/jobs` | `system_job_executions` history and manual triggers (`SUPER_ADMIN`) |
| `/admin/email-campaigns` | Compose, queue, and monitor bulk email campaigns |

Admin navigation appears in the terminal sidebar for `ADMIN` and `SUPER_ADMIN` users.

## Backend modules

| Module | Responsibility |
|--------|----------------|
| `admin_dashboard` | Dashboard overview and data health |
| `admin_users` | User management and `user_sessions` history |
| `admin_configuration` | Safe runtime settings stored in `admin_config_settings` |
| `admin_jobs` | `system_job_executions` and manual job triggers |
| `admin_email_campaigns` | Campaign creation, recipient snapshots, APScheduler processing |

## Login activity

Login activity is captured only at authentication time:

- `user_sessions` stores session/login metadata: IP, device, browser, OS, user agent, success/failure, revocation.
- `users.last_seen_ip`, `users.last_seen_user_agent`, and `users.last_seen_at` provide fast operational visibility.
- JWT access tokens include `session_id` and role claims.

There is no full request/activity middleware and no admin audit log table in this phase.

## Configuration rules

Editable through the admin panel (stored in `admin_config_settings`):

- Scheduler toggles and market session timing
- Stock details / market ingestion feature flags listed in `admin_operational_settings.py`

Never editable through the admin panel:

- JWT secrets
- SMTP credentials
- API keys and AmarStock tokens
- Database URLs and infrastructure secrets
- `RUN_SCHEDULER` and other Docker/process topology flags

### Precedence and runtime behavior

Configuration layers:

```text
core_config.py        → schema + defaults
.env / .env.docker    → values at process start (Docker: repo-root .env via Compose)
admin_config_settings → DB overrides for the operational subset only
```

**Listing in admin UI:** `GET /admin/configuration` shows each safe setting with `source: "environment"` (from `get_settings()`) or `source: "database"` (from `admin_config_settings`).

**Runtime today:** schedulers, ingestion jobs, and most services call `get_settings()`, which reads **environment variables only** (`@lru_cache`). DB overrides are **saved and displayed** but **not merged** into `get_settings()` yet. Until that is implemented:

- **Environment** (local `backend/.env` or production root `.env` from [`.env.docker.example`](../../.env.docker.example)) is what actually drives market schedulers and ingestion flags.
- Admin panel changes to those keys are persisted for operators but do not change live behavior without matching env updates and container restart.

**Production Docker:** use root `.env` for infrastructure secrets and operational defaults. See [`deployment_architecture.md`](deployment_architecture.md#configuration-precedence).

Settings marked `requires_restart: true` (e.g. scheduler toggles) need a process restart when changed via env; restart `backend-scheduler` after operational env updates.

## Email campaigns

Flow:

1. Admin composes subject/body and chooses a recipient scope.
2. API creates a campaign and queues it.
3. Recipients are snapshotted into `email_campaign_recipients` at queue time.
4. APScheduler processes `QUEUED` campaigns in-process every 30 seconds.
5. Delivery results update per-recipient status and create a `system_job_executions` row.

Recipient scopes:

- `ALL_USERS`
- `VERIFIED_USERS`
- `SUBSCRIBED_USERS` (verified users in this phase)
- `NON_ADMIN_USERS`
- `SELECTED_USERS`
- `FILTERED_USERS`

## System jobs

`system_job_executions` tracks operational jobs across the platform:

- market snapshot
- daily market sync
- stock details sync
- indicators
- signals
- email campaigns
- future AI/RAG jobs

Generic fields include `job_type`, `job_name`, `triggered_by_user_id`, `trigger_source`, and `metadata_json`.

Manual triggers are `SUPER_ADMIN` only and wrap existing job entrypoints under `backend/app/jobs/`.

## Data health dashboard

The admin dashboard exposes:

- latest sync timestamps
- failed job count
- suspicious/partial price counts
- active stocks missing latest prices
- overall freshness label
- email campaign health: queued, running, failed, last sent

## At-a-glance operations

```text
Seed super admin
  -> login
  -> open /admin
  -> review dashboard/data health
  -> manage users + session history
  -> update safe config (super admin)
  -> inspect/trigger jobs (super admin)
  -> queue email campaign
  -> APScheduler sends in background
```

## Deferred

- Admin audit log table
- Full request/activity tracking
- Celery/RabbitMQ
- Separate admin application
- Granular permission matrix beyond three roles
- Analytics/reporting screens for login activity
