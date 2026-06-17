# Market Dashboard

Trader `/dashboard` section endpoints with optional Redis caching. Admin dashboard is out of scope.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `market_dashboard_router.py` | HTTP only — no cache logic |
| `market_dashboard_service.py` | Compute-on-miss, Redis get/set/delete, orchestration |
| `market_dashboard_compute.py` | Pure computation helpers (movers, signals, mood, heatmap, sectors) |
| `market_dashboard_cache.py` | Canonical cache keys + explicit invalidation list |
| `redis_client.py` | Optional Redis client; failures are logged, never fatal |

**Policies:**

- No sync-time dashboard aggregation — sync only invalidates cache keys.
- No cache warming — next request rebuilds after invalidation.
- Redis optional — unset `REDIS_URL` and the API computes on every request.
- TTL: `max(60, min(600, market_sync_interval_seconds))` (see `dashboard_cache_ttl_seconds` on `GET /market/freshness`).
- Reuse `MarketDataRepository` + `MarketDataService`; no duplicated SQL outside existing repos.

## Endpoints (all phases)

| Endpoint | Phase | Purpose |
|----------|-------|---------|
| `GET /dashboard/overview` | 2 | DSEX snapshot, recent summaries, listed stock count |
| `GET /dashboard/movers` | 2 | Gainers, losers, turnover/volume leaders |
| `GET /dashboard/sectors` | 3 | Sector participation + top gainer for pulse leaders widget |
| `GET /dashboard/market-alerts` | 3 | Timeline items (quality flags, top decision, scan summary) |
| `GET /dashboard/stocks-in-focus` | 3 | Ranked signal feed (bounded price windows + trader decision) |
| `GET /dashboard/heatmap` | 3 | Institutional heatmap tiles from latest daily prices |
| `GET /dashboard/market-sentiment` | 3 | Market mood, deterministic insights, signal/turnover context |

## Cache keys

```
dashboard:overview:{exchange}
dashboard:movers:{exchange}
dashboard:sectors:{exchange}
dashboard:market-alerts:{exchange}
dashboard:stocks-in-focus:{exchange}
dashboard:heatmap:{exchange}
dashboard:market-sentiment:{exchange}
```

All keys are listed in `DASHBOARD_CACHE_KEY_NAMES` and deleted on successful `sync_market_snapshot` (best-effort).

## Request flow

```
GET /dashboard/stocks-in-focus
  → service tries Redis GET
  → hit: return cached JSON
  → miss / Redis down:
      list_market_price_windows(limit=500, window=90)
      → trader decision per stock
      → rank signals
      → SET EX ttl
  → return
```

## Computation notes

| Section | Data source | Limits |
|---------|-------------|--------|
| Movers | `list_latest_daily_prices` | 5000 rows, top 5 per list |
| Stocks in focus | `list_market_price_windows` | 500 × 90 + decision engine, top 8 signals |
| Heatmap | `list_latest_daily_prices` | 500 tiles |
| Sectors | Price windows (same universe as signals) | Sectors with ≥3 session movers |
| Market sentiment | Price windows + DSEX summary | Mood derived server-side |
| Market alerts | Price windows + latest summary | Timeline parity with legacy client |

Mover eligibility mirrors `market_mover_rules.is_eligible_session_mover`.

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `REDIS_URL` | unset | e.g. `redis://redis:6379/0` in Docker Compose |

Constants in `trading_constants.py`:

- `DASHBOARD_SIGNAL_UNIVERSE_LIMIT = 500`
- `DASHBOARD_PRICE_WINDOW_LIMIT = 90`
- `DASHBOARD_SIGNAL_FEED_LIMIT = 8`
- `DASHBOARD_HEATMAP_LIMIT = 500`
- `DASHBOARD_MARKET_MOVERS_LIMIT = 5`

## Frontend load tiers

| Tier | Hooks | Notes |
|------|-------|-------|
| Immediate | `useDashboardOverview`, `useMarketDataFreshness` | Pulse header |
| Secondary | movers, sectors, stocks-in-focus, market-alerts | Core workspace columns |
| Deferred | heatmap, market-sentiment | `next/dynamic` imports; enabled after overview loads |

The dashboard **no longer** calls `GET /market/price-windows` on load. Manual refresh invalidates all `["dashboard", …]` TanStack Query keys.

## DSEX data source

Overview and sentiment embed `DsexIndexSnapshotRead` from synced `daily_market_summaries` (not live AmarStock on the read path). Index may lag up to one sync interval.

## Operational behavior

| Scenario | Behavior |
|----------|----------|
| Redis up | Cache hit → fast JSON; miss → compute once per TTL window |
| Redis down | Every request computes; app remains available |
| Sync completes | Explicit key delete (best-effort); no warming |
| Cold cache after sync | First request pays full compute cost (by design) |
