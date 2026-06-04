# Smart Stock

AI-assisted stock analysis foundation for the Bangladesh stock market.

This repository is organized as a monorepo:

- `backend`: FastAPI, async SQLAlchemy, PostgreSQL
- `frontend`: Next.js App Router, TypeScript

The current scaffold focuses on clean architecture, maintainable module boundaries, and a practical data model for market data, indicators, and trading signals. It intentionally avoids feature-heavy business logic so the system can grow incrementally.

## Architecture Direction

Backend flow:

```text
Router -> Service -> Repository -> DB session dependency -> PostgreSQL
```

Frontend flow:

```text
UI -> Domain hook -> API client -> Backend
```

Data pipeline direction:

```text
Ingestion -> Prices -> Features -> Indicators -> Signals
```

## Bootstrap stock master (optional)

On a fresh database, populate **`stocks`** from AmarStock before daily price ingestion can attach every symbol:

```bash
cd backend
python -m app.scripts.seed_stocks
```

Use the backend virtualenv and `backend/.env`. Details: `backend/docs/stocks.md`.

## Daily market prices (manual run)

To fetch and upsert day-end OHLCV for the scheduled-equivalent workflow (AmarStock with optional StockNow validation), from **`backend/`**:

```bash
cd backend
python -m app.jobs.sync_market_data
```

By default the trade date is **today’s calendar date in Asia/Dhaka** (aligned with the in-app scheduler). Use `--date YYYY-MM-DD` for a specific session, or `--no-validation` for AmarStock-only ingestion. The same CLI run also triggers **additive post-steps** when enabled in `Settings`: AmarStock **News** → `market_events`, and a **LatestPrice** bulk fetch to patch `trade_count` / `turnover` on existing `daily_prices` rows for that date (never replaces OHLCV). There is **no separate CLI** for those steps. Same virtualenv and `.env` as the API. Details: `backend/docs/market_data.md`.

## Stock details (manual run)

To backfill **missing** recent historical prices after daily market sync (`sync_market_data`), or refresh fundamentals and snapshots from AmarStock APIs:

```bash
cd backend
python -m app.jobs.sync_stock_details --symbols EBL --historical-window-days 180
```

The CLI uses `trigger_type=MANUAL`, so the **3‑month cadence check is not applied** — you can re-run soon after a prior sync to fill gaps. For each date in the historical window, **`daily_prices` rows are inserted only when no row exists yet** for that stock and trade date; existing OHLCV from daily market sync is left unchanged. The job still updates other tables (metrics, valuation, shareholding, events, stock profile) per the usual `full` scope rules.

To **only** backfill empty `stocks` columns (sector, category, caps, listing date, placeholder name) from the snapshot + LatestPrice profile merge, without writing `daily_prices` or other tables:

```bash
cd backend
python -m app.jobs.sync_stock_details --symbols EBL --scope stocks
```

All runs still require `stocks.is_active = true` and `stocks.should_fetch_details = true`. Use `--force` on scheduled or API-triggered runs when you need to bypass cadence without `trigger_type=MANUAL`. Without `--symbols`, use `--limit` and `--offset` to page through eligible stocks. Details: `backend/docs/stock_details.md`.

## Authentication

The backend includes a JWT authentication MVP with email verification, refresh tokens, password change, Google sign-in, and optional Facebook sign-in. Middleware parses optional Bearer tokens into `request.state.user`; protected routes use `get_current_user`.

Set `JWT_SECRET_KEY`, SMTP settings, `FRONTEND_BASE_URL`, and `GOOGLE_CLIENT_ID` in `backend/.env`. Frontend Google sign-in uses `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Details: `backend/docs/authentication.md`.

## Development Areas

- Market data management
- Technical indicator computation
- Rule-based signal generation
- Future AI/RAG analysis
- Future backtesting and portfolio tracking

