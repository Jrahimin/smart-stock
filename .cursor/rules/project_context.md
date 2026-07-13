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

Market data workflow (split):

1. **Intraday snapshots** (`sync_market_snapshot`) — LatestPrice JSON → `daily_prices`; index API → DSEX `daily_market_summaries`; every ~15 min during Sun–Thu session window.
2. **Daily orchestration** (`run_daily_market_sync`) — AmarStock News → `market_events` once per session day after close.
3. Clean and validate (optional StockNow validation when enabled)
4. Store in database (upsert by `stock_id + trade_date`)
5. Compute indicators and generate signals downstream
6. **Background cache rebuild** — after snapshot ingest, `spawn_rebuild_market_read_cache()` warms Redis in priority order: `dashboard:overview` → `dashboard:sectors` → `universe:scored` (fire-and-forget; scheduler does not await)

`GET /market/freshness` exposes snapshot timing and `market_status` for the frontend (no hardcoded session times in UI). The app-level **market cache coordinator** polls this endpoint every ~2 minutes; when `last_synced_at` advances after a backend sync, it clears market IndexedDB entries and invalidates TanStack market queries (dashboard, universe, pulse, signals) so those surfaces refetch without a page reload. Between syncs, **generation-aware IndexedDB validation** (market schema v2 + `last_synced_at` comparison) rejects stale per-URL entries and forces network refetch. Manual refresh still wipes all IndexedDB. Market IndexedDB TTL follows `dashboard_cache_ttl_seconds` from freshness when available. See `backend/docs/market_caching.md`.

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
* Auth middleware: `backend/app/middlewares/auth_middleware.py` parses optional JWTs into `request.state.user` and never blocks requests
* Route auth dependencies: `backend/app/api/dependencies/auth_dependencies.py` exposes `get_current_user_context` and `get_current_user`
* Auth module: `backend/app/modules/auth/` owns registration, email verification, login, refresh, logout, `/me`, password change, and OAuth provider login
* Mail module: `backend/app/modules/mail/` sends account verification emails
* Maintenance CLIs: `backend/app/scripts/` (invoke from **`backend/`** as `python -m app.scripts.<module>`; e.g. stock bootstrap `app.scripts.seed_stocks`)

## Backend Feature Modules

Each active feature module keeps schemas, repository, service, and router files in its own folder. Services receive repositories through dependency injection. Routers receive services through dependency injection.

* Stocks:
  * Schemas: `backend/app/modules/stocks/stocks_schemas.py`
  * Repository: `backend/app/modules/stocks/stocks_repository.py`
  * Service: `backend/app/modules/stocks/stocks_service.py`
  * Routes: `backend/app/modules/stocks/stocks_router.py`
  * `GET /api/v1/stocks/active-symbols` — lean active symbol index for frontend sitemap (`ActiveStockSymbolRead`)

* Market data:
  * Schemas: `backend/app/modules/market_data/market_data_schemas.py`
  * Repository: `backend/app/modules/market_data/market_data_repository.py`
  * Service: `backend/app/modules/market_data/market_data_service.py`
  * Routes: `backend/app/modules/market_data/market_data_router.py`
  * DSEX metrics: `backend/app/modules/market_data/dsex_metrics.py` — DB-first index performance; AmarStock fallback when local history shallow
  * Includes per-stock daily prices and market-wide daily summaries.

* Market universe (trader surfaces only — not dashboard):
  * Schemas: `backend/app/modules/market_universe/market_universe_schemas.py`
  * Compute: `backend/app/modules/market_universe/market_universe_compute.py`
  * Service: `backend/app/modules/market_universe/market_universe_service.py`
  * Routes: `backend/app/modules/market_universe/market_universe_router.py`
  * `GET /api/v1/market/universe-rows` — scored rows + decision; Redis `universe:scored`; stale `universe:scored:prev` on miss; cold miss → 503
  * Docs: `backend/docs/market_universe.md`

* Market dashboard (lightweight snapshot — no decision engine):
  * Service: `backend/app/modules/market_dashboard/market_dashboard_service.py`
  * Snapshot loader: `backend/app/modules/market_dashboard/market_snapshot.py`
  * Compute: `backend/app/modules/market_dashboard/market_dashboard_compute.py`
  * Routes: `backend/app/modules/market_dashboard/market_dashboard_router.py`
  * `GET /api/v1/dashboard/*` — overview (pulse core), sectors (leaders), movers, heatmap, alerts, sentiment
  * `GET /api/v1/signals/decisions/latest` — Smart Signals / trader decisions (universe cache)
  * Docs: `backend/docs/market_dashboard.md`

* Market Pulse:
  * Schemas: `backend/app/modules/market_pulse/market_pulse_schemas.py`
  * Service: `backend/app/modules/market_pulse/market_pulse_service.py`
  * Pulse Score: `backend/app/modules/market_pulse/pulse_score.py`
  * Routes: `backend/app/modules/market_pulse/market_pulse_router.py`
  * Docs: `backend/docs/market_pulse.md`
  * `GET /api/v1/market/pulse` — curated daily briefing, Pulse Score, focus stocks, changes, alerts

* Stock details:
  * Schemas: `backend/app/modules/stock_details/stock_details_schemas.py`
  * Repository: `backend/app/modules/stock_details/stock_details_repository.py`
  * Service: `backend/app/modules/stock_details/stock_details_service.py`
  * Routes: `backend/app/modules/stock_details/stock_details_router.py`
  * Includes AmarStock API-based fundamentals, recent historical price backfill, valuation snapshots, shareholding snapshots, stock-level events, and optional bulk LatestPrice enrichment per batch. Sync `scope` (`full` default vs `stocks` for stocks-table-only fill-empty) is documented in `backend/docs/stock_details.md`.

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
* Market cache rebuild: `backend/app/jobs/market_cache_rebuild.py` (sequential overview → sectors → universe); spawn: `backend/app/jobs/market_cache_spawn.py`
* Perf instrumentation: `backend/app/core/perf_timing.py`

Market data ingestion context:

* **Primary snapshot source** (default): AmarStock bulk LatestPrice JSON (`AMARSTOCK_LATEST_PRICE_API`). HTML scraper remains available via `daily_market_primary_source = amarstock_html`.
* Manual snapshot CLI: `python -m app.jobs.sync_market_data` (prices + DSEX; `--news-only` / `--with-news`). Historical gaps: `python -m app.jobs.backfill_daily_prices --date YYYY-MM-DD`.
* DSEX / official breadth come from the AmarStock **index API**, not LatestPrice JSON.
* Daily price ingestion uses replaceable source classes that return `IngestedDailyPrice`.
* `AmarStockMarketDataSource` fetches live AmarStock latest-share-price HTML, parses with BeautifulSoup plus `lxml`, detects the table from minimal headers (`TRADING CODE`, `LTP`), and maps by header name rather than fixed column positions.
* AmarStock `LTP` maps to `close_price`; `OPEN` is optional, otherwise `YCP` is used as the open-price proxy and rows are marked `PARTIAL`.
* AmarStock `VALUE` supports `K`/`M` suffixes; unsuffixed values are assumed to be in millions until the source contract is confirmed.
* `StockNowMarketDataSource` parses StockNow's rendered AG Grid snapshot for validation only; it does not override AmarStock data.
* Snapshot scheduler runs between configurable `market_open_time` and `market_close_time` (default 10:00–15:00 Asia/Dhaka) every `market_snapshot_interval_minutes` (default 15). Daily news runs at `daily_market_sync_time` (default 15:15). StockNow validation/fallback is optional and off by default.
* If AmarStock and StockNow close prices differ by more than `0.50%`, an otherwise `OK` AmarStock row is marked `SUSPICIOUS` and `daily_market_summaries` gets a `SOURCE_VALIDATION` row with `has_suspicious_prices = true`.
* Ingestion upserts `daily_prices` by `stock_id + trade_date` and skips database writes when a source parse returns no rows.
* After ingest commit, `spawn_rebuild_market_read_cache()` refreshes Redis read caches (does not delete keys first). `sync_market_snapshot` passes `invalidate_market_cache=False` to price ingest and spawns rebuild after enrichment.
* **Enrichment split**: snapshot path runs DSEX index summary only (`run_snapshot_market_enrichment`). Daily path runs news only (`run_daily_news_enrichment`). LatestPrice trade-stat patch is disabled by default (`amarstock_daily_latest_price_patch_enabled=false`). Details: `backend/docs/market_data.md`.

Stock details ingestion context:

* Stock details ingestion is API-only and uses the samples in `backend/app/scraping_sources/amarstock_api_sample.md` as the mapping reference.
* It uses all three AmarStock APIs together: snapshot (`/data/1981d726120d/{symbol}`), historical prices (`/data/5ee4d332a90e`), and company financials (`/company/2b5e8cfdd75f/?symbol={symbol}`).
* **Bulk LatestPrice** (`/LatestPrice/{token}`): one JSON fetch per batch to fill empty stock profile fields from `BusinessSegment` / `MarketCategory` / caps / placeholder names, and (in default **`full`** sync scope) to upsert separate `AMARSTOCK_LATEST_PRICE_API` shareholding and valuation snapshots alongside `AMARSTOCK_API` snapshot rows. With **`stocks`** scope, the same bulk fetch runs but only the fill-empty stock profile merge is applied from it—no LatestPrice shareholding/valuation rows. Toggle: `amarstock_latest_price_stock_details_enabled` in `Settings`. Details: `backend/docs/stock_details.md`.
* It never fetches rendered stock detail HTML and does not use BeautifulSoup, `lxml`, table parsing, or `data-key` attributes for this feature.
* Eligibility is controlled by `stocks.is_active` and `stocks.should_fetch_details`; cadence is controlled by `stock_details_sync_frequency_months` for default **`full`** batch selection. **`stocks`** scope skips that cadence filter so profile-only runs can page all eligible symbols.
* `stock_details_sync_jobs` is execution tracking only. Diagnostics such as parsed counts and unmapped company rows live in job metadata.
* Company API metrics use a controlled mapping from source label to `metric_code`; unknown labels are kept in diagnostics instead of creating uncontrolled metric definitions.
* Manual stock-details runs can override `historical_window_days`; API historical prices are the primary `daily_prices` source for overlapping dates, while homepage latest-price ingestion is fallback. CLI/API `scope` (`full` vs `stocks`) controls whether non-`stocks` tables are written; see `backend/docs/stock_details.md`.

Stock master bootstrap (fresh DB or missing symbols):

* From **`backend/`**: `python -m app.scripts.seed_stocks` (optional `--date YYYY-MM-DD`). Implementation in `backend/app/scripts/seed_stocks.py`. Loads DSE symbols from AmarStock parsed latest-share-price rows into `stocks` via the market data repository; details in `backend/docs/stocks.md`.

Target flow:

```text
Ingestion → Prices → Features → Indicators → Signals
```

## Frontend

Root: `frontend/`

* App Router layout: `frontend/app/layout.tsx`
* Home / market dashboard route: `frontend/app/page.tsx` (`DashboardPageShell` reads locale cookie)
* Global styles: `frontend/app/globals.css`
* Layout components: `frontend/components/layout/`
* Shared chart components: `frontend/components/charts/`
* Shared command components: `frontend/components/command/`
* Shared table components: `frontend/components/tables/`
* Reusable UI primitives: `frontend/components/ui/`
* API client: `frontend/lib/api/backend-api-client.ts`
* API types: `frontend/lib/api/backend-api-types.ts`
* Frontend config: `frontend/lib/frontend-config.ts`
* Market intelligence derivation: `frontend/lib/market/market-intelligence.ts` (legacy client derivations; chart/historical paths)
* Shared list intelligence: `frontend/lib/market/universe-row-mapper.ts`, `universe-intelligence.ts`, `trader-decision.ts`, `trend-display.ts`
* Shared list hook: `frontend/hooks/market/use-enriched-universe-intelligence.ts` (`intelligenceByStockId` from universe rows + persisted signals)
* Market universe hook: `frontend/features/market-dashboard/hooks/use-market-universe.ts` (raw rows + mapped list models)
* Market cache coordinator: `frontend/lib/market/market-cache-coordinator.ts` (market IndexedDB clear + TanStack invalidation on sync; per-URL generation stale bust; full IndexedDB clear on manual refresh); `frontend/lib/market/market-generation.ts`, `market-indexeddb-cache.ts`, `market-cache-url-registry.ts`; `frontend/hooks/market/use-market-cache-coordinator.ts`; mounted via `frontend/components/market/market-cache-sync-coordinator.tsx` in `frontend/app/providers.tsx`
* Market cache policy: `frontend/lib/market/market-cache-policy.ts` (`staleTime` / OPEN `refetchInterval` from freshness + snapshot cadence)
* App locale (cookie, `AppLocale`, default `bn`): `frontend/lib/locale/app-locale.ts`
* Market dashboard feature: `frontend/features/market-dashboard/` — pulse `pulseCore` (overview) and `leaders` (sectors) load independently; bilingual copy in `dashboard-language.ts`
* Stock workspace feature: `frontend/features/stock-workspace/`
* Stock detail SEO (server, App Router):
  * Config: `frontend/lib/seo/site-config.ts` (`NEXT_PUBLIC_SITE_URL`)
  * Helpers: `frontend/lib/seo/stock-page-seo.ts` (canonical, title, JSON-LD builders)
  * Route: `frontend/app/stocks/[exchange]/[symbol]/page.tsx` (`generateMetadata` + JSON-LD scripts)
  * Crawl files: `frontend/app/sitemap.ts`, `frontend/app/robots.ts`
  * JSON-LD component: `frontend/components/seo/json-ld-script.tsx`
* Scanner feature: `frontend/features/scanner/`
* Signal center feature: `frontend/features/signals/`
* Watchlist feature: `frontend/features/watchlist/`
* Market Pulse feature: `frontend/features/market-pulse/` — daily briefing at `/market-pulse`, powered by `GET /api/v1/market/pulse`

Current frontend product flow:

* Market Pulse loads the backend briefing endpoint and maps the response into editorial page sections (hero, focus stocks, insight, changes, alerts).
* Dashboard loads section endpoints (`GET /dashboard/*`): pulse core from overview (DSEX, turnover, volume, breadth); leaders widget from sectors (non-blocking skeleton); movers, heatmap, alerts, and sentiment as secondary/deferred sections. Smart Signals loads `GET /signals/decisions/latest`. No scored-universe or decision-engine dependency on the dashboard backend read path.
* Stock Explorer uses TanStack Table over derived stock intelligence models for trader-focused discovery.
* Explorer, Scanner, Signal Center, and Watchlist resolve **Action**, **RSI**, and **Trend** from the shared enriched universe map (`useEnrichedUniverseIntelligence` → `resolveTraderDecision` + `trend-display`). Do not read watchlist-only `trader_decision` when universe intelligence exists.
* Stock Detail Workspace uses `GET /stock-details/{exchange}/{symbol}/workspace` as the page aggregate (`StockWorkspaceRead`: stock, prices, decision_support, fundamentals, `display_metrics`). Domain layers: Stock Entity (DB + engines) → page aggregate → presentation view models. Rule #1: no competing frontend decision/valuation math when `display_metrics` / `decision_support` exist. Hybrid render: durable server summary + client chart/workspace. SEO: `generateMetadata`, JSON-LD, sitemap via `GET /stocks/active-symbols`.
* Signal Center and Scanner reuse deterministic signal and stock intelligence models instead of static placeholders.
* Watchlist joins user items to the same `intelligenceByStockId` map; API `technical_snapshot` is fallback only when a symbol is outside the universe payload.
* Dashboard listed-stock count should represent active stock-master coverage; price-backed analytics use latest-price snapshot rows (not the full scored universe).
* DSEX and total exchange turnover depend on real `daily_market_summaries` index rows; 6M/1Y may use cached AmarStock fallback until local DSEX depth is sufficient. `SOURCE_VALIDATION` rows are data-quality records and should not be presented as DSEX index values.
* Settings route: `frontend/app/settings/page.tsx`; theme preference is stored in `frontend/stores/use-workspace-store.ts`.
* **Frontend localization (Bangla / English):** cookie-based, feature-local dictionaries—no global i18n library. Default locale `bn`. Shared types/cookie: `frontend/lib/locale/app-locale.ts`. Pattern and copy file map: `backend/docs/frontend_localization.md`.
* **Dashboard onboarding guide (mascot tour):** `frontend/features/guide/`
  * Viewport routing: `dashboard-sidebar-guide.tsx` renders desktop (`>1023px`) or mobile (`≤1023px`) orchestrator only; both receive `dashboardLocale` from `TerminalAppShell`.
  * Desktop flow (v2, 13 steps): dim-only welcome → market widgets → sidebar introduction → per-nav items. Config: `config/dashboard-sidebar-guide.ts` (`DASHBOARD_SIDEBAR_GUIDE_VERSION` = 2; `DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT` = 6; sidebar expands at `DASHBOARD_GUIDE_SIDEBAR_EXPAND_STEP_INDEX`).
  * Mobile flow (v1, 5 steps): welcome sheet → drawer nav highlights → finish. Config: `config/mobile-intro-guide.ts` (`getDashboardMobileGuideSteps(locale)`).
  * Mascot + control copy (bn/en): `dialogs/dashboard-dialogs.ts` (`getDashboardGuideDialogs`, `getSidebarGuideDialogs`, `getMobileIntroDialogs`, `getGuideControls`, `getGuideNudgeCopy`, `getGuideLauncherCopy`).
  * Dashboard UI copy + narratives: `features/market-dashboard/dashboard-language.ts`; locale switcher on dashboard header writes cookie + `router.refresh()`.
  * Preference storage: `lib/guide-preference-storage.ts` — separate local keys, session auto-start keys, and launcher/nudge eligibility per surface (`desktop` vs `mobile`). Guests use local/session only; authenticated users sync via `services/guide-preference-api.ts` to backend preference routes (see `backend/docs/user_preferences.md`).
  * Auto-start: fires after `gate.ready` on `/` (home dashboard), (desktop no longer waits for market-pulse load). A 500ms pre-show activity guard is anchored to the auto-start schedule; interaction during that window suppresses auto-start for the session (`sessionStorage`) but does not mark `autoStartShown`, so the header mascot launcher stays prominent for manual replay.
  * Phase 1 hardening (2026-07): desktop `product-guide-dim` for welcome/pulse-wait; mobile `guide-mobile-interaction-layer` blocks tap-through; mobile sheet sticky actions + safe-area; drawer `guideActive` guards in `terminal-app-shell.tsx` / `mobile-navigation-drawer.tsx`.
  * Styles: `frontend/app/globals.css` (`.product-guide-*`, `.guide-mobile-*`, `.dashboard-locale-switcher`).

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
* `request.state.user` should always exist. Middleware turns missing or invalid credentials into anonymous context; protected routes use `get_current_user`.

---

## Required Action
* After developing each feature, document it in `backend/docs/`: either a focused module doc (e.g. `market_data.md`, `stock_details.md`) or a dedicated topic file when the surface area is large enough to warrant its own guide. Capture business rules, operational commands, and iteration notes for future maintainers.
* Frontend copy / Bangla–English: follow `backend/docs/frontend_localization.md` (feature-local dictionaries, semantic keys, cookie flow).

This context should guide all design and implementation decisions.