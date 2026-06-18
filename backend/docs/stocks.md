# Stocks Module

## Purpose

The stocks module owns stock master data. A stock is the stable identifier used by market prices, indicators, trading signals, and future features such as watchlists and portfolios.

The natural business key is `exchange + symbol`. The database enforces this with a unique constraint, and the service checks it before creating records so duplicate create requests return the existing stock cleanly.

Stock identity also anchors all trader-oriented time-series facts such as financial reports, metric values, dividends, ownership snapshots, valuation snapshots, corporate actions, and market events. Those structures are documented in `backend/docs/fundamentals.md`.

## Layering

* `stocks_router.py`: HTTP request handling, dependency injection, schema conversion, and `ApiResponse` messages.
* `stocks_service.py`: business rules such as duplicate prevention, not-found handling, and active-status toggling.
* `stocks_repository.py`: declares stock-specific searchable, filterable, and ordering columns while shared query mechanics live in `core/base_repository.py`.
* `stocks_schemas.py`: request and response schemas, including input normalization.

## Business Rules

* Symbols are normalized to uppercase before persistence.
* ISIN values are normalized to uppercase when provided.
* Optional text fields such as sector and category are trimmed and blank values become null.
* The same symbol can exist on different exchanges, but not twice on the same exchange.
* Inactive stocks are retained instead of deleted so historical market data and derived analysis remain referentially stable.
* `should_fetch_details` is the source-agnostic control flag for future stock-details ingestion. It decides which active stocks are eligible when the details pipeline is reintroduced with an API source.
* Stock-details cadence and politeness controls live in config (`stock_details_sync_frequency_months`, concurrency, request delay, retry counts) even while the source implementation is temporarily removed.

## Query Behavior

List and search endpoints use the shared `ListQueryParams` dependency for pagination, active filtering, and text search.

Stock lists can be filtered by:

* exchange
* active status
* partial symbol or name match

Results are ordered by exchange, symbol, and id to keep pagination deterministic.

`GET /api/v1/stocks/active-symbols` returns a lean `{ exchange, symbol }[]` index of all `is_active=true` stocks. Used by the frontend sitemap generator for stock detail URLs. Optional `exchange` query filter is supported.

The shared repository helpers apply common exact filters, active filters, search filters, ordering, pagination, and boolean toggles. Feature repositories should still declare the columns involved so domain-specific query intent remains visible in the module.

`PATCH /api/v1/stocks/{stock_id}/details-fetch/toggle` toggles the stock-level `should_fetch_details` flag. This endpoint only controls eligibility; it does not run a details sync while the source implementation is removed.

## CLI: `seed_stocks`

Bootstrap missing DSE stock master rows from AmarStock latest-share-price HTML (same parser path as daily ingestion). Implementation: `backend/app/scripts/seed_stocks.py`.

### How to run

Use the **`backend/`** directory as your working directory (same as `uvicorn` and `python -m app.jobs.sync_market_data`), with the virtualenv activated and **`.env`** present. The module sets the process working directory to `backend/` so `Settings` loads `.env` reliably.

```bash
cd backend
python -m app.scripts.seed_stocks
python -m app.scripts.seed_stocks --date 2026-05-03
```

Windows PowerShell:

```powershell
cd backend
python -m app.scripts.seed_stocks
python -m app.scripts.seed_stocks --date 2026-05-03
```

* **`--date YYYY-MM-DD`**: passed through to `fetch_daily_prices(trade_date)` for parsing metadata (default trade date is today’s calendar date in **Asia/Dhaka**, consistent with other CLIs).

### Behavior

* Symbols: trim and uppercase; non-empty after strip; punctuation allowed (for example hyphens in tickers); symbols containing whitespace after strip are skipped.
* Looks up existing rows via `MarketDataRepository.get_stocks_by_symbols`, inserts only missing stocks through `MarketDataRepository.create_stock`, **one commit** after the batch.
* Logs a sample of up to ten symbols that will be inserted when there are any.

### Errors and exit codes

* **`RuntimeError("AmarStock returned no data")`**: parser produced no rows — CLI logs the message and exits **`1`**.
* **`RuntimeError("AmarStock returned no valid symbols after normalization")`**: rows existed but every symbol was filtered out — exits **`1`**.
* Invalid **`--date`**: exits **`2`**.
* Ctrl+C: **`130`**.
* Other failures (database, network): logged with traceback, exits **`1`**.

Seeded rows use the symbol as the temporary name, `ExchangeCode.DSE` as the exchange, and `is_active=True`. Re-running is idempotent: existing `exchange + symbol` rows are skipped before insert.

## Future Notes

This module should stay intentionally small. Watchlists, portfolios, signals, and AI analysis should reference stock ids rather than duplicate stock identity fields. If more exchange-specific identifiers are needed later, add them to stock master data or a dedicated identifier table instead of spreading symbol logic across feature modules.
