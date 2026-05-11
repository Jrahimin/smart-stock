# Project Context – AI-Assisted Stock Analysis System

## 📌 Overview

This system is a personal, scalable stock analysis platform focused on the Bangladesh stock market (DSE/CSE).

It combines:

* Structured market data
* Rule-based analytics
* AI-assisted interpretation (later phase)

The system is designed to evolve from a simple analysis tool into a **serious decision-support system for trading**.

---

# 🎯 Core Goals

1. Build a reliable data pipeline for stock market data
2. Generate consistent, rule-based trading signals
3. Provide clear insights into trends, momentum, and risk
4. Gradually enhance with AI (LLM + RAG) for deeper analysis

---

# 🧩 Key System Capabilities

## 1. Market Data Management

* Store stock master data
* Store daily OHLCV (Open, High, Low, Close, Volume)
* Ensure data consistency and integrity

---

## 2. Indicator Engine

* Compute technical indicators such as:

  * RSI (Relative Strength Index)
  * Moving averages (SMA, EMA)
* Designed to expand with more indicators later

---

## 3. Signal Engine

* Generate rule-based signals:

  * BUY
  * SELL
  * HOLD

Signals are based on:

* Momentum (RSI)
* Trend (moving averages)
* Volume (future)

---

## 4. Data Pipeline

Daily workflow:

1. Ingest data (scraping or API)
2. Clean and validate
3. Store in database
4. Compute indicators
5. Generate signals

The system must be reliable and repeatable.

---

## 5. API Layer

Expose:

* Stock data
* Historical prices
* Indicators
* Signals

Designed for frontend and future integrations.

---

## 6. Frontend Dashboard

Provide:

* Market overview
* Stock-level insights
* Watchlist (future)

Focus on clarity and usability, not complexity.

---

# 🧠 Future Capabilities (Important Context)

These are NOT implemented now but must be supported by design.

## AI Integration

* LLM-based explanations of signals
* Market summaries
* Risk interpretation

---

## RAG (Retrieval-Augmented Generation)

* News-based sentiment analysis
* Historical signal comparison
* Pattern recognition from past data

---

## Backtesting Engine

* Evaluate strategies on historical data
* Measure performance of signals

---

## Portfolio Assistant

* Track holdings
* Suggest actions based on signals

---

# ⚠️ Constraints & Realities

* Bangladesh market data may be inconsistent
* Scraping sources may change structure
* Intraday data may be limited
* Some stocks have low liquidity or manipulation risk

The system must prioritize:

* correctness
* robustness
* simplicity

---

# 🧠 Design Priorities

* Clean architecture over quick hacks
* Deterministic logic before AI
* Scalability without over-engineering
* Maintainability for long-term evolution

---

# 🔑 Key Principle

This is NOT just a data app.

It is a **decision-support system for trading**.

Every feature should ultimately help answer:

* Is this stock worth entering?
* What is the current trend?
* What is the risk?

---

# 🚀 Development Strategy

* Start with minimal, strong foundation
* Build features incrementally
* Validate patterns early
* Avoid unnecessary complexity in early stages

---

# 🗺️ Current Code Map

Use this map to quickly locate features and architectural layers.

## Backend

Root: `backend/app/`

* Application startup: `backend/app/main.py`
* API aggregation: `backend/app/api/api_router.py`
* API v1 aggregation: `backend/app/api/v1/v1_router.py`
* ORM models: `backend/app/models.py`
* Enums: `backend/app/core/enums.py`
* Trading constants: `backend/app/core/constants/trading_constants.py`
* DB session dependency: `backend/app/core/database_session.py`
* Common repository primitives: `backend/app/core/base_repository.py`
* Standard API responses: `backend/app/core/response_handler.py`
* Exception classes and handlers: `backend/app/core/exception_handlers.py`
* Auth user context: `backend/app/core/security_config.py`
* Auth middleware: `backend/app/middlewares/auth_middleware.py`
* Route auth dependencies: `backend/app/api/dependencies/auth_dependencies.py`
* Maintenance CLIs: `backend/app/scripts/` (invoke from **`backend/`** as `python -m app.scripts.<module>`; e.g. stock bootstrap `app.scripts.seed_stocks`)

## Backend Feature Modules

Each active feature module keeps schemas, repository, service, and router files in its own folder. Services receive repositories through dependency injection. Routers receive services through dependency injection.

* Stocks:
  * Schemas: `backend/app/modules/stocks/stocks_schemas.py`
  * Repository: `backend/app/modules/stocks/stocks_repository.py`
  * Service: `backend/app/modules/stocks/stocks_service.py`
  * Routes: `backend/app/modules/stocks/stocks_router.py`

* Market data:
  * Schemas: `backend/app/modules/market_data/market_data_schemas.py`
  * Repository: `backend/app/modules/market_data/market_data_repository.py`
  * Service: `backend/app/modules/market_data/market_data_service.py`
  * Routes: `backend/app/modules/market_data/market_data_router.py`
  * Includes per-stock daily prices and market-wide daily summaries.

* Stock details:
  * Schemas: `backend/app/modules/stock_details/stock_details_schemas.py`
  * Repository: `backend/app/modules/stock_details/stock_details_repository.py`
  * Service: `backend/app/modules/stock_details/stock_details_service.py`
  * Routes: `backend/app/modules/stock_details/stock_details_router.py`
  * Includes AmarStock API-based fundamentals, recent historical price backfill, valuation snapshots, shareholding snapshots, and stock-level events.

* Indicators:
  * Schemas: `backend/app/modules/indicators/indicators_schemas.py`
  * Repository: `backend/app/modules/indicators/indicators_repository.py`
  * Service: `backend/app/modules/indicators/indicators_service.py`
  * Routes: `backend/app/modules/indicators/indicators_router.py`

* Signals:
  * Schemas: `backend/app/modules/signals/signals_schemas.py`
  * Repository: `backend/app/modules/signals/signals_repository.py`
  * Service: `backend/app/modules/signals/signals_service.py`
  * Routes: `backend/app/modules/signals/signals_router.py`

Future feature placeholders:

* AI analysis: `backend/app/modules/ai_analysis/`
* News: `backend/app/modules/news/`
* Backtesting: `backend/app/modules/backtesting/`
* Portfolios: `backend/app/modules/portfolios/`

## Database Tables

Defined centrally in `backend/app/models.py`:

* `stocks`: stock master data.
* `daily_prices`: per-stock OHLCV and derived daily price stats.
* `daily_market_summaries`: exchange/index-level daily summary for quick dashboard fetches.
* `technical_indicators`: indicator values and explainability metadata.
* `trading_signals`: buy/sell/hold outputs, confidence, component scores, and metadata.

## Data Pipeline

Pipeline jobs live under `backend/app/jobs/`:

* Ingestion sources: `backend/app/jobs/ingestion/`
* Feature generation: `backend/app/jobs/features/`
* Indicator computation: `backend/app/jobs/indicators/`
* Signal generation: `backend/app/jobs/signals/`

Market data ingestion context:

* Daily price ingestion uses replaceable source classes that return `IngestedDailyPrice`.
* `AmarStockMarketDataSource` fetches live AmarStock latest-share-price HTML, parses with BeautifulSoup plus `lxml`, detects the table from minimal headers (`TRADING CODE`, `LTP`), and maps by header name rather than fixed column positions.
* AmarStock `LTP` maps to `close_price`; `OPEN` is optional, otherwise `YCP` is used as the open-price proxy and rows are marked `PARTIAL`.
* AmarStock `VALUE` supports `K`/`M` suffixes; unsuffixed values are assumed to be in millions until the source contract is confirmed.
* `StockNowMarketDataSource` parses StockNow's rendered AG Grid snapshot for validation only; it does not override AmarStock data.
* The daily AmarStock sync is scheduled for 2:30 PM Asia/Dhaka and fetches StockNow in parallel to compare only `close_price`.
* If AmarStock and StockNow close prices differ by more than `0.50%`, an otherwise `OK` AmarStock row is marked `SUSPICIOUS` and `daily_market_summaries` gets a `SOURCE_VALIDATION` row with `has_suspicious_prices = true`.
* Ingestion upserts `daily_prices` by `stock_id + trade_date` and skips database writes when a source parse returns no rows.

Stock details ingestion context:

* Stock details ingestion is API-only and uses the samples in `backend/app/scraping_sources/amarstock_api_sample.md` as the mapping reference.
* It uses all three AmarStock APIs together: snapshot (`/data/1981d726120d/{symbol}`), historical prices (`/data/5ee4d332a90e`), and company financials (`/company/2b5e8cfdd75f/?symbol={symbol}`).
* It never fetches rendered stock detail HTML and does not use BeautifulSoup, `lxml`, table parsing, or `data-key` attributes for this feature.
* Eligibility is controlled by `stocks.is_active` and `stocks.should_fetch_details`; cadence is controlled by `stock_details_sync_frequency_months`.
* `stock_details_sync_jobs` is execution tracking only. Diagnostics such as parsed counts and unmapped company rows live in job metadata.
* Company API metrics use a controlled mapping from source label to `metric_code`; unknown labels are kept in diagnostics instead of creating uncontrolled metric definitions.
* Manual stock-details runs can override `historical_window_days`; API historical prices are the primary `daily_prices` source for overlapping dates, while homepage latest-price ingestion is fallback.

Stock master bootstrap (fresh DB or missing symbols):

* From **`backend/`**: `python -m app.scripts.seed_stocks` (optional `--date YYYY-MM-DD`). Implementation in `backend/app/scripts/seed_stocks.py`. Loads DSE symbols from AmarStock parsed latest-share-price rows into `stocks` via the market data repository; details in `backend/docs/stocks.md`.

Target flow:

```text
Ingestion → Prices → Features → Indicators → Signals
```

## Frontend

Root: `frontend/`

* App Router layout: `frontend/app/layout.tsx`
* Dashboard route: `frontend/app/dashboard/page.tsx`
* Global styles: `frontend/app/globals.css`
* Layout components: `frontend/components/layout/`
* Shared chart components: `frontend/components/charts/`
* Shared command components: `frontend/components/command/`
* Shared table components: `frontend/components/tables/`
* Reusable UI primitives: `frontend/components/ui/`
* API client: `frontend/lib/api/backend-api-client.ts`
* API types: `frontend/lib/api/backend-api-types.ts`
* Frontend config: `frontend/lib/frontend-config.ts`
* Market intelligence derivation: `frontend/lib/market/market-intelligence.ts`
* Market dashboard feature: `frontend/features/market-dashboard/`
* Stock workspace feature: `frontend/features/stock-workspace/`
* Scanner feature: `frontend/features/scanner/`
* Signal center feature: `frontend/features/signals/`
* Watchlist feature: `frontend/features/watchlist/`

Current frontend product flow:

* Dashboard loads active stocks and recent per-stock OHLCV to derive heatmap tiles, movers, breadth, market condition, deterministic signals, and timeline context.
* Stock Explorer uses TanStack Table over derived stock intelligence models for trader-focused discovery.
* Stock Detail Workspace uses exchange/symbol lookup, historical OHLCV, candlestick charting, technical summary, deterministic insights, and available stock fundamentals.
* Signal Center and Scanner reuse deterministic signal and stock intelligence models instead of static placeholders.
* Until a backend market-wide latest-prices endpoint exists, the frontend uses per-stock price requests for Trader-usable V1 and should keep this logic isolated in feature hooks/view models.
* Dashboard listed-stock count should represent active stock-master coverage; price-backed analytics can use a smaller capped universe for performance.
* DSEX and total exchange turnover depend on real `daily_market_summaries` index rows. `SOURCE_VALIDATION` rows are data-quality records and should not be presented as DSEX index values.
* Settings route: `frontend/app/settings/page.tsx`; theme preference is stored in `frontend/stores/use-workspace-store.ts`.

## Current Backend Patterns

* Routers stay thin and call injected services.
* Services return domain objects or simple values, not API response wrappers.
* Routers compose response messages with `success_response(...)`, which returns an `ApiResponse` instance.
* Routes keep `response_model=ApiResponse[...]` so FastAPI documents, validates, and filters the final response envelope.
* Router return annotations should stay fully generic, for example `ApiResponse[list[TechnicalIndicatorRead]]`.
* Routers should convert ORM objects to `Read` schemas with `model_validate(...)` when needed to keep return types precise.
* Do not use `typing.cast` in routers just to bridge ORM objects to response schemas.
* Response `Read` schemas must keep `from_attributes=True` when they represent ORM models.
* Repositories own ORM queries and extend common CRUD helpers where useful.
* Avoid repository methods that only forward one-to-one to common CRUD helpers; services can call common repository primitives directly when clear.
* Create routes should check natural unique keys first and return the existing record with a clear message if it already exists.
* Repository list queries should use stable `order_by` clauses with deterministic tie-breakers.
* `request.state.user` should always exist, even before JWT authentication is fully implemented.

---

## Required Action
* After developing each feature, we should write a documentation describing the feature, business logics, insights, and good to know for devs for later iteration things within backend/docs. so each feature will have it's own md file with it's name and will be useful for future reference. 

This context should guide all design and implementation decisions.