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
| `/admin/users/{user_id}` | Read-only user profile, sign-in methods, portfolio, preferences, and sessions |
| `/admin/configuration` | Safe runtime operational settings (`SUPER_ADMIN`) |
| `/admin/jobs` | `system_job_executions` history and manual triggers (`SUPER_ADMIN`) |
| `/admin/email-campaigns` | Compose, queue, and monitor bulk email campaigns |
| `/admin/tax-planner` | Maintain active tax rules and global investment categories |

Admin navigation appears in the terminal sidebar for `ADMIN` and `SUPER_ADMIN` users.

## Backend modules

| Module | Responsibility |
|--------|----------------|
| `admin_dashboard` | Dashboard overview and data health |
| `admin_users` | User management and `user_sessions` history |
| `admin_configuration` | Safe runtime settings stored in `admin_config_settings` |
| `admin_jobs` | Durable `system_job_executions` queue, history, and manual enqueue API |
| `admin_email_campaigns` | Campaign creation, recipient snapshots, APScheduler processing |
| `wealth/tax_config` | Tax calculator config (3-table model), public config API, admin maintenance |

## Tax Planner admin

Route: `/admin/tax-planner` (`SUPER_ADMIN` write; `ADMIN` read).

Tabs:

- **Tax Rules** — display metadata, thresholds, rebate, minimum tax amounts, progressive slabs
- **Investment Categories** — global labels, sort order, enabled flags

Changes apply immediately on save (resolver cache invalidation). No draft/publish workflow.

See [`tax_planner_v2.md`](tax_planner_v2.md).

## Login activity

Login activity is captured only at authentication time:

- `user_sessions` stores session/login metadata: IP, device, browser, OS, user agent, success/failure, revocation.
- `users.last_seen_ip`, `users.last_seen_user_agent`, and `users.last_seen_at` provide fast operational visibility.
- JWT access tokens include `session_id` and role claims.

There is no full request/activity middleware and no admin audit log table in this phase.

## User details

The user directory links to `/admin/users/{user_id}` for an admin-only detail workspace.
It combines:

- complete stored profile and account state;
- safe linked-provider names from `user_identities` (provider subject identifiers are not exposed);
- portfolio/watchlist presence, counts, notes, last edit time, and daily summary email preference;
- a read-only target-user portfolio workspace using the same valuation and decision calculations as
  the user's portfolio;
- paginated authentication history from `user_sessions`.

Admin APIs:

- `GET /api/v1/admin/users/{user_id}/details`
- `GET /api/v1/admin/users/{user_id}/portfolio?exchange=DSE`
- `GET /api/v1/admin/users/{user_id}/sessions?limit=25&offset=0`

`user_identities.provider = "google"` means Google OAuth is linked to the account. The current
session schema does not record the provider used for each individual login, so the UI does not
attribute a particular session to Google. Sessions that are not logged out or revoked are labelled
as recorded logins rather than active sessions because continuous request activity is not tracked.

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

Generic fields include `job_type`, `job_name`, `dedupe_key`, `triggered_by_user_id`,
`trigger_source`, and `metadata_json`.

Manual triggers are `SUPER_ADMIN` only. They enqueue `PENDING` work and return HTTP `202`
without running ingestion inside the API request.

The `/admin/jobs` manual controls expose only:

- **Market Snapshot** — one validated LIVE price/DSEX publication attempt.
- **Daily Close, News & Finalization** — daily news ingestion plus DSEX finalization when inputs exist.
- **Stock Details Batch (20)** — at most 20 DSE stocks in the default full scope.

Equivalent active requests return the existing row rather than failing or creating duplicate
work. The UI polls while `PENDING`/`RUNNING`, supports type/status/source/date filters, and shows
request/result/error metadata in the execution drawer. Market-session no-work outcomes are
terminal `SKIPPED` executions. Indicators and Signals remain absent from manual UI actions.
Existing execution rows remain visible to `ADMIN` and `SUPER_ADMIN`; enqueue remains
`SUPER_ADMIN` only.

The dedicated `backend-scheduler` claims rows transactionally with `FOR UPDATE SKIP LOCKED`,
runs one operational job at a time, recovers abandoned `RUNNING` rows on startup, and removes
terminal history older than 90 days. See [`admin_job_queue.md`](admin_job_queue.md).

## Data health dashboard

The admin dashboard reads operational domain tables directly; generic job history is not treated
as proof that market data exists.

- **Market Snapshot** — newest `LIVE` row in `market_data_generations`, including session date,
  source/publish timestamps, fetched/accepted coverage, and suspicious count.
- **Daily Close & Finalization** — newest finalized DSEX row in `daily_market_summaries`.
- **Stock Details** — newest successful/partial `stock_details_sync_jobs` row, current due-stock
  backlog, and recorded completed/failed counts.
- **Missing Prices** — active DSE stocks with no `daily_prices` row for the newest LIVE generation
  date.
- **Suspicious Prices** and **Expected No-Trade** — scoped to that newest generation date only.
  Zero-OHLC source placeholders are informational no-trade rows and are not counted as missing.
- Market health values are data-only `CURRENT`, `DELAYED`, `STALE`, or `MISSING` states with a
  reason and last successful source timestamp.
- Scheduler liveness comes only from the persisted `backend-scheduler` heartbeat: `ONLINE` at
  no more than two minutes old, `OFFLINE` when older, and `UNKNOWN` when missing. Enabled flags
  and next-run timestamps are shown separately.
- Email campaign health remains queued, running, failed, and last-sent counts/timing.

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
