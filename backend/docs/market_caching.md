# Market Data Caching

End-to-end reference for how market intelligence is cached on the backend (optional Redis) and in the browser (TanStack Query + IndexedDB). Use this doc when debugging stale UI, adding endpoints, or changing sync cadence.

Related module docs: [market_universe.md](market_universe.md), [market_dashboard.md](market_dashboard.md), [market_pulse.md](market_pulse.md), [market_data.md](market_data.md), [deployment_architecture.md](deployment_architecture.md).

---

## Design principles

1. **PostgreSQL is the source of truth.** Caches are performance layers only.
2. **Sync-driven freshness on the backend.** Scheduled data writes spawn background cache rebuilds; TTL is a safety net. Keys are overwritten on success — not deleted before rebuild.
3. **Sync-aligned freshness in the browser.** `MarketCacheSyncCoordinator` polls `/market/freshness` and, when `last_synced_at` advances, clears **market-related IndexedDB entries** then invalidates TanStack market queries. Manual refresh still clears all IndexedDB.
4. **Background rebuild, compute-on-miss fallback.** After sync, `spawn_rebuild_market_read_cache()` warms overview → sectors → movers → universe in priority order. HTTP misses compute inline for dashboard; universe serves stale `universe:scored:prev` or returns 503.
5. **Redis is optional.** Unset `REDIS_URL` → backend always computes; behavior is correct, only slower.
6. **Browser fetches the API directly.** Next.js does not proxy or server-cache market JSON for client-side hooks; all client caching happens in the browser.

**Exception (dashboard core SSR):** the Next.js server may prefetch **freshness + overview + sectors + movers** for `/` and `/dashboard` using `SERVER_API_BASE_URL` with `cache: "no-store"`. See [Dashboard core SSR (selective)](#dashboard-core-ssr-selective) below.

---

## Architecture overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                 │
│                                                                         │
│  MarketCacheSyncCoordinator (app/providers.tsx)                         │
│    → polls GET /market/freshness every ~2 min                           │
│    → on last_synced_at change → market-cache-coordinator                │
│         → on last_synced_at change → clear market IndexedDB entries     │
│         → then invalidate TanStack market query roots                   │
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
│                                              → spawn rebuild (async)    │
│                                                 overview → sectors      │
│                                                 → movers → universe     │
└─────────────────────────────────────────────────────────────────────────┘
```

Three **independent** client-side layers (do not conflate), plus one **coordinator**:

| Layer | Where | Typical TTL | Driven by |
|-------|--------|-------------|-----------|
| **Redis** | Backend services | `dashboard_cache_ttl_seconds` (default 600s) | Sync interval + invalidation |
| **TanStack Query** | React hooks | Same as backend TTL during OPEN/PRE_OPEN | `GET /market/freshness` |
| **IndexedDB** | `backend-api-client.ts` | From `dashboard_cache_ttl_seconds` when freshness loaded; fallback 5–10 min | Freshness hook + build-time env |
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
universe:scored:{exchange}           ← trader foundation (ScoredUniverseRow list)
universe:scored:prev:{exchange}    ← stale fallback during rebuild
dashboard:{section}:{exchange}     ← lightweight snapshot presentation (no decision engine)
pulse:{response|summary}:{exchange}  ← presentation
stock-workspace:{section}:{ex}:{sym}:{trade_date}  ← per-symbol page aggregate (isolated)
```

**Stock workspace freshness (important):**

* **Cross-day:** `latest_trade_date` in the key is the hard invalidation when the session day advances.
* **Same-day intraday:** snapshot upserts rewrite the same trade date; Redis TTL (`current_cache_ttl_seconds` / dashboard TTL) is the same-day safety net. There is no per-symbol fan-out on `sync_market_snapshot`.
* Frontend stock-detail ISR / TanStack staleTime should follow that TTL (default 600s), not a shorter unrelated interval that fights IndexedDB.

**Dashboard vs universe (split)**

| Layer | Data source | Decision engine? | Used by |
|-------|-------------|------------------|---------|
| Lightweight market snapshot | `daily_prices` latest row + summaries | No | Dashboard pulse, movers, heatmap, alerts, sentiment |
| Scored universe | `list_market_price_windows` 500×90 | Yes | Scanner, signals, watchlist, stock workspace — **not dashboard** |

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

Universe rows: Redis GET `universe:scored` → on miss serve `universe:scored:prev` and spawn background rebuild; cold miss returns HTTP 503. Dashboard sections compute from lightweight snapshot only (no `get_scored_universe`).

### Background rebuild (`rebuild_market_read_cache`)

| Step | Key | Target latency |
|------|-----|----------------|
| 1 | `dashboard:overview` | ~2s (pulse-critical) |
| 2 | `dashboard:sectors` | ~1s (leaders widget) |
| 3 | `dashboard:movers` | ~1s (SSR movers panels) |
| 4 | `universe:scored` | ~15s (trader surfaces only) |

Spawned fire-and-forget after `sync_market_snapshot` commit via `spawn_rebuild_market_read_cache()` in `app/jobs/market_cache_spawn.py`. Scheduler does **not** await rebuild. Failed steps keep the previous Redis value (no delete-first). A best-effort Redis lock per exchange (`market:rebuild-lock:{exchange}`, TTL 180s) prevents overlapping rebuild workers; Redis failure does not block rebuild.

### When caches are refreshed

| Trigger | Location | Notes |
|---------|----------|-------|
| Price ingest (default) | `MarketDataService.ingest_daily_prices()` | `spawn_rebuild_market_read_cache` when `invalidate_market_cache=True` |
| Intraday snapshot | `sync_market_snapshot()` | Ingest with `invalidate_market_cache=False`, then spawn full rebuild |
| Single price create | `MarketDataService.create_daily_price()` | Spawn rebuild |
| Daily news sync | `run_daily_market_sync()` | Spawn rebuild after news |
| Historical backfill | `backfill_daily_prices()` | Spawn rebuild once at end |
| Indicator batch job | `compute_daily_indicators()` | Spawn universe-only rebuild |
| Signal batch job | `generate_daily_signals()` | Spawn universe-only rebuild |

`invalidate_market_caches_for_exchange()` remains for admin/manual use but is no longer the default sync path.

### Freshness metadata (not cached in Redis)

`GET /market/freshness` reads PostgreSQL only and exposes:

- `last_synced_at`, `next_sync_at`, `market_status`
- `dashboard_cache_ttl_seconds` — shared contract for backend Redis TTL and frontend TanStack `staleTime`

---

## Frontend (browser)

### No Next.js server cache (client path)

Market section data loads in the browser. API calls use `NEXT_PUBLIC_API_BASE_URL`. Client hooks do not use App Router `revalidate`, `fetchCache`, or server-side proxy cache for market JSON.

### Dashboard core SSR (selective)

The `/` and `/dashboard` routes server-prefetch a **narrow core slice** before hydration:

| Aspect | Behavior |
|--------|----------|
| Endpoints | `GET /market/freshness` + `GET /dashboard/overview` + `GET /dashboard/sectors` + `GET /dashboard/movers` |
| Server URL | `SERVER_API_BASE_URL` (required in production), e.g. `http://backend-api:8000/api/v1` |
| Fetch mode | `cache: "no-store"` — **no** Next.js Data Cache / ISR for market JSON |
| Timeout | Default 5000ms (`DASHBOARD_CORE_LOADER_TIMEOUT_MS`); partial seed or client-only fallback on slow backend |
| Redis | Still authoritative — internal server fetches hit the same Redis-backed FastAPI routes |
| TanStack seed | `HydrationBoundary` + `initialDataUpdatedAt: fetchedAt` for overview, freshness, sectors, and movers |
| Identity guard | On hydrate, if SSR `last_synced_at` ≠ client freshness/overview → clear market IndexedDB + `syncMarketClientCachesOnBackendUpdate` |
| Cloudflare | Unchanged — HTML, RSC, and API responses bypassed; only `/_next/static/*` cached |

Secondary dashboard sections (heatmap, signals, alerts, sentiment) continue to use **`NEXT_PUBLIC_API_BASE_URL`** via `backendApiGetMarket()` / IndexedDB after hydration.

**Do not** add `export const revalidate` on dashboard routes for market data.

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
| `syncMarketClientCachesOnBackendUpdate(queryClient)` | Clear **market** IndexedDB entries, then invalidate TanStack market query roots (auto-sync + SSR identity guard) |
| `invalidateMarketClientCaches(queryClient)` | Clear **all** IndexedDB + invalidate TanStack market query roots (manual refresh) |
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
| Sync coordinator reaction | ≤2 min after sync | `last_synced_at` change → market IndexedDB clear, then TanStack invalidation |

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
  2. MarketDataService.ingest_daily_prices(invalidate_market_cache=False) → upsert daily_prices
  3. run_snapshot_enrichment() → DSEX summary
  4. spawn_rebuild_market_read_cache(DSE)   [fire-and-forget; scheduler returns immediately]
     → rebuild overview (~2s) → sectors (~1s) → movers (~1s) → universe:scored (~15s)
     → overwrites Redis keys on success; previous keys kept until overwrite

PostgreSQL now has fresh prices. Redis keys update progressively (overview first).
last_synced_at advances in DB.
```

### T=15 min + ≤2 min — Coordinator detects sync (freshness poll)

```text
MarketCacheSyncCoordinator observes new last_synced_at
→ clearMarketBackendApiCache()
→ invalidateMarketTanStackQueries(queryClient)
   → invalidateQueries dashboard, market-universe-rows, market-pulse-*, signals

Active TanStack queries refetch immediately
→ backendApiGetMarket → network (market IndexedDB cleared on sync)
→ Backend: dashboard overview likely Redis hit after rebuild step 1
→ UI updates with new prices (no page reload)
```

### T=15 min — Explorer / scanner / signals same session

```text
useMarketUniverse → invalidated with market-universe-rows
→ backendApiGetMarket("/market/universe-rows")
→ Backend: universe:scored hit after rebuild step 4, or stale universe:scored:prev while rebuild runs
→ ScoredUniverseRow list in UI (may lag overview by <20s)
```

---

## Journey: manual admin backfill

```text
1. Operator: python -m app.jobs.backfill_daily_prices --from 2026-06-01 --to 2026-06-05

2. For each date:
   → ingest_daily_prices(invalidate_market_cache=False)   [no Redis churn per day]

3. After loop:
   → spawn_rebuild_market_read_cache(DSE) once

4. Browser users:
   → Coordinator detects new last_synced_at on next freshness poll (≤2 min)
   → clear market IndexedDB + TanStack market queries invalidated automatically
   → Or user clicks refresh on MarketDataFreshnessBar / calls useMarketCacheRefresh() for full IndexedDB wipe
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
| `lib/market/market-cache-coordinator.ts` | Market IndexedDB clear + TanStack invalidation on sync; full IndexedDB clear on manual refresh; `MARKET_TANSTACK_QUERY_ROOTS` |
| `hooks/market/use-market-cache-coordinator.ts` | `useMarketCacheSyncCoordinator`, `useMarketCacheRefresh` |
| `components/market/market-cache-sync-coordinator.tsx` | App-level sync listener (mounted in providers) |
| `components/layout/market-data-freshness-bar.tsx` | Freshness chip + manual refresh button |
| `lib/market/market-cache-policy.ts` | TanStack stale/refetch from freshness |
| `lib/market/refresh-market-client-caches.ts` | Re-exports coordinator (backward compat) |
| `hooks/market/use-market-data-freshness.ts` | Freshness polling |
| `app/providers.tsx` | TanStack global defaults + `MarketCacheSyncCoordinator` |
| `lib/api/market-dashboard-api.ts` | Dashboard GET wrappers |
| `lib/api/server-market-api.ts` | Server-only `no-store` market fetch + `getServerApiBaseUrl()` |
| `lib/api/dashboard-server.ts` | `loadDashboardCore()` for dashboard SSR |
| `features/market-dashboard/dashboard-page-shell.tsx` | Shared async shell for `/` and `/dashboard` |
| `features/market-dashboard/components/dashboard-query-hydration.tsx` | TanStack `HydrationBoundary` for dashboard SSR seeds |
| `lib/market/build-dashboard-dehydrated-state.ts` | Server-side TanStack dehydrate for freshness, overview, sectors, and movers |
| `features/market-dashboard/components/dashboard-ssr-hydration-guard.tsx` | One-shot TanStack invalidation on SSR freshness/overview mismatch |
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
