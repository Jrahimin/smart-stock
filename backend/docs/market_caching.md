# Market Data Caching

End-to-end reference for how market intelligence is cached on the backend (optional Redis) and in the browser (TanStack Query + IndexedDB). Use this doc when debugging stale UI, adding endpoints, or changing sync cadence.

Related module docs: [market_universe.md](market_universe.md), [market_dashboard.md](market_dashboard.md), [market_pulse.md](market_pulse.md), [market_data.md](market_data.md), [deployment_architecture.md](deployment_architecture.md).

---

## Design principles

1. **PostgreSQL is the source of truth.** Caches are performance layers only.
2. **Sync-driven freshness on the backend.** Scheduled and manual data writes invalidate Redis; TTL is a safety net, not the primary refresh mechanism.
3. **Sync-aligned freshness in the browser.** `MarketCacheSyncCoordinator` polls `/market/freshness` and busts IndexedDB + TanStack market queries when `last_synced_at` advances — client caches stay aligned with backend sync without a page reload.
4. **Compute-on-miss, no cache warming.** After invalidation, the next request pays full compute cost.
5. **Redis is optional.** Unset `REDIS_URL` → backend always computes; behavior is correct, only slower.
6. **Browser fetches the API directly.** Next.js does not proxy or server-cache market JSON; all client caching happens in the browser.

---

## Architecture overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                 │
│                                                                         │
│  MarketCacheSyncCoordinator (app/providers.tsx)                         │
│    → polls GET /market/freshness every ~2 min                           │
│    → on last_synced_at change → market-cache-coordinator                │
│         → clear IndexedDB + invalidate TanStack market query roots        │
│                                                                         │
│  UI → TanStack Query (in-memory)                                        │
│         ↓ queryFn                                                       │
│       backendApiGetMarket | backendApiGetFresh | backendApiGet          │
│         ↓                                                               │
│       IndexedDB (optional, URL-keyed) ──miss──→ fetch → FastAPI         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ FastAPI (backend-api)                                                   │
│                                                                         │
│  Router → Service → compute-on-miss → Redis GET                         │
│                         ↓ miss                                          │
│                    Repository → PostgreSQL                              │
│                         ↓                                               │
│                    SET Redis EX=<ttl> (best-effort)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↑
┌─────────────────────────────────────────────────────────────────────────┐
│ backend-scheduler                                                       │
│                                                                         │
│  sync_market_snapshot / backfill / admin jobs → write DB                │
│                                              → invalidate Redis keys    │
└─────────────────────────────────────────────────────────────────────────┘
```

Three **independent** client-side layers (do not conflate), plus one **coordinator**:

| Layer | Where | Typical TTL | Driven by |
|-------|--------|-------------|-----------|
| **Redis** | Backend services | `dashboard_cache_ttl_seconds` (default 600s) | Sync interval + invalidation |
| **TanStack Query** | React hooks | Same as backend TTL during OPEN/PRE_OPEN | `GET /market/freshness` |
| **IndexedDB** | `backend-api-client.ts` | Market: 5–10 min; other GETs: 2h | Build-time env |
| **Sync coordinator** | `market-cache-coordinator.ts` | N/A (event-driven) | `last_synced_at` change on `/market/freshness` poll |

**Coordinator invalidates TanStack roots:** `dashboard`, `market-universe-rows`, `market-pulse-summary`, `market-pulse-briefing`, `signals`. Scanner, signals, and stock explorer consume `market-universe-rows` — no separate keys.

---

## Backend (Redis)

### Infrastructure

| Piece | Location | Notes |
|-------|----------|-------|
| Client | `app/core/redis_client.py` | `OptionalRedisClient`; failures logged, never fatal |
| Key registry + invalidation | `app/core/market_cache.py` | Single hub for exchange-wide keys |
| TTL setting | `Settings.market_dashboard_cache_ttl_seconds` | `max(60, min(600, market_sync_interval_seconds))` |

Storage format: `SET key JSON EX=<ttl_seconds>` (not `SETEX` by name, same effect).

### Cache hierarchy

```text
universe:scored:{exchange}           ← foundation (ScoredUniverseRow list)
dashboard:{section}:{exchange}       ← presentation (7 sections)
pulse:{response|summary}:{exchange}  ← presentation
stock-workspace:{section}:{ex}:{sym}:{trade_date}  ← per-symbol (isolated)
```

**Foundation vs presentation**

- `universe:scored` is shared by dashboard sections, pulse, explorer, scanner, signals, watchlist.
- Dashboard and pulse keys are derived from scored rows + extra presentation logic.
- Stock workspace keys are **not** invalidated on exchange-wide sync (trade-date versioning + TTL only).

### Registered exchange-wide keys (10 total)

| Pattern | Sections |
|---------|----------|
| `dashboard:*:{exchange}` | `overview`, `movers`, `sectors`, `market-alerts`, `stocks-in-focus`, `heatmap`, `market-sentiment` |
| `pulse:*:{exchange}` | `response`, `summary` |
| `universe:*:{exchange}` | `scored` |

### Request flow (compute-on-miss)

```text
GET /dashboard/movers
  → MarketDashboardService._get_cached()
  → Redis GET dashboard:movers:DSE
  → hit: return JSON
  → miss: compute from DB / universe → SET EX ttl → return
```

Universe rows follow the same pattern in `MarketUniverseService.get_scored_universe()`.

### When Redis is invalidated

All paths call `invalidate_market_caches_for_exchange()` in `app/core/market_cache.py`, which deletes the 10 registered keys (best-effort).

| Trigger | Location | Notes |
|---------|----------|-------|
| Price ingest (default) | `MarketDataService.ingest_daily_prices()` | After commit; default `invalidate_market_cache=True` |
| Single price create | `MarketDataService.create_daily_price()` | Uses stock's exchange |
| Daily news sync | `run_daily_market_sync()` | After news ingestion |
| Historical backfill | `backfill_daily_prices()` | Once after full date loop; ingest uses `invalidate_market_cache=False` per day |
| Indicator batch job | `compute_daily_indicators()` | DSE exchange |
| Signal batch job | `generate_daily_signals()` | DSE exchange |

Scheduled intraday snapshots call `sync_market_snapshot()` → price ingest → invalidation via the service layer above.

**Not invalidated on exchange-wide sync:** `stock-workspace:*` keys.

**Rule for new code:** mutate market data through the entry points above, or call `invalidate_market_caches_for_exchange()` explicitly. Do not scatter ad-hoc Redis deletes in routers.

### Freshness metadata (not cached in Redis)

`GET /market/freshness` reads PostgreSQL only and exposes:

- `last_synced_at`, `next_sync_at`, `market_status`
- `dashboard_cache_ttl_seconds` — shared contract for backend Redis TTL and frontend TanStack `staleTime`

---

## Frontend (browser)

### No Next.js server cache

Market pages are client-rendered. API calls use `NEXT_PUBLIC_API_BASE_URL` from the browser. There is no App Router `revalidate`, `fetchCache`, or server-side proxy cache for market JSON.

### API client helpers

Defined in `frontend/lib/api/backend-api-client.ts`:

| Helper | IndexedDB | Use for |
|--------|-----------|---------|
| `backendApiGetMarket()` | Yes, short TTL (`marketCacheMinutes`) | Dashboard, universe, pulse, signals, stock workspace |
| `backendApiGetFresh()` | No | `/market/freshness` and other always-live GETs |
| `backendApiGet()` | Yes, long TTL (`cacheHours`) | Non-market data (e.g. stock search) |

**Convention:** market modules use `*-api.ts` files that call `backendApiGetMarket` or `backendApiGetFresh`. Plain `backendApiGet` is for non-market GETs only.

IndexedDB details:

- Database: `smart-stock-api-cache`, store `responses`
- Key: full request URL including query string
- Clear all: `clearBackendApiCache()` or `invalidateMarketClientCaches(queryClient)` via `market-cache-coordinator.ts`

### Market cache coordinator

Central service: `frontend/lib/market/market-cache-coordinator.ts`

| Function | Role |
|----------|------|
| `invalidateMarketClientCaches(queryClient)` | Clear IndexedDB + invalidate TanStack market query roots (auto-sync path) |
| `refreshMarketClientCaches(queryClient)` | Above + invalidate `market-freshness` (manual refresh path) |

Mounted app-wide via `MarketCacheSyncCoordinator` in `frontend/app/providers.tsx` (uses `useMarketCacheSyncCoordinator`).

**Sync detection:** compare previous vs current `last_synced_at` from `useMarketDataFreshness` (2 min poll, always network via `backendApiGetFresh`). Skip invalidation on first observed value (initial mount only).

**Do not** duplicate sync detection or cache busting in feature hooks or pages — extend the coordinator when adding new market TanStack roots.

### TanStack Query

Global defaults in `frontend/app/providers.tsx`:

- `staleTime` / `gcTime`: `cacheHours` (default 2h) for hooks that do not override

Market hooks override via `frontend/lib/market/market-cache-policy.ts`:

- `staleTime`: `freshness.dashboard_cache_ttl_seconds × 1000` (fallback 10 min)
- `refetchInterval`: same as `staleTime` when `market_status` is `OPEN` or `PRE_OPEN`; otherwise `false`

Freshness hook (`use-market-data-freshness.ts`):

- `staleTime`: 60s
- `refetchInterval`: 2 min (disabled on Market Pulse page hook instance only; app coordinator always polls)

### Manual refresh

**UI:** `MarketDataFreshnessBar` includes a refresh button (disabled during `PRE_OPEN` / `HOLIDAY`).

**Programmatic:** `useMarketCacheRefresh()` → `refreshMarketClientCaches(queryClient)`.

Feature hooks delegate `refetch()` to the same coordinator (no duplicated invalidation logic):

- `useMarketDashboard`
- `useMarketPulse`
- `useMarketUniverse` (and enriched universe via delegation)

`refresh-market-client-caches.ts` re-exports coordinator functions for backward compatibility.

### Configuration (build-time)

| Env var | Default | Purpose |
|---------|---------|---------|
| `NEXT_PUBLIC_MARKET_CACHE_MINUTES` | `10` (clamped 5–10) | IndexedDB TTL for market GETs |
| `NEXT_PUBLIC_MARKET_CACHE_HOURS` | `2` | IndexedDB TTL for non-market GETs; TanStack global default |

Production: rebuild the frontend Docker image after changing `NEXT_PUBLIC_*` values.

---

## TTL alignment (defaults)

With `market_snapshot_interval_minutes=15`:

| Layer | Value | Notes |
|-------|-------|-------|
| Scheduler sync | 15 min | `backend-scheduler` |
| Backend Redis TTL | 600s (10 min) | Capped at 600 even if sync interval grows |
| TanStack market hooks | 600s during OPEN | From `/market/freshness` |
| IndexedDB market GETs | 10 min | Env clamp 5–10; independent of freshness API |
| IndexedDB `/market/freshness` | None | Always network |
| TanStack freshness hook | 60s stale, 2 min poll | In-memory only; drives sync coordinator |
| Sync coordinator reaction | ≤2 min after sync | `last_synced_at` change → IndexedDB clear + TanStack invalidation |

Primary freshness drivers: **backend Redis invalidation on data write** and **browser coordinator on `last_synced_at` change**. IndexedDB/TanStack TTL alone are safety nets.

---

## End-to-end sample journey

Scenario: trader opens the dashboard during market hours; a scheduled snapshot runs while they are viewing the page.

**Assumptions:** `REDIS_URL` set, `market_snapshot_interval_minutes=15`, session `OPEN`, defaults above.

### T=0 — User opens `/dashboard`

```text
1. useMarketDataFreshness mounts
   → backendApiGetFresh("/market/freshness")     [network, no IndexedDB]
   → TanStack caches freshness 60s

2. useMarketDashboard reads freshness.dashboard_cache_ttl_seconds (=600)
   → sets staleTime/refetchInterval = 600_000 ms for section hooks

3. useDashboardOverview queryFn runs
   → backendApiGetMarket("/dashboard/overview")
   → IndexedDB miss → fetch GET /dashboard/overview
   → Backend: Redis miss → compute from DB → SET dashboard:overview:DSE EX=600
   → Response written to IndexedDB (10 min TTL) and TanStack

4. Parallel section hooks (movers, sectors, …) follow the same pattern
   → Sections that use universe may hit universe:scored:DSE in Redis on backend
```

### T=5 min — TanStack still fresh

```text
User navigates within dashboard
→ TanStack serves in-memory data (staleTime not elapsed)
→ No network, IndexedDB not consulted
```

### T=10 min — TanStack refetch interval fires (OPEN session)

```text
refetchInterval triggers useDashboardOverview refetch
→ backendApiGetMarket("/dashboard/overview")
→ IndexedDB may still serve cached JSON if within 10 min TTL

If backend sync has not run since T=0, data may match T=0 snapshot.
Coordinator has not fired (last_synced_at unchanged).
```

### T=15 min — Scheduler runs sync_market_snapshot

```text
backend-scheduler:
  1. Fetch AmarStock LatestPrice + index API
  2. MarketDataService.ingest_daily_prices() → upsert daily_prices
  3. run_snapshot_enrichment() → DSEX summary
  4. invalidate_market_caches_for_exchange(DSE)
     → DELETE dashboard:*, pulse:*, universe:scored:DSE

PostgreSQL now has fresh prices. Redis exchange-wide keys are empty.
last_synced_at advances in DB.
```

### T=15 min + ≤2 min — Coordinator detects sync (freshness poll)

```text
MarketCacheSyncCoordinator observes new last_synced_at
→ invalidateMarketClientCaches(queryClient)
   → clearBackendApiCache() (IndexedDB wiped)
   → invalidateQueries dashboard, market-universe-rows, market-pulse-*, signals

Active TanStack queries refetch immediately
→ backendApiGetMarket → network (IndexedDB miss)
→ Backend Redis miss → compute from fresh DB → SET EX=600
→ UI updates with new prices (no page reload)
```

### T=15 min — Explorer / scanner / signals same session

```text
useMarketUniverse → invalidated with market-universe-rows
→ backendApiGetMarket("/market/universe-rows")
→ Backend: universe:scored miss (invalidated at sync) → full compute → cache
→ Fresh ScoredUniverseRow list in UI
```

---

## Journey: manual admin backfill

```text
1. Operator: python -m app.jobs.backfill_daily_prices --from 2026-06-01 --to 2026-06-05

2. For each date:
   → ingest_daily_prices(invalidate_market_cache=False)   [no Redis churn per day]

3. After loop:
   → invalidate_market_caches_for_exchange(DSE) once

4. Browser users:
   → Coordinator detects new last_synced_at on next freshness poll (≤2 min)
   → IndexedDB cleared + TanStack market queries invalidated automatically
   → Or user clicks refresh on MarketDataFreshnessBar / calls useMarketCacheRefresh()
```

---

## Journey: manual refresh (UI or programmatic)

```text
User clicks refresh on MarketDataFreshnessBar (or feature hook refetch()):

1. useMarketCacheRefresh() → refreshMarketClientCaches(queryClient)
   → IndexedDB store cleared entirely
   → invalidateQueries: dashboard, market-universe-rows, market-pulse-*, signals
   → invalidateQueries: market-freshness

2. Active TanStack queries refetch
   → Each queryFn → backendApiGetMarket → network → backend
   → Redis hit or compute-on-miss from current DB

Disabled during PRE_OPEN / HOLIDAY (refresh button only; programmatic refetch still available from hooks).
```

---

## Adding a new market endpoint

### Backend

1. If the response depends on exchange-wide prices, indicators, or signals, assume Redis foundation/presentation caches apply.
2. Add a cache key only if the endpoint is expensive and called frequently; register the key in `market_cache.py` and delete it in `invalidate_market_caches()`.
3. Do not add parallel price-window loops; extend `market_universe` if needed ([market_universe.md](market_universe.md)).

### Frontend

1. Add the fetch function in the appropriate `frontend/lib/api/market-*-api.ts` file.
2. Use `backendApiGetMarket` for trader/market intelligence GETs.
3. Use `backendApiGetFresh` only when the response must never be persisted (like freshness).
4. Wrap in a hook with `staleTime` / `refetchInterval` from `getMarketStaleTimeMs` / `getMarketRefetchIntervalMs`.
5. If the hook introduces a new TanStack root for exchange-wide market data, register it in `MARKET_TANSTACK_QUERY_ROOTS` inside `market-cache-coordinator.ts`.
6. For manual refresh, use `useMarketCacheRefresh()` — do not call `clearBackendApiCache()` or ad-hoc `invalidateQueries` from feature code.

---

## Operational notes

| Topic | Guidance |
|-------|----------|
| Deploy backend env change | Restart `backend-api` + `backend-scheduler` |
| Deploy frontend cache env | `docker compose build frontend` (build-time `NEXT_PUBLIC_*`) |
| Redis down | Backend computes every request; no user-facing error |
| Pre-deploy browser IndexedDB | Old entries cleared on next sync detection or manual refresh |
| Stock workspace staleness | Up to Redis TTL within same trade date; not invalidated on sync |
| Pulse `previous_snapshot` param | Backend skips Redis read/write for that request (change-detection path) |

---

## Key files

### Backend

| File | Role |
|------|------|
| `app/core/market_cache.py` | Key patterns, `invalidate_market_caches_for_exchange()` |
| `app/core/redis_client.py` | Optional Redis client |
| `app/core/core_config.py` | TTL formula, `REDIS_URL` |
| `app/modules/market_data/market_data_service.py` | Price ingest/create invalidation |
| `app/jobs/ingestion/ingest_daily_market_prices.py` | Snapshot, daily sync, backfill orchestration |
| `app/modules/market_universe/market_universe_service.py` | Foundation cache |
| `app/modules/market_dashboard/market_dashboard_service.py` | Dashboard presentation cache |
| `app/modules/market_pulse/market_pulse_service.py` | Pulse presentation cache |
| `app/modules/stock_details/stock_details_workspace_service.py` | Per-symbol workspace cache |

### Frontend

| File | Role |
|------|------|
| `lib/api/backend-api-client.ts` | IndexedDB + `Get` / `GetMarket` / `GetFresh` |
| `lib/frontend-config.ts` | Cache TTL env |
| `lib/market/market-cache-coordinator.ts` | IndexedDB clear + TanStack invalidation; `MARKET_TANSTACK_QUERY_ROOTS` |
| `hooks/market/use-market-cache-coordinator.ts` | `useMarketCacheSyncCoordinator`, `useMarketCacheRefresh` |
| `components/market/market-cache-sync-coordinator.tsx` | App-level sync listener (mounted in providers) |
| `components/layout/market-data-freshness-bar.tsx` | Freshness chip + manual refresh button |
| `lib/market/market-cache-policy.ts` | TanStack stale/refetch from freshness |
| `lib/market/refresh-market-client-caches.ts` | Re-exports coordinator (backward compat) |
| `hooks/market/use-market-data-freshness.ts` | Freshness polling |
| `app/providers.tsx` | TanStack global defaults + `MarketCacheSyncCoordinator` |
| `lib/api/market-dashboard-api.ts` | Dashboard GET wrappers |
| `lib/api/market-universe-api.ts` | Universe GET wrapper |
| `lib/api/market-pulse-api.ts` | Pulse GET wrappers |
| `lib/api/market-data-api.ts` | Freshness + legacy market GET wrappers |

---

## Tests

| Test file | Covers |
|-----------|--------|
| `app/tests/test_dashboard_cache_ttl.py` | TTL clamp formula |
| `app/tests/test_market_universe_contract.py` | Key naming, invalidation deletes all 10 keys |
| `app/tests/test_market_snapshot_workflow.py` | Snapshot orchestration |
| `app/tests/test_backfill_daily_prices.py` | Backfill insert-only behavior |
