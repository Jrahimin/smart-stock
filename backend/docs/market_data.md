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
| Intraday snapshot | Scheduler enqueues `MARKET_SNAPSHOT`; queue runner calls `sync_market_snapshot()` | Every `market_snapshot_interval_minutes` (default 15) between `market_open_time`–`market_close_time`, Sun–Thu | `daily_prices` (upsert), DSEX summary |
| Daily news/finality | Scheduler enqueues `MARKET_SYNC`; queue runner calls `run_daily_market_sync()` | Once per session day at `daily_market_sync_time` (default 15:15) | `market_events`; finalize DSEX session when price + index inputs exist |
| Historical backfill | `backfill_daily_prices()` | Manual / admin API | `daily_prices` from DSE archive + decision-input generation revision |

```text
Scheduler (snapshot) → full-market MessagePack → daily_prices
                    → Index API → daily_market_summaries (DSEX)

Scheduler (daily)    → News API → market_events
                     → mark DSEX session finalized → canonical rebuild eligible

backfill_daily_prices → DSE day-end archive → daily_prices (insert-only by default)
```

Each snapshot upserts the same `stock_id + trade_date` row; `updated_at` drives `GET /market/freshness`.

## Sources

| Data | Source | When |
|------|--------|------|
| Per-stock OHLCV (live) | AmarStock configurable MessagePack path (`AMARSTOCK_MARKET_MSGPACK`) | Snapshot scheduler / `sync_market_data` |
| Per-stock OHLCV (historical) | DSE `day_end_archive.php` (`DSE`) | `backfill_daily_prices` / `POST .../ingestion/daily-prices` |
| DSEX, breadth, exchange turnover | AmarStock index API (`/info/DSE` + `/data/index/summery`) | Every snapshot |
| News | AmarStock `/info/News` | Daily job only |

**Not in the MessagePack snapshot:** authoritative trade date and DSEX session authority. The index API remains the hard session gate and supplies DSEX/breadth.

**Optional / alternate** (via `core_config.py`):

* The old `amarstock_latest_price_json` source remains available for compatibility but is not primary.
* `amarstock_html` is explicit/manual only. It is never an automatic fallback because plain HTTP currently returns only a small partial table.
* StockNow validation or fallback (`daily_market_stocknow_*`) is off by default; fallback must pass the same database-aware coverage guard.

Factory: `market_data_source_factory.build_primary_market_data_source()`.

### MessagePack → `daily_prices`

| Field | Column |
|-------|--------|
| `aa` | symbol → `stock_id` |
| `ea` / `ee` | LTP / source close; positive LTP is effective `close_price`, otherwise `ee` |
| `eb`, `ec`, `ed` | open, high, low |
| `aj` | previous close |
| `ad`, `eh`, `ei` | volume, trade count, turnover in millions BDT |

`ei` is converted with `turnover_bdt = ei × 1,000,000`. Zero-price rows are retained as non-tradable placeholders. Required arrays must exist, be arrays, and have equal lengths; symbols must be nonempty and unique after normalization; numeric values must be finite. A genuinely invalid row refuses the whole snapshot rather than publishing a partial generation.

### No-trade / zero-price policy

Source rows with zero in any OHLC field are retained when already persisted for audit and source reconciliation, but are treated as **non-tradable placeholders**. They are omitted from the detail chart, latest-price display, and all OHLC-derived calculations (returns, moving averages, RSI, ATR, volatility, levels, and patterns). The detail chart spaces supplied tradable sessions by observation order, so missing no-trade dates do not create calendar gaps. A valid positive OHLC row with zero volume remains a real session observation; it stays in the price series but is handled separately by liquidity and eligibility rules.

`daily_prices.turnover_provenance` records `REPORTED`, `ESTIMATED`, `MIXED`, or
`UNKNOWN`. Snapshot/archive values supplied by the source are reported; the
per-stock historical fallback `close × volume` is estimated. Migration backfill
uses only known source contracts and leaves other rows unknown.

## Schedulers

**Production (Docker):** Market snapshot and daily sync schedules enqueue durable
`system_job_executions` rows in the dedicated `backend-scheduler` container
(`python -m app.jobs.scheduler`, `RUN_SCHEDULER=true`). Its single queue runner claims and
executes them. The API container (`backend-api`) sets `RUN_SCHEDULER=false` and only enqueues
manual requests.

**Local development:** With `RUN_SCHEDULER=true`, schedulers can start inside the FastAPI process (`uvicorn`) via `app.main` lifespan.

| Setting | Default |
|---------|---------|
| `run_scheduler` | `false` — process gate; `true` only in scheduler container or local single-process dev |
| `market_snapshot_scheduler_enabled` | `true` |
| `daily_market_sync_scheduler_enabled` | `true` |
| `system_job_queue_poll_seconds` | `10` |
| `stock_details_sync_scheduler_enabled` | `false` |
| `stock_details_sync_time` | `15:35` (Asia/Dhaka) |
| `stock_details_sync_batch_size` | `50` due eligible full-scope DSE stocks |
| `market_open_time` / `market_close_time` | `10:00` / `15:00` (Asia/Dhaka) |
| `market_snapshot_interval_minutes` | `15` |
| `daily_market_sync_time` | `15:15` |

See [`deployment_architecture.md`](deployment_architecture.md) for the full production layout.
Queue lifecycle and heartbeat behavior: [`admin_job_queue.md`](admin_job_queue.md).

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

The POST ingestion endpoint, `POST /stocks/{id}/prices`,
`POST /market/summaries`, and `POST /stock-details/sync` require `ADMIN` or
`SUPER_ADMIN`. Authentication and role enforcement use the shared middleware and
dependency layer.

`GET /market/freshness` exposes `market_sync_id` as the immutable data
publication identity and `data_state` as presentation state. During the active
session the canonical universe uses the published LIVE generation. Finalization
promotes the same generation id; LIVE, STALE, FINALIZATION_PENDING and FINALIZED
state changes do not by themselves change decision identity.

## Rules

* Natural key: `stock_id + trade_date`
* Snapshot ingest: upsert; backfill default: insert-only (skip existing rows)
* Snapshot DSEX upserts always set `is_finalized=false`. The after-close daily path
  sets it true only when both a DSEX summary and at least one exchange price row exist.
* **Session gate:** before snapshot or daily sync writes, `validate_market_session()` calls the AmarStock index API and requires `DateEpoch` trade date to equal today (Asia/Dhaka). Mismatch (public holiday, stale feed, API lag) skips all writes for that run. `MarketStatus` is logged only. Override: `skip_session_validation=True` on sync functions or `--skip-session-validation` on the CLI.
* Unknown symbols skipped — run `seed_stocks` on a fresh DB
* Before writes, the source must meet both `market_snapshot_min_active_coverage_percent` against active DSE stocks and `market_snapshot_min_source_symbols` matched active symbols. Zero-price placeholders count; unknown symbols improve neither guard.
* Prices, DSEX, and the `LIVE` generation commit once. Any source, validation, coverage, DSEX, or publication failure rolls back and leaves the prior generation/caches in place.
* A successful generation triggers one locked canonical-universe rebuild. Cache
  publication is fenced to that exact id; an obsolete calculation is discarded.
* Historical OHLCV, relevant stock-detail event inputs and manual market-summary
  corrections publish a new compact generation revision after the correction
  succeeds, so old Redis and browser analysis identities cannot remain current.
* Official breadth comes from the index API only; do not aggregate MessagePack change fields as exchange breadth.
* Snapshot ingestion derives `price_change`, `price_change_percent`, `day_range`,
  and `vwap` on write. Per-stock historical fallback rows may retain null stored
  changes; analytical returns and volatility are derived from validated closes.

## Enrichment

`amarstock_daily_enrichment.py`:

* Snapshot path → DSEX summary only (`run_snapshot_market_enrichment`)
* Daily path → news only (`run_daily_news_enrichment`)
* `amarstock_daily_latest_price_patch_enabled` defaults to `false`

## Configuration

Key settings in `backend/app/core/core_config.py`:

| Setting | Default | Notes |
|---------|---------|-------|
| `daily_market_primary_source` | `amarstock_msgpack` | compatibility: `amarstock_latest_price_json`; explicit only: `amarstock_html` |
| `amarstock_market_snapshot_path` | `/823af3f1ebdd` | Opaque upstream path; configurable because it may rotate |
| `market_snapshot_min_active_coverage_percent` | `95` | Active DSE match threshold before writes |
| `market_snapshot_min_source_symbols` | `300` | Absolute matched-active-symbol floor before writes |
| `dse_archive_ssl_verify` | `false` | DSE TLS chain often incomplete |
| `amarstock_index_summary_enabled` | `true` | DSEX on each snapshot |
| `amarstock_news_ingestion_enabled` | `true` | Daily job only |
| `daily_market_stocknow_validation_enabled` | `false` | Optional close check |

## Related

* Stock master: `backend/docs/stocks.md`
* Fundamentals / per-symbol history: `backend/docs/stock_details.md`
* API shapes: `backend/docs/api_collection.md`
