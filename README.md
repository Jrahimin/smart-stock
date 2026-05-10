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

By default the trade date is **today’s calendar date in Asia/Dhaka** (aligned with the in-app scheduler). Use `--date YYYY-MM-DD` for a specific session, or `--no-validation` for AmarStock-only ingestion. Same virtualenv and `.env` as the API. Details: `backend/docs/market_data.md`.

## Stock details (manual run)

To sync AmarStock API stock details, including recent historical prices, financial metrics, valuation, shareholding, news, and base `stocks` fields such as name/category/capitalization:

```bash
cd backend
python -m app.jobs.sync_stock_details --symbols EBL --historical-window-days 180 --force
```

`--force` skips cadence for explicit symbols only; it still requires `stocks.is_active = true` and `stocks.should_fetch_details = true`. Without `--symbols`, use `--limit` and `--offset` to process due eligible stocks in batches. Details: `backend/docs/stock_details.md`.

## Development Areas

- Market data management
- Technical indicator computation
- Rule-based signal generation
- Future AI/RAG analysis
- Future backtesting and portfolio tracking

