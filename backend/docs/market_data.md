# Market Data Module

## Purpose

The market data module owns per-stock daily OHLCV prices and exchange-level daily market summaries. It is the bridge between stock master data and later indicator, signal, scanner, and dashboard features.

## Workflows (snapshot vs daily)

Market ingestion is split into two coordinated jobs:

| Workflow | Entry point | Cadence | Writes |
|----------|-------------|---------|--------|
| **Intraday snapshot** | `sync_market_snapshot()` | Every `market_snapshot_interval_minutes` (default 15) between `market_open_time` and `market_close_time` on Sun–Thu | `daily_prices` (upsert), `daily_market_summaries` (DSEX via index API) |
| **Daily orchestration** | `run_daily_market_sync()` | Once per trading day at `daily_market_sync_time` (default 15:15 Asia/Dhaka) | `market_events` (news only by default) |

The same `daily_prices` row for `stock_id + trade_date` is upserted on each snapshot; `updated_at` moves every run and drives `GET /market/freshness`.

```text
Intraday scheduler → sync_market_snapshot()
  → LatestPrice JSON (primary) → daily_prices
  → Index API (/info/DSE + /data/index/summery) → daily_market_summaries

Daily scheduler → run_daily_market_sync()
  → News API (/info/News) → market_events
```

Manual operators can chain both via CLI (see below).

## Sources

Primary per-stock snapshot source (default):

* **AmarStock bulk LatestPrice JSON** (`/LatestPrice/{token}`) via `AmarStockLatestPriceMarketDataSource` — full OHLCV, volume, trade count, turnover; `source = AMARSTOCK_LATEST_PRICE_API`.

Alternate / legacy sources (configurable, not default):

* **AmarStock latest-share-price HTML** via `AmarStockMarketDataSource` (`daily_market_primary_source = amarstock_html`).
* **StockNow** — optional validation (`daily_market_stocknow_validation_enabled`) or fallback (`daily_market_stocknow_fallback_enabled`); both off by default.
* **DSE day-end archive** via `DseMarketDataSource` — first-party historical rows; used by dedicated ingestion endpoints, not the snapshot scheduler.

Exchange-level DSEX / breadth / official turnover (not in LatestPrice JSON):

* **AmarStock index API** (`AmarStockIndexApiSource`) on every snapshot when `amarstock_index_summary_enabled = true`.

News (daily job only):

* **AmarStock News JSON** (`/info/News`) when `amarstock_news_ingestion_enabled = true`.

Stock-details historical backfill (separate job — see `stock_details.md`):

* AmarStock historical price API (`/data/5ee4d332a90e`).

Source classes live under `backend/app/jobs/ingestion/`. `market_data_source_factory.build_primary_market_data_source()` selects the configured primary source.

### LatestPrice JSON mapping

| JSON field | `daily_prices` |
|------------|----------------|
| `Scrip` | symbol lookup → `stock_id` |
| `Close` / `LTP` | `close_price` |
| `Open`, `High`, `Low` | OHLC (conservative fallbacks when missing) |
| `YCP` | `previous_close_price` |
| `Volume`, `Trade`, `Value` | volume, trade_count, turnover |
| — | skip row when `close <= 0` |

Turnover parsing for `Value` matches HTML: unsuffixed numbers are **millions** BDT; `K` / `M` suffixes scale accordingly (`amarstock_turnover.py`).

### HTML source (when configured)

`AmarStockMarketDataSource` parses the latest-price table with BeautifulSoup/`lxml`. `LTP` → `close_price`; missing `OPEN` uses `YCP` and marks `PARTIAL`.

### StockNow validation (optional)

When enabled, validation compares only `close_price`. Differences above `0.50%` mark an otherwise `OK` row `SUSPICIOUS` and upsert a `SOURCE_VALIDATION` summary row. StockNow never overrides AmarStock values.

## Business Rules

* Daily prices are unique by `stock_id + trade_date`.
* Ingestion upserts by natural key so repeated snapshot runs are idempotent.
* `high_price >= low_price`; close must sit inside low/high when provided.
* Missing previous close → `PARTIAL` change fields.
* Unknown symbols are skipped.
* Run `python -m app.scripts.seed_stocks` before ingestion on a fresh DB (`backend/docs/stocks.md`).
* Empty parses are logged and skipped.
* **Do not** derive official exchange breadth from aggregating LatestPrice `ChangePer`; use the index API. Frontend stock-level aggregation remains a UI fallback only.

## Derived Fields

Computed before persistence:

* `price_change`, `price_change_percent`, `day_range`, `day_range_percent`
* `turnover` from source, or `close_price * volume` when absent
* `vwap = turnover / volume`

## Schedulers (in-process)

Started from `app.main` lifespan when enabled:

| Setting | Default | Scheduler |
|---------|---------|-----------|
| `market_snapshot_scheduler_enabled` | `true` | `MarketSnapshotScheduler` → `sync_market_snapshot()` |
| `daily_market_sync_scheduler_enabled` | `true` | `DailyMarketSyncScheduler` → `run_daily_market_sync()` |
| `market_open_time` / `market_close_time` | `10:00` / `15:00` | Snapshot window (Asia/Dhaka) |
| `market_snapshot_interval_minutes` | `15` | Snapshot cadence |
| `daily_market_sync_time` | `15:15` | Daily news job |

Session logic (`market_session_schedule.py`) is shared by schedulers, `GET /market/freshness`, and unit tests.

## API Behavior

`GET /api/v1/stocks/{stock_id}/prices` — paginated history with date/source/quality filters.

`POST /api/v1/stocks/{stock_id}/prices` — single-row upsert with derived fields.

`GET /api/v1/market/freshness` — snapshot metadata for the UI (`last_synced_at`, `next_sync_at` when OPEN/PRE_OPEN, `market_status`, `expected_delay_minutes`, etc.). No `is_live` field.

`POST /api/v1/market-data/ingestion/daily-prices` — manual price ingest for a trade date (operator/API path).

## Enrichment split

`amarstock_daily_enrichment.py`:

* `run_snapshot_market_enrichment()` — DSEX index summary only (snapshot path).
* `run_daily_news_enrichment()` — news only (daily path).
* `amarstock_daily_latest_price_patch_enabled` defaults to **`false`** (redundant when JSON is primary).
* Legacy `run_post_daily_amarstock_enrichment` chains news + optional patch for backward compatibility.

## CLI

**Intraday snapshot (prices + DSEX):**

```bash
python -m app.jobs.sync_market_snapshot
python -m app.jobs.sync_market_snapshot --date 2026-06-11
python -m app.jobs.sync_market_snapshot --no-validation
```

**Daily orchestration (news; optional snapshot first):**

```bash
python -m app.jobs.sync_market_data              # news only (default)
python -m app.jobs.sync_market_data --snapshot   # snapshot then news
python -m app.jobs.sync_market_data --date 2026-06-11
```

Default trade date: calendar **today in Asia/Dhaka**.

**Exit codes:** `0` success; `2` invalid `--date`; `130` Ctrl+C; `1` uncaught exception.

## Settings reference

See `backend/app/core/core_config.py`:

* `daily_market_primary_source` — `amarstock_latest_price_json` (default) or `amarstock_html`
* `daily_market_stocknow_validation_enabled` / `daily_market_stocknow_fallback_enabled`
* `amarstock_news_ingestion_enabled`, `amarstock_index_summary_enabled`
* `amarstock_latest_price_token`, `amarstock_news_path`, bulk API retry settings

## Future Notes

Broader cross-source validation, bulk upsert optimization, and anomaly detection should stay inside ingestion source classes. Stock-details bulk LatestPrice usage for profiles remains a separate module/cadence — see `backend/docs/stock_details.md`.
