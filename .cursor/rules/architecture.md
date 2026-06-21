# Architecture & Development Rules

## 🎯 Philosophy

* Build for long-term maintainability, not short-term speed
* Prefer clarity over cleverness
* Keep components small, testable, and decoupled
* Avoid premature complexity, but never compromise structure

---

# 🧠 Core Principles

* Strict separation of concerns
* Modular, feature-based architecture
* Clear data flow between layers
* No hidden logic or side effects
* Consistent patterns across the codebase
* File names must be meaningful, searchable, and explicitly mention their purpose

---

# 🧱 Backend (FastAPI)

## Layer Responsibilities

### Router (Controller)

* Handles HTTP requests/responses only
* Validates input/output via schemas
* Calls service layer
* ❌ No business logic
* ❌ No database access

### Service Layer

* Contains business logic
* Orchestrates workflows
* Calls repository layer
* Receives repositories through dependency injection
* No direct HTTP handling

### Repository Layer

* Handles all database interactions
* Encapsulates queries
* Returns clean data objects
* Extends common repository primitives where CRUD behavior is shared
* Uses centralized base repository helpers for repeated query mechanics such as exact filters, active filters, text search, ordering, pagination, and simple boolean toggles
* Keeps domain-specific query intent local by declaring searchable columns, exact filter fields, and ordering columns inside the feature repository
* ❌ No business logic

---

## Shared Backend Primitives

Shared primitives should capture repeatable mechanics only. They should not hide domain meaning or turn into generic dumping grounds.

### Base Repository

`backend/app/core/base_repository.py` owns common persistence and query mechanics:

* `get_by_id`, `create`, `create_model`, `update`, `delete`
* explicit `commit` and `refresh`
* reusable filtered list queries through centralized exact filters, `is_active` filters, search filters, ordering, limit, and offset
* simple boolean toggles by id for common flags such as `is_active`

Feature repositories should still define:

* which exact filters are valid for that module
* which columns are searchable
* which ordering is stable and meaningful for that module
* any joins, aggregates, date-window logic, or domain-specific query behavior

Do not create repository methods that only forward one-to-one to base CRUD helpers. Use base helpers directly from services when the call is clear. Add feature repository methods only when they add domain-specific query meaning.

### Pagination And List Query Params

`backend/app/core/pagination.py` owns pagination and common list-query schemas/dependencies:

* `PaginationParams` for `limit` and `offset`
* `ListQueryParams` for shared list concerns such as `limit`, `offset`, `is_active`, and `search`
* FastAPI dependency helpers that keep routers consistent and thin

Routers should receive shared query parameter objects through dependencies and pass them to services. Services may normalize business-level inputs when needed, but should not duplicate common limit/offset/search plumbing.

Feature-specific query params, such as `exchange`, `indicator_type`, or date ranges, should remain explicit in that feature's router/service/repository flow.

---

## Backend Rules

* Use async everywhere (DB + API)
* Use modern ORM-based database access; avoid raw SQL for normal application operations
* Provide database sessions through a centralized dependency, but keep transaction boundaries explicit in services when workflows require commits or rollbacks
* Use schemas for all input/output
* Use enums instead of magic strings
* Use centralized standard API response helpers for consistent success/error shapes
* Use centralized exception handlers for logging and generic client-safe error responses
* Keep ORM models centralized in `backend/app/models.py`
* Use explicit backend file names such as `stocks_router.py`, `market_data_service.py`, and `database_session.py`
* Inject repositories into services and inject services into routers with FastAPI dependencies
* Check natural unique keys before creates and return the existing record with a clear message when it already exists
* Keep services returning domain objects or simple values; response messages belong in routers/API response helpers
* Use `response_model=ApiResponse[...]` for FastAPI docs and response filtering, and return `ApiResponse` instances via `success_response`
* `success_response` must return an `ApiResponse` model instance, not a raw dictionary
* Keep router return type annotations fully aligned with `response_model`, for example `ApiResponse[list[TechnicalIndicatorRead]]`
* Convert ORM objects to `Read` schemas at the router boundary when needed to preserve static type safety and IDE support
* Avoid `typing.cast` in routers; prefer explicit schema conversion when return types need to stay precise
* Response `Read` schemas that serialize ORM models must enable `from_attributes=True`
* Avoid one-line repository wrappers around base CRUD helpers; call common repository primitives directly from services when they are clear
* Centralize repeated list-query mechanics in `BaseRepository`; feature repositories should supply domain-specific filter/search/order columns instead of rebuilding the same SQL pattern repeatedly
* Use shared pagination/list-query dependencies from `core/pagination.py` for common `limit`, `offset`, `is_active`, and `search` parameters
* Use stable ordering in repository list queries, including deterministic tie-breakers
* Keep active/inactive flag updates centralized when they are simple boolean toggles; use feature services only for surrounding business decisions or not-found handling
* Keep authentication centralized: middleware may parse JWTs and populate `request.state.user`, but routers must not decode tokens directly
* Ensure `request.state.user` always exists; missing or invalid credentials should become anonymous context and route dependencies should enforce authentication
* Keep shared primitives intentional; prefer `core/enums.py`, `core/pagination.py`, and `core/constants/trading_constants.py` over generic dumping-ground folders
* Put domain thresholds and trading constants in a central constants layer instead of scattering magic numbers
* Keep functions small and focused
* Avoid tight coupling between modules
* Write reusable, testable logic

### Market Universe (`modules/market_universe/`)

`market_universe_service` is the **single exchange-wide compute source**. Dashboard, Pulse, Explorer, Scanner, Signals, and Watchlist consume `ScoredUniverseRow` from `GET /api/v1/market/universe-rows` — they do not run parallel `price-windows` + decision loops.

| File | Responsibility |
|------|----------------|
| `market_universe_router.py` | HTTP only |
| `market_universe_service.py` | Compute-on-miss + Redis `universe:scored:{exchange}` |
| `market_universe_compute.py` | `build_scored_universe_rows` — only place OHLCV is held in memory for exchange-wide reads |
| `market_universe_schemas.py` | `ScoredUniverseRow` contract |

Presentation caches (`dashboard:*`, `pulse:*`) layer on scored rows. `invalidate_market_caches()` deletes presentation keys then foundation. See `backend/docs/market_universe.md`.

### Trader Dashboard (`modules/market_dashboard/`)

Section endpoints under `GET /api/v1/dashboard/*` replace the old dashboard `price-windows` fan-out. Compute-on-miss only — no sync-time aggregation, no cache warming.

| Layer | Role |
|-------|------|
| `market_dashboard_router.py` | HTTP only |
| `market_dashboard_service.py` | Orchestration + **all** Redis get/set/delete |
| `market_dashboard_compute.py` | Pure section logic (movers, signals, heatmap, mood, etc.) |
| `market_data_repository` | Reused queries — no parallel SQL in dashboard |

**Redis (optional):** `REDIS_URL` unset → compute every request. Keys: `dashboard:{section}:{exchange}` (`overview`, `movers`, `sectors`, `market-alerts`, `stocks-in-focus`, `heatmap`, `market-sentiment`). TTL: `max(60, min(600, market_sync_interval_seconds))`. `sync_market_snapshot` deletes all keys explicitly (best-effort); failures are logged, never fatal.

**Frontend:** TanStack Query per section; `staleTime` / `refetchInterval` from `GET /market/freshness` → `dashboard_cache_ttl_seconds`. App-level `MarketCacheSyncCoordinator` polls freshness and busts IndexedDB + TanStack market queries when `last_synced_at` advances. See `backend/docs/market_dashboard.md` and `backend/docs/market_caching.md`.

---

## Forbidden (Backend)

* Business logic inside routers ❌
* Direct DB queries in routers ❌
* Hidden global transaction abstractions that make commits and rollbacks hard to trace ❌
* Repeated try/except blocks in every route when a centralized handler should handle it ❌
* Raw SQL for routine CRUD/query operations ❌
* Module-local ORM model files; use the central `backend/app/models.py` instead ❌
* Creating repositories inside services instead of injecting them ❌
* Creating services manually inside routers instead of using dependency injection ❌
* Service-specific result wrapper classes when the route can compose the standard API response clearly ❌
* Returning raw dictionaries from `success_response` or route handlers that declare `ApiResponse[...]` ❌
* Dropping generic return types to plain `ApiResponse` when a precise response type is known ❌
* Cast-heavy route returns for ordinary response serialization ❌
* Repository methods that only forward one-to-one to `BaseRepository.create/update/delete` without adding meaning ❌
* Repeating common list query plumbing (`is_active`, search, order, limit, offset) in every repository ❌
* Putting domain-specific joins, business filters, or strategy logic into `BaseRepository` just because more than one module might query data ❌
* Generic feature filenames like `router.py` or `service.py` when a clearer module-specific name is possible ❌
* Ad hoc route-level auth checks that bypass centralized middleware/dependencies ❌
* Generic catch-all folders like `common/` that become dumping grounds ❌
* Mixing scraping, logic, and DB in one place ❌
* Large monolithic service files ❌
* Hardcoded values ❌

---

# 🎨 Frontend (Next.js)

## Structure Principles

* Component-driven architecture
* Separate UI, state, and data fetching concerns
* Keep pages thin, move logic into hooks/services

---

## Frontend Layers

### Pages (App Router)

* Layout + composition only
* Minimal logic

### Components

* Pure UI components
* Reusable and stateless where possible

### Hooks

* Encapsulate logic and state
* Data fetching and transformations

### API Layer

* Centralized API client
* No direct fetch calls scattered across components

---

## Frontend Rules

* Use TypeScript strictly
* Keep components small and reusable
* Avoid deeply nested components
* Prefer composition over duplication
* Maintain consistent folder structure
* Use explicit frontend file names such as `dashboard-app-shell.tsx`, `trading-signal-card.tsx`, and `backend-api-client.ts`
* Keep App Router route files minimal; framework-required names like `page.tsx` and `layout.tsx` are allowed
* Group hooks by domain, for example `hooks/market/useMarketOverview.ts`
* Design should be mobile responsive

---

## Frontend Workspace Architecture

The frontend should be a persistent institutional market workspace for Bangladesh stock intelligence. It should help traders quickly answer what is happening in the market, which stocks deserve attention, what opportunities and risks exist, and why a signal was generated.

### Feature Modules

Use feature-based modules under `frontend/features/`:

* `market-dashboard/` for market overview, breadth, heatmap, movers, smart signals, and timeline
* `stock-workspace/` for stock lookup, chart workspace, technical summary, fundamentals, and insight sidebar
* `scanner/` for opportunity scans and filterable candidate groups
* `signals/` for explanation-first deterministic signal feeds
* `watchlist/` for grouped local watchlists and future backend persistence

Feature modules own their components, hooks, view models, services, and types. Shared UI belongs under `frontend/components/`; shared API, formatter, insight, command, and market logic belongs under `frontend/lib/`.

### Data Flow And View Models

Frontend data flow is:

`App Router page -> Feature view -> Domain hook -> TanStack Query -> Typed API client -> FastAPI backend -> View-model builder -> UI/chart components`

Rules:

* App Router pages should compose feature views only.
* Backend response envelopes must be unwrapped in the API layer.
* Backend DTOs stay in `frontend/lib/api`; UI components receive view models, chart models, insight models, or table row models.
* Components should not parse backend decimals, infer trading risk, inspect raw data quality, or call APIs directly.
* Formatting belongs in `frontend/lib/formatters`; deterministic trading derivations belong in `frontend/lib/market` or `frontend/lib/insights`.

### Shared Market Intelligence (Client)

List views (Explorer, Scanner, Signals, Watchlist) must not derive action, RSI, or trend independently. Use one pipeline:

| Piece | Location | Role |
|-------|----------|------|
| Backend source | `GET /api/v1/market/universe-rows` | `ScoredUniverseRow`: `technical_snapshot` + `decision` |
| Row mapper | `frontend/lib/market/universe-row-mapper.ts` | DTO → `StockIntelligenceModel` |
| Enrichment | `frontend/lib/market/universe-intelligence.ts` | Merge universe rows + legacy persisted signals (`GET /signals/latest`) for **NEW** badges |
| Hook | `frontend/hooks/market/use-enriched-universe-intelligence.ts` | TanStack Query wrapper; returns `intelligenceByStockId` map |
| Decisions | `frontend/lib/market/trader-decision.ts` | `resolveTraderDecision()`, session-change helpers — **only** source for action badges |
| Trend labels | `frontend/lib/market/trend-display.ts` | Shared Bullish/Bearish/Sideways copy and filter keys |

Watchlist fallback when a symbol is missing from the universe payload: use watchlist item `technical_snapshot` + `trader_decision` (same backend compute path). Stock detail workspace still uses `GET /stock-details/.../decision` for the full decision rail; list-level badges stay on the universe contract above.

### Market Session And Cache Policy

The market session engine should model `PRE_OPEN`, `OPEN`, `POST_CLOSE`, `HOLIDAY`, `STALE`, `PARTIAL`, and `SYNCING` using Asia/Dhaka context, latest market dates, data quality, and future sync job state.

The product uses daily synced data, not live streaming. **Three browser-side cache layers** plus a **sync coordinator** (do not conflate):

| Layer | Where | TTL / behavior |
|-------|--------|----------------|
| Redis (optional) | Backend services | `dashboard_cache_ttl_seconds`; invalidated on sync |
| TanStack Query | Feature hooks | Market hooks: `staleTime` + `refetchInterval` from freshness during OPEN/PRE_OPEN |
| IndexedDB | `backendApiGetMarket` in `backend-api-client.ts` | Market GETs: 5–10 min (`NEXT_PUBLIC_MARKET_CACHE_MINUTES`); other GETs: 2h |
| **Sync coordinator** | `market-cache-coordinator.ts` + `MarketCacheSyncCoordinator` in `providers.tsx` | Polls `/market/freshness` every ~2 min; on `last_synced_at` change → clear IndexedDB + invalidate TanStack roots (`dashboard`, `market-universe-rows`, `market-pulse-*`, `signals`) |

Dashboard loads via `/dashboard/*` only (no `price-windows`). Explorer, scanner, and signals share `market-universe-rows` — no separate TanStack keys.

**Manual refresh:** `MarketDataFreshnessBar` refresh button and feature-hook `refetch()` both call `refreshMarketClientCaches()` via `useMarketCacheRefresh()`. Do not duplicate invalidation logic in feature hooks.

Full end-to-end flow: `backend/docs/market_caching.md`.

### Table And Performance Strategy

Use TanStack Table for stock explorer, signal center, scanner results, and watchlists. Large tables should use sticky headers, aligned tabular financial numerals, clear row dividers, loading/empty/stale states, and virtualization where row count justifies it.

Do not build market-wide pages by issuing one request per stock. Use aggregate backend endpoints: trader dashboard → `GET /api/v1/dashboard/*`; explorer/scanner/signals/watchlist → `GET /api/v1/market/universe-rows`. Per-stock historical endpoints only for chart windows (`GET /api/v1/stock-details/{exchange}/{symbol}/workspace`).

### Stock Detail SEO (P6 Core)

Stock detail pages (`/stocks/{exchange}/{symbol}`) are server-rendered for crawlability. SEO is **head/metadata only** — the trader workspace UI is unchanged.

| Piece | Location | Role |
|-------|----------|------|
| Site base URL | `frontend/lib/seo/site-config.ts` | `NEXT_PUBLIC_SITE_URL` (build-time); fallback `localhost:3000` |
| Page metadata | `frontend/app/stocks/[exchange]/[symbol]/page.tsx` | `generateMetadata`: title, description, canonical, OpenGraph, Twitter |
| Structured data | `frontend/lib/seo/stock-page-seo.ts` + `components/seo/json-ld-script.tsx` | BreadcrumbList + Organization JSON-LD |
| Semantic copy | `buildStockSemanticSummary()` | Meta description from deterministic workspace/decision context |
| Sitemap | `frontend/app/sitemap.ts` | `/`, `/stocks`, `/market-pulse`, all active stock detail URLs |
| Robots | `frontend/app/robots.ts` | Allow public routes; disallow auth/admin; point to sitemap |
| Symbol index API | `GET /api/v1/stocks/active-symbols` | Lean `{ exchange, symbol }[]` for sitemap generation |

Rules:

* Set `NEXT_PUBLIC_SITE_URL` at **frontend Docker build** (with `NEXT_PUBLIC_API_BASE_URL`); canonicals and sitemap URLs bake in at build time.
* Title format: `{SYMBOL} Share Price, Dividend, PE Ratio & Analysis — {Name}`.
* Deferred (P6b): indexable on-page HTML blocks, Dataset/FinancialService schema, company profile narrative.

### Visualization Strategy

Use TradingView Lightweight Charts for stock detail workspaces. Chart components should transform price DTOs into chart-safe models before render, sync theme with design tokens, handle missing/stale/partial data explicitly, and add overlays incrementally: candles and volume first, then timeframe aggregation, SMA/EMA, RSI/MACD panels, signal markers, event overlays, and auditable pattern labels.

### Insights And AI Evolution

Initial insights should be deterministic, auditable, and based on market data, indicators, signals, valuation, ownership, and data quality. Future AI should explain, summarize, and prioritize deterministic evidence rather than becoming the only source of truth. Hybrid and AI-generated insights should map into the same insight model contracts with provenance, confidence, and source context.

---

## Forbidden (Frontend)

* Business logic inside UI components ❌
* Direct API calls everywhere ❌
* Large, unstructured pages ❌
* Tight coupling between components ❌
* Vague reusable filenames when a purpose-specific name improves searchability ❌

---

# 🔄 Data Flow Rules

Backend:
Router → Service → Repository → DB session dependency → DB

Data pipeline:
Prices → Features → Indicators → Signals

Maintenance CLIs live under **`backend/app/scripts/`** (run with **`python -m app.scripts.<module>`** from **`backend/`**, same pattern as `app.jobs`). Stock bootstrap (documented in `backend/docs/stocks.md`): **`python -m app.scripts.seed_stocks`** loads DSE symbols from AmarStock into **`stocks`** when the database has no (or incomplete) stock master data, so daily price ingestion can resolve symbols to `stock_id`.

Frontend:
UI → Domain Hook → API Client → Backend

---

# 🧠 Code Quality Standards

* Clear naming (no abbreviations unless obvious)
* Functions should do ONE thing
* Avoid duplication
* Keep files reasonably small
* Write self-explanatory code (avoid unnecessary comments)

---

# ⚙️ Scalability Guidelines

* Design modules to be independently extendable
* Avoid assumptions that block future features
* Prepare for:

  * AI integration
  * RAG systems
  * Backtesting
  * Real-time data

---

## API Documentation (MANDATORY)

- Every new or modified route must update docs/api_collection.md
- Follow api_doc.md strictly


## Deployment & Infrastructure

Production runs on a single VPS via Docker Compose behind Cloudflare.
Before changing containers, networking, schedulers, or proxy configuration, read:

- `backend/docs/deployment_architecture.md` — architecture, flows, and design choices
- `deploy/README.md` — operational runbook


## Task Management Rule

The project uses a tracking file:
- docs/project_plan.md

Rules:

* Always check the project_plan.md file to identify the current feature
* Follow the corresponding task file before implementing anything
* After completing tasks:

  * update task checkboxes
  * update feature and task status


# 🔐 Reliability First

* Always handle edge cases
* Validate data at boundaries
* Assume external data can be incorrect
* Prefer safe defaults over risky assumptions