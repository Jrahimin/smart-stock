# Smart Stock Backend

FastAPI backend scaffold for the AI-assisted stock analysis system.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Requirements include **tzdata** so `ZoneInfo("Asia/Dhaka")` works on Windows (scheduler and `sync_market_data` CLI).

## Run

```bash
uvicorn app.main:app --reload
```

Run market sync jobs (writes to PostgreSQL) without starting the API:

```bash
# Intraday snapshot: LatestPrice JSON + DSEX index summary
python -m app.jobs.sync_market_snapshot
python -m app.jobs.sync_market_snapshot --date 2026-06-11

# Daily orchestration: news (optional --snapshot to run snapshot first)
python -m app.jobs.sync_market_data
python -m app.jobs.sync_market_data --snapshot --date 2026-06-11
```

With the API running, in-process schedulers also call `sync_market_snapshot()` every `market_snapshot_interval_minutes` (default 15) during `market_open_time`–`market_close_time` Sun–Thu, and `run_daily_market_sync()` at `daily_market_sync_time` (default 15:15). Configure via `core_config.py` / `.env`.

Run these from the `backend` directory (same as `uvicorn`) with your virtualenv activated and `.env` loaded for `DATABASE_URL`.

Bootstrap **`stocks`** from AmarStock parsed symbols (one-time or refresh on a new database). Run from **`backend/`** (same as other `python -m app....` jobs):

```bash
python -m app.scripts.seed_stocks
python -m app.scripts.seed_stocks --date 2026-05-02
```

See `backend/docs/stocks.md` for behavior, symbol rules, and exit codes.

## Migrations

```bash
alembic revision --autogenerate -m "create initial schema"
alembic upgrade head
```

`DATABASE_URL` may use the normal PostgreSQL form, for example
`postgresql://postgres:*****@localhost:5432/smart_stock`. The app and Alembic convert it to
`postgresql+asyncpg://...` internally, so `psycopg2` is not required.

## Architectural Rules

- Routers validate requests and call services.
- Routers receive services through FastAPI dependency injection.
- Routers use `response_model=ApiResponse[...]` and compose `ApiResponse` envelopes with `success_response`.
- Routers keep return annotations fully aligned with `response_model`, such as `ApiResponse[list[DailyPriceRead]]`.
- Routers convert ORM objects to `Read` schemas where needed to preserve static type safety.
- Routers avoid `typing.cast` for normal response serialization.
- Response `Read` schemas use `from_attributes=True` where they represent ORM models.
- Services receive repositories through dependency injection.
- Services return domain objects and own business workflows plus explicit transaction boundaries.
- Repositories own ORM database access and reuse `core/base_repository.py` for common CRUD primitives without redundant one-line wrappers.
- ORM models live centrally in `app/models.py`.
- `core/database_session.py` provides the async session dependency.
- `core/exception_handlers.py` centralizes exception formatting and logging.
- `core/response_handler.py` centralizes the API response envelope.
- `middlewares/auth_middleware.py` parses optional JWTs, guarantees `request.state.user` exists, and leaves enforcement to route dependencies.
- `modules/auth/` implements registration, email verification, login, refresh, logout, `/me`, password change, and OAuth login. See `docs/authentication.md`.

