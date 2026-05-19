# Market Data Module

## Purpose

The market data module owns per-stock daily OHLCV prices and exchange-level daily market summaries. It is the bridge between stock master data and later indicator, signal, scanner, and dashboard features.

## Sources

Primary source candidates for Bangladesh daily prices are:

* DSE day-end archive for first-party DSE historical OHLCV rows.
* AmarStock latest-share-price HTML for daily scheduled sync.
* StockNow as a lightweight validation source during the daily AmarStock sync.
* AmarStock historical price API for stock-details backfill windows.
* AmarStock **News** JSON (`/info/News`) and **bulk LatestPrice** JSON (`/LatestPrice/{token}`) as additive enrichment (see **AmarStock post-ingestion** below).

The ingestion implementation uses replaceable source classes under `backend/app/jobs/ingestion/`. `DseMarketDataSource` reads the DSE day-end archive, while `AmarStockMarketDataSource` fetches live AmarStock HTML, parses the latest-price table with BeautifulSoup and `lxml`, and normalizes rows into `IngestedDailyPrice` values. `StockNowMarketDataSource` parses StockNow's rendered AG Grid snapshot for validation-only close-price checks. The service maps symbols to stock ids and persists valid AmarStock rows.

AmarStock parsing matches the latest-price table by minimal headers (`TRADING CODE`, `LTP`) and builds a header map so optional columns can shift without corrupting data. `LTP` maps to `close_price`; `OPEN` is used if present, otherwise `YCP` is used as the conservative open-price proxy and the row is marked `PARTIAL`. AmarStock `VALUE` is treated as turnover; values with `K`/`M` suffixes use the suffix, while unsuffixed values are currently assumed to be in millions.

The scheduled daily sync keeps AmarStock as the source of truth and fetches StockNow in parallel. Validation compares only `close_price`; if the percentage difference is greater than `0.50%`, an otherwise `OK` AmarStock row is marked `SUSPICIOUS`, a warning is logged, and a `SOURCE_VALIDATION` row in `daily_market_summaries` is upserted with `has_suspicious_prices = true`. StockNow never overrides AmarStock values and validation failures do not block ingestion.

The stock details sync also writes `daily_prices` using AmarStock's historical price API (`/data/5ee4d332a90e`). That path is API-only, uses `DateEpoch` as the trade-date source of truth, fetches a configurable window (`stock_details_historical_window_days`, default `90`, overridable per manual run), and upserts by `stock_id + trade_date`. It is intended as a recent backfill companion to the daily market sync, not a replacement for the scheduled day-end workflow.

## Business Rules

* Daily prices are unique by `stock_id + trade_date`.
* Ingestion upserts by `stock_id + trade_date` so repeated runs are idempotent.
* When stock details sync writes historical rows, existing daily rows for the same stock/date are updated through the same natural key.
* Source priority is explicit: `AMARSTOCK_API` historical rows are primary; homepage latest-price ingestion is fallback and will not overwrite an existing `AMARSTOCK_API` row for the same stock/date.
* `high_price` must be greater than or equal to `low_price`.
* Close values must sit inside the daily low/high range when provided.
* Missing previous close marks a row as `PARTIAL` because change fields cannot be computed with confidence.
* Unknown symbols from a source are skipped during ingestion so incomplete stock master data does not break the whole run.
* To populate **`stocks`** so AmarStock symbols resolve during ingestion, run **`python -m app.scripts.seed_stocks`** from **`backend/`** before or alongside ops setup (documented in `backend/docs/stocks.md`).
* Empty parses are logged and skipped without writing to the database.
* Validation mismatches are confidence signals only; they do not correct or merge source data.

## Derived Fields

The service computes derived fields before persistence:

* `price_change = close_price - previous_close_price`
* `price_change_percent = price_change / previous_close_price * 100`
* `day_range = high_price - low_price`
* `day_range_percent = day_range / low_price * 100`
* `turnover = source turnover`, or `close_price * volume` when source turnover is absent
* `vwap = turnover / volume`

## API Behavior

`GET /api/v1/stocks/{stock_id}/prices` supports pagination and optional filters for date range, source, and data quality flag.

`POST /api/v1/stocks/{stock_id}/prices` accepts one daily row, computes derived fields, and returns an existing row if the natural key already exists.

`POST /api/v1/market-data/ingestion/daily-prices` runs the daily ingestion workflow for a trade date and returns counts for fetched, upserted, duplicate, unknown-symbol rows, and **`suspicious_count`** (close-price disagreements versus the validation source when validation runs). The scheduled `run_daily_market_sync()` job uses AmarStock with StockNow validation and runs daily at 2:30 PM Asia/Dhaka.

The same response includes additive **`post_*`** fields: news upserts/skips, LatestPrice trade-stat patch counts, and optional error strings when a post-step fails after primary prices have already committed.

## AmarStock post-ingestion (News + LatestPrice patch)

After primary OHLCV rows are committed, `MarketDataService.ingest_daily_prices` runs `run_post_daily_amarstock_enrichment` (`backend/app/jobs/ingestion/amarstock_daily_enrichment.py`) in the same session with a **second commit**. Sub-steps **soft-fail** internally (logged); failure during that second commit rolls back only enrichment writes.

**News** (`AmarStockNewsApiSource`, `source = AMARSTOCK_NEWS_API` on `market_events`):

* `event_date` is the **trade_date** passed into daily ingestion (same calendar context as the price run).
* Unknown symbols are skipped (`post_news_skipped`). `EXCH`-style rows use `stock_id = null`, `exchange = DSE`.
* Idempotency uses `stock_id + event_date + title + source` (many items have no native announcement date).

**LatestPrice trade stats** (optional, `AmarStockLatestPriceApiSource`):

* One bulk JSON fetch; `MarketDataRepository.patch_daily_price_trade_stats` updates **only** `trade_count`, `turnover`, and optionally `data_quality_flag` (never OHLCV or `source`).
* If no `daily_prices` row exists for `stock_id + trade_date`, the row is skipped (`post_latest_price_trade_rows_missing`).
* When LatestPrice `Close`/`LTP` disagrees with persisted `close_price` by more than **0.5%**, the row is marked `SUSPICIOUS` without changing the stored close.

**Settings** (see `backend/app/core/core_config.py`): `amarstock_news_ingestion_enabled`, `amarstock_daily_latest_price_patch_enabled`, `amarstock_news_path`, `amarstock_latest_price_token`, `amarstock_bulk_api_max_retries`, `amarstock_bulk_api_retry_delay_seconds`.

**Turnover parsing** for LatestPrice `Value` matches HTML `VALUE`: unsuffixed numbers are treated as **millions** BDT; `K` / `M` suffixes scale accordingly (`backend/app/jobs/ingestion/amarstock_turnover.py`).

## CLI: `sync_market_data`

`python -m app.jobs.sync_market_data` (run from `backend/` with the same virtualenv and `.env` as the API) performs the scheduled-equivalent ingestion without starting uvicorn:

* **Default trade date**: calendar date in **Asia/Dhaka** (`datetime.now(Asia/Dhaka).date()`), not the OS local timezone — aligned with scheduler semantics.
* **`--date YYYY-MM-DD`**: ingest that trading day explicitly.
* **`--no-validation`**: AmarStock-only; skips StockNow fetches and the `SOURCE_VALIDATION` summary path. Passing this overrides any future explicit `validation_source` hook in `run_daily_market_sync`; for custom validation sources, call `run_daily_market_sync(..., skip_validation=False, validation_source=...)` from code.

**Exit codes** (cron / CI friendly): `0` success; `2` invalid `--date`; `130` Ctrl+C; `1` uncaught exception (DB, network, etc.). An empty primary parse (`fetched_count == 0`) still exits `0` but is logged at **ERROR** so monitors and log sinks can alert without treating it as a crash.

**Logging**: the final line includes `suspicious_count` when validation ran; with `--no-validation`, validation is skipped so `suspicious_count` is `0` by definition. It also logs post-ingestion counters (`post_news_*`, `post_lp_*`) when AmarStock post-steps run.

## Future Notes

Advanced ingestion work should add fallback source selection, broader cross-source validation, bulk upsert optimization, and anomaly detection without changing the basic service contract. Scraper source changes should stay inside ingestion source classes rather than leaking parsing logic into routers or repositories.

Stock-details sync uses the same bulk LatestPrice feed for fill-empty profile fields and extra snapshots; see `backend/docs/stock_details.md` (**Bulk LatestPrice enrichment**).
