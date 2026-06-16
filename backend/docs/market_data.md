# Market Data Module

## Purpose

Stores per-stock daily OHLCV (`daily_prices`) and exchange summaries (`daily_market_summaries`). Feeds indicators, signals, scanner, and dashboard features.

## Operator quick reference

Run from **`backend/`** with venv and `.env` loaded.

| Goal | Command |
|------|---------|
| Live snapshot (prices + DSEX) | `python -m app.jobs.sync_market_data` |
| Snapshot + news | `python -m app.jobs.sync_market_data --with-news` |
| News only | `python -m app.jobs.sync_market_data --news-only` |
| Backfill one past session day | `python -m app.jobs.backfill_daily_prices --date YYYY-MM-DD` |
| Backfill a date range | `python -m app.jobs.backfill_daily_prices --from YYYY-MM-DD --to YYYY-MM-DD` |
| Backfill upsert (not insert-only) | add `--overwrite` |

| Do | Use |
|----|-----|
| Today's live prices during session | `sync_market_data` |
| Missed historical day (whole market) | `backfill_daily_prices` |
| Per-stock fundamentals + small price gaps | `sync_stock_details` (see `stock_details.md`) |

**Do not** use `sync_market_data --date` for historical backfill — it stores **current** AmarStock prices under that date label.

`python -m app.jobs.sync_market_snapshot` is a deprecated alias for `sync_market_data`.

Exit codes: `0` success · `2` bad date · `130` interrupt · `1` error.

## Workflows

| Workflow | Code entry | Cadence | Writes |
|----------|------------|---------|--------|
| Intraday snapshot | `sync_market_snapshot()` | Every `market_snapshot_interval_minutes` (default 15) between `market_open_time`–`market_close_time`, Sun–Thu | `daily_prices` (upsert), DSEX summary |
| Daily news | `run_daily_market_sync()` | Once per session day at `daily_market_sync_time` (default 15:15) | `market_events` |
| Historical backfill | `backfill_daily_prices()` | Manual / API | `daily_prices` from DSE archive |

```text
Scheduler (snapshot) → LatestPrice JSON → daily_prices
                    → Index API → daily_market_summaries (DSEX)

Scheduler (daily)    → News API → market_events

backfill_daily_prices → DSE day-end archive → daily_prices (insert-only by default)
```

Each snapshot upserts the same `stock_id + trade_date` row; `updated_at` drives `GET /market/freshness`.

## Sources

| Data | Source | When |
|------|--------|------|
| Per-stock OHLCV (live) | AmarStock `/LatestPrice/{token}` (`AMARSTOCK_LATEST_PRICE_API`) | Snapshot scheduler / `sync_market_data` |
| Per-stock OHLCV (historical) | DSE `day_end_archive.php` (`DSE`) | `backfill_daily_prices` / `POST .../ingestion/daily-prices` |
| DSEX, breadth, exchange turnover | AmarStock index API (`/info/DSE` + `/data/index/summery`) | Every snapshot |
| News | AmarStock `/info/News` | Daily job only |

**Not in LatestPrice JSON:** DSEX level, advancing/declining counts, exchange-wide turnover — always use the index API for those.

**Optional / alternate** (via `core_config.py`):

* `daily_market_primary_source = amarstock_html` — HTML scraper instead of JSON
* StockNow validation or fallback (`daily_market_stocknow_*`) — off by default

Factory: `market_data_source_factory.build_primary_market_data_source()`.

### LatestPrice JSON → `daily_prices`

| Field | Column |
|-------|--------|
| `Scrip` | symbol → `stock_id` |
| `Close` / `LTP` | `close_price` |
| `Open`, `High`, `Low` | OHLC (fallbacks when missing) |
| `YCP` | `previous_close_price` |
| `Volume`, `Trade`, `Value` | volume, trade_count, turnover |

Skip rows where `close <= 0`. `Value` turnover: unsuffixed = millions BDT; `K`/`M` suffixes supported.

## Schedulers

**Production (Docker):** Market snapshot and daily sync jobs run in the dedicated `backend-scheduler` container (`python -m app.jobs.scheduler`, `RUN_SCHEDULER=true`). The API container (`backend-api`) sets `RUN_SCHEDULER=false` and does not start schedulers.

**Local development:** With `RUN_SCHEDULER=true`, schedulers can start inside the FastAPI process (`uvicorn`) via `app.main` lifespan.

| Setting | Default |
|---------|---------|
| `run_scheduler` | `false` — process gate; `true` only in scheduler container or local single-process dev |
| `market_snapshot_scheduler_enabled` | `true` |
| `daily_market_sync_scheduler_enabled` | `true` |
| `market_open_time` / `market_close_time` | `10:00` / `15:00` (Asia/Dhaka) |
| `market_snapshot_interval_minutes` | `15` |
| `daily_market_sync_time` | `15:15` |

See [`deployment_architecture.md`](deployment_architecture.md) for the full production layout.

Session helpers live in `market_session_schedule.py` (shared with `GET /market/freshness`).

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/freshness` | Last/next sync, session status, delay disclaimer |
| `GET /api/v1/market/latest-prices` | Latest row per active stock |
| `GET /api/v1/market/price-windows` | Recent OHLCV windows for dashboard/scanner |
| `GET /api/v1/market/index/dsex` | Live DSEX snapshot |
| `GET /api/v1/market/summaries` | Stored daily summaries |
| `GET /api/v1/stocks/{id}/prices` | Paginated history |
| `POST /api/v1/market-data/ingestion/daily-prices?trade_date=` | DSE archive ingest (same as backfill CLI) |

`GET /market/freshness` intentionally omits `is_live` — prices are always snapshot-based.

## Rules

* Natural key: `stock_id + trade_date`
* Snapshot ingest: upsert; backfill default: insert-only (skip existing rows)
* Unknown symbols skipped — run `seed_stocks` on a fresh DB
* Official breadth from index API only; do not aggregate LatestPrice `ChangePer` as exchange breadth
* Derived on write: `price_change`, `price_change_percent`, `day_range`, `vwap`, etc.

## Enrichment

`amarstock_daily_enrichment.py`:

* Snapshot path → DSEX summary only (`run_snapshot_market_enrichment`)
* Daily path → news only (`run_daily_news_enrichment`)
* `amarstock_daily_latest_price_patch_enabled` defaults to `false`

## Configuration

Key settings in `backend/app/core/core_config.py`:

| Setting | Default | Notes |
|---------|---------|-------|
| `daily_market_primary_source` | `amarstock_latest_price_json` | or `amarstock_html` |
| `dse_archive_ssl_verify` | `false` | DSE TLS chain often incomplete |
| `amarstock_index_summary_enabled` | `true` | DSEX on each snapshot |
| `amarstock_news_ingestion_enabled` | `true` | Daily job only |
| `daily_market_stocknow_validation_enabled` | `false` | Optional close check |

## Related

* Stock master: `backend/docs/stocks.md`
* Fundamentals / per-symbol history: `backend/docs/stock_details.md`
* API shapes: `backend/docs/api_collection.md`
