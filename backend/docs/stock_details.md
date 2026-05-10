# Stock Details Module

## Purpose

The stock details module ingests richer per-stock data from AmarStock APIs without relying on rendered HTML. It complements daily market ingestion by adding multi-year fundamentals, recent historical OHLCV backfill, valuation snapshots, ownership snapshots, and stock-level news/events.

## Sources

The implementation uses only JSON APIs documented in `backend/app/scraping_sources/amarstock_api_sample.md`:

* Snapshot API: `https://www.amarstock.com/data/1981d726120d/{SYMBOL}`
* Historical price API: `https://www.amarstock.com/data/5ee4d332a90e/?scrip={SYMBOL}&cycle=Day1&dtFrom=YYYY-MM-DD`
* Company financials API: `https://www.amarstock.com/company/2b5e8cfdd75f/?symbol={SYMBOL}`

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

Each selected stock receives a `stock_details_sync_jobs` row. The job table stays execution-focused: status, timestamps, attempts, error, source URL, and compact diagnostics in metadata.

Jobs are created only after final eligibility is resolved. For explicit symbols, `force=true` bypasses cadence only; it still requires `is_active=true` and `should_fetch_details=true`.

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
* Rows are upserted by `stock_id + trade_date`.
* The current default window is 90 calendar days.
* Historical API rows have source priority over homepage/latest-price rows for the same stock/date. The daily homepage sync is treated as a fallback when API historical data already exists.

Company API:

* Rows parse `k` as metric label, `l` as value, `y` as fiscal year, and `r` as statement section.
* Fiscal-year metrics use `YYYY-12-31` as `as_of_date` and financial report period end date.
* Metric definitions are controlled by a fixed mapping. Unknown labels are not turned into new metric codes; they are counted and sampled in job metadata for future mapping.
* Supported sections include balance sheet, income statement, and cash flow statement rows.
* Financial report cache keys include `stock_id + fiscal_year + statement_section` to avoid cross-stock collisions during batch runs.

## Idempotency

Persistence uses natural keys and upserts where the schema supports them:

* `daily_prices`: `stock_id + trade_date`
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
  "trigger_type": "MANUAL"
}
```

`GET /api/v1/stock-details/sync-jobs/{job_id}` returns job status and diagnostics.

CLI:

```bash
python -m app.jobs.sync_stock_details --symbols EBL --historical-window-days 180 --force
```

Run from `backend/` with the project virtualenv and database settings loaded.

Manual trigger parameters:

* `symbols`: comma-separated explicit symbols.
* `limit` and `offset`: batch selection for due stocks when `symbols` is omitted.
* `historical_window_days`: optional per-run historical price window override.
* `force`: cadence override only; does not bypass active/detail eligibility.
