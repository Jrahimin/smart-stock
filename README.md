# Smart Stock

AI-assisted stock analysis for the Bangladesh stock market (DSE/CSE).

| Area | Stack |
|------|--------|
| `backend/` | FastAPI, async SQLAlchemy, PostgreSQL |
| `frontend/` | Next.js App Router, TypeScript |

## Quick start (backend)

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Windows
pip install -r requirements.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

On a **fresh database**, seed symbols first:

```bash
python -m app.scripts.seed_stocks
```

Details: [`backend/docs/stocks.md`](backend/docs/stocks.md).

## Market data commands

Run from **`backend/`** with venv active and `.env` loaded. Trade dates default to **today in Asia/Dhaka** unless `--date` is set.

| Goal | Command |
|------|---------|
| Live snapshot (prices + DSEX) | `python -m app.jobs.sync_market_data` |
| Snapshot + news | `python -m app.jobs.sync_market_data --with-news` |
| News only | `python -m app.jobs.sync_market_data --news-only` |
| **Backfill a past trading day** | `python -m app.jobs.backfill_daily_prices --date YYYY-MM-DD` |
| Backfill a date range | `python -m app.jobs.backfill_daily_prices --from YYYY-MM-DD --to YYYY-MM-DD` |

**Important:** `sync_market_data` pulls **live** AmarStock LatestPrice JSON. `--date` only sets the stored `trade_date` — it does **not** fetch historical OHLCV. Use **`backfill_daily_prices`** for missed session days (DSE day-end archive).

With the API running, schedulers handle snapshot (~every 15 min, Sun–Thu session) and daily news automatically. See [`backend/docs/market_data.md`](backend/docs/market_data.md).

## Stock details (fundamentals)

For company financials, valuation, shareholding, and per-symbol AmarStock historical gaps — not for whole-market day backfill:

```bash
python -m app.jobs.sync_stock_details --symbols EBL --historical-window-days 90
python -m app.jobs.sync_stock_details --scope stocks --symbols EBL   # profile fill-empty only
```

Details: [`backend/docs/stock_details.md`](backend/docs/stock_details.md).

## Architecture

```text
Router -> Service -> Repository -> PostgreSQL
UI -> Domain hook -> API client -> Backend
Ingestion -> Prices -> Indicators -> Signals
```

## Authentication

JWT auth with email verification, refresh tokens, Google sign-in. Configure `JWT_SECRET_KEY`, SMTP, `FRONTEND_BASE_URL`, and `GOOGLE_CLIENT_ID` in `backend/.env`. Details: [`backend/docs/authentication.md`](backend/docs/authentication.md).

## Documentation

| Topic | Path |
|-------|------|
| **Production deployment** | [`deploy/README.md`](deploy/README.md) |
| Deployment architecture | [`backend/docs/deployment_architecture.md`](backend/docs/deployment_architecture.md) |
| Market data (sources, schedulers, API) | [`backend/docs/market_data.md`](backend/docs/market_data.md) |
| Market Pulse briefing | [`backend/docs/market_pulse.md`](backend/docs/market_pulse.md) |
| Stock details sync | [`backend/docs/stock_details.md`](backend/docs/stock_details.md) |
| API reference | [`backend/docs/api_collection.md`](backend/docs/api_collection.md) |
| Backend setup | [`backend/README.md`](backend/README.md) |
