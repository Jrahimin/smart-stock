# Stock Details Module

## Purpose

The stock details module ingests richer per-stock data from AmarStock APIs without relying on rendered HTML. It complements daily market ingestion by adding multi-year fundamentals, recent historical OHLCV backfill, valuation snapshots, ownership snapshots, and stock-level news/events.

## Sources

The implementation uses only JSON APIs documented in `backend/app/scraping_sources/amarstock_api_sample.md`:

* Snapshot API: `https://www.amarstock.com/data/1981d726120d/{SYMBOL}`
* Historical price API: `https://www.amarstock.com/data/5ee4d332a90e/?scrip={SYMBOL}&cycle=Day1&dtFrom=YYYY-MM-DD`
* Company financials API: `https://www.amarstock.com/company/2b5e8cfdd75f/?symbol={SYMBOL}`
* **Bulk LatestPrice JSON** (one fetch per batch): `https://www.amarstock.com/LatestPrice/{token}` — fill-empty stock profile fields and additive `shareholding_snapshots` / `valuation_snapshots` under `source = AMARSTOCK_LATEST_PRICE_API` (see **Bulk LatestPrice enrichment** below).

**Note:** The same LatestPrice feed also powers **intraday market snapshots** (`sync_market_snapshot` → `daily_prices` via `AmarStockLatestPriceMarketDataSource`). That path is separate from this module's `sync_stock_details` job and cadence. News ingestion runs on the **daily** market job only, not on the 15-minute snapshot loop.

There is no stock-details HTML scraping path. Do not reintroduce `/stock/{SYMBOL}` fetches, DOM parsing, `data-key` parsing, BeautifulSoup, or `lxml` for this feature.

## Sync Controls

Stocks are eligible only when both conditions are true:

* `stocks.is_active = true`
* `stocks.should_fetch_details = true`

Cadence and politeness are configured in `Settings`:

* `stock_details_sync_frequency_months`: default `3`
* `stock_details_historical_window_days`: default `90`
* `stock_details_sync_max_concurrency`: default `3`, bounded to `1..5`
* `stock_details_sync_request_delay_min_seconds`: default `1.0`
* `stock_details_sync_request_delay_max_seconds`: default `3.0`
* `stock_details_sync_max_retries`: default `3`
* `stock_details_sync_job_max_attempts`: default `2`
* `amarstock_latest_price_stock_details_enabled`: when `false`, skips the bulk LatestPrice fetch for this module (other settings in `core_config.py` control daily-only news/patch).

Each selected stock receives a `stock_details_sync_jobs` row. The job table stays execution-focused: status, timestamps, attempts, error, source URL, and compact diagnostics in metadata.

Jobs are created only after final eligibility is resolved. Cadence applies only to **scheduled** runs (`trigger_type=SCHEDULED`) and API calls that explicitly set a non-manual trigger without `force=true`. It still requires `is_active=true` and `should_fetch_details=true`.

**Cadence bypass** (stock may run even if synced recently):

* **`trigger_type=MANUAL`** — CLI (`python -m app.jobs.sync_stock_details`) and API bodies with `"trigger_type": "MANUAL"` (the API default).
* **`force=true`** — for scheduled/API runs that need the same behavior without switching trigger type.
* **`scope=stocks`** — always ignores cadence for selection (batch and explicit symbols).

## Sync scope (`full` vs `stocks`)

The sync request (CLI and `POST /api/v1/stock-details/sync`) accepts `scope`:

* **`full`** (default): after a successful AmarStock fetch, persists `daily_prices`, financial metrics/reports, valuation and shareholding snapshots, `market_events`, and `stocks` profile fields from the snapshot mapper (non-null snapshot values can replace existing DB values where the mapper sends them). When enabled, bulk LatestPrice still runs once per batch and applies profile fill-empty plus additive LatestPrice shareholding/valuation snapshots. **Cadence:** batch mode uses `list_due_stocks` with **`stock_details_sync_frequency_months`** against the latest SUCCEEDED/PARTIAL job per stock, unless cadence is bypassed (see **Sync Controls** above).
* **`stocks`**: same job rows, fetch traffic (snapshot + historical + company APIs), and bulk LatestPrice fetch when enabled — but **only** updates the `stocks` row: snapshot profile fields are applied **fill-empty only** (blank/null DB columns get non-blank API values; existing text/caps/dates are not overwritten). LatestPrice is limited to the existing **fill-empty stock profile** merge only (no LatestPrice shareholding or valuation rows). Counts for prices, metrics, valuation, shareholding, and events stay zero. A job still **succeeds** when nothing needed filling (all profile fields already populated), unlike `full` where zero persisted rows is a failure. **Selection ignores the cadence cutoff** (no “due only after N months” filter); `limit`/`offset` apply to all active `should_fetch_details` stocks in symbol order.

## Mapping Rules

Snapshot API:

* `FullName`, optional `Sector` / `SectorName`, `MarketCategory`, `PaidUpCap`, `MarketCap`, `ListingYear`, and `PresentOs` update existing columns on `stocks` when present. `ListingYear` is stored as a coarse `YYYY-01-01` `listing_date` because the API field does not include month/day.
* `ClosePrice`, `MarketCap`, `AuditedPE`, `NavPrice`, and `DividentYield` map to `valuation_snapshots`.
* `EPS`, `NAV`, quarterly EPS fields, capital fields, total securities, reserve/surplus, loan balances, free float, and beta map to controlled financial metric codes.
* Current ownership fields map to `shareholding_snapshots`, including government, free float, total securities, and derived circulating shares when available.
* Indexed ownership fields such as `SponsorDirector1` are normalized into arrays and stored in snapshot metadata.
* Indexed news fields such as `news1sttitle` and `news1stdate` map to `market_events`.

Historical API:

* `DateEpoch` is the source of truth for `daily_prices.trade_date`.
* Rows use natural key `stock_id + trade_date`. **Insert-only for prices:** if a row already exists for that stock and date, the historical row is **skipped** (no overwrite). This lets manual runs backfill gaps left by `sync_market_data` without clobbering day-end OHLCV already stored.
* The current default window is 90 calendar days (override with `historical_window_days`).
* When a row is inserted from the historical API, its `source` is `AMARSTOCK_API`. Daily market sync (`AMARSTOCK` homepage) will not overwrite an existing `AMARSTOCK_API` row for the same stock/date; conversely, stock-details backfill never replaces rows that daily sync already wrote.

Company API:

* Rows parse `k` as metric label, `l` as value, `y` as fiscal year, and `r` as statement section.
* Fiscal-year metrics use `YYYY-12-31` as `as_of_date` and financial report period end date.
* Metric definitions are controlled by a fixed mapping. Unknown labels are not turned into new metric codes; they are counted and sampled in job metadata for future mapping.
* Supported sections include balance sheet, income statement, and cash flow statement rows.
* Financial report cache keys include `stock_id + fiscal_year + statement_section` to avoid cross-stock collisions during batch runs.

## Bulk LatestPrice enrichment

After sync jobs are created and the batch transaction commits, the service performs **one** `LatestPrice` JSON fetch (see `AmarStockLatestPriceApiSource` in `backend/app/jobs/ingestion/`). For each stock that successfully parses the snapshot/historical/company pipeline:

* **Stock profile (fill-empty only)**: `BusinessSegment` → `sector`, `MarketCategory` → `category`, `PaidUpCap` / `MarketCap` when DB columns are null; `FullName` → `name` only when the current name still matches the **symbol placeholder** from seeding (same symbol as name), so curated display names are not overwritten.
* **Shareholding / valuation (additive)**: Upserts use `source = AMARSTOCK_LATEST_PRICE_API` with natural keys `stock_id + snapshot_date/valuation_date + source`, so rows from the snapshot API (`AMARSTOCK_API`) remain separate. Snapshot date prefers `CreatedOn` interpreted in **Asia/Dhaka**, falling back to the snapshot scrape date.

The sync API response includes `latest_price_profile_fill_count`, `latest_price_shareholding_count`, and `latest_price_valuation_count` for batch-level observability.

Daily market sync uses the same LatestPrice feed for optional `trade_count` / `turnover` patches only; see `backend/docs/market_data.md` (**AmarStock post-ingestion**).

## Idempotency

Persistence uses natural keys and upserts where the schema supports them:

* `daily_prices`: `stock_id + trade_date` — **insert if absent** during stock-details sync (existing dates skipped)
* `stocks`: selected profile fields on the existing stock row
* `financial_metric_definitions`: `metric_code`
* `financial_metric_values`: `financial_report_id + metric_definition_id + as_of_date`
* `valuation_snapshots`: `stock_id + valuation_date + source`
* `shareholding_snapshots`: `stock_id + snapshot_date + source`
* `market_events`: `stock_id + event_date + title + source`

`market_events` have a database-level unique constraint on `stock_id + event_date + title + source`, and the repository uses an upsert against that key.

## Observability

Each job metadata payload includes:

* Source URLs for snapshot, historical, and company APIs.
* Parsed and persisted counts for stock profile, `prices`, `metrics`, `valuation`, `shareholding`, and `events`.
* For prices: `skipped_existing_count` when historical rows were not inserted because the date already had a row.
* Per-section success flags.
* Unmapped company financial row count and a small sample.
* Shareholding indexed history count.

This keeps `stock_details_sync_jobs` lightweight while making partial ingestion debuggable.

## API and CLI

`POST /api/v1/stock-details/sync` runs the API-based sync for a batch or explicit symbol list.

Example body:

```json
{
  "exchange": "DSE",
  "symbols": ["EBL"],
  "limit": 20,
  "offset": 0,
  "historical_window_days": 180,
  "force": false,
  "trigger_type": "MANUAL",
  "scope": "full"
}
```

Omit `scope` or set `"full"` for the default. Use `"stocks"` for stocks-table-only fill-empty runs.

`GET /api/v1/stock-details/sync-jobs/{job_id}` returns job status and diagnostics.

CLI (manual — no cadence check; fills missing `daily_prices` only):

```bash
python -m app.jobs.sync_stock_details --symbols EBL --historical-window-days 180
```

Stocks-table-only (no `daily_prices` or other persistence; fill-empty profile columns from snapshot + LatestPrice profile merge when enabled):

```bash
python -m app.jobs.sync_stock_details --symbols EBL --scope stocks
```

Run from `backend/` with the project virtualenv and database settings loaded.

Manual trigger parameters:

* `symbols`: comma-separated explicit symbols.
* `limit` and `offset`: batch selection when `symbols` is omitted (manual/API runs select all eligible stocks; scheduled batch uses due-only unless cadence is bypassed).
* `historical_window_days`: optional per-run historical price window override.
* `force`: bypass cadence on scheduled/API runs; not required for the CLI (always `MANUAL`).
* `scope`: `full` (default) or `stocks` (see **Sync scope** above).

**Typical gap-fill workflow:** run `python -m app.jobs.backfill_daily_prices --date YYYY-MM-DD` for a missing session day (DSE archive, insert-only by default). For a date range, use `--from` / `--to`. Use `sync_stock_details` only when you also need fundamentals or per-symbol AmarStock historical gaps.
