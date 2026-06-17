# Market Dashboard

Trader `/dashboard` section endpoints with optional Redis caching. Admin dashboard is out of scope.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `market_dashboard_router.py` | HTTP only — no cache logic |
| `market_dashboard_service.py` | Compute-on-miss, Redis get/set/delete, orchestration |
| `market_dashboard_cache.py` | Canonical cache keys + explicit invalidation list |
| `redis_client.py` | Optional Redis client; failures are logged, never fatal |

**Policies:**

- No sync-time dashboard aggregation — sync only invalidates cache keys.
- No cache warming — next request rebuilds after invalidation.
- Redis optional — unset `REDIS_URL` and the API computes on every request.
- TTL: `max(60, min(600, market_sync_interval_seconds))` (see `dashboard_cache_ttl_seconds` on `GET /market/freshness`).

## Endpoints

| Endpoint | Phase | Replaces (frontend) |
|----------|-------|---------------------|
| `GET /dashboard/overview` | 2 | `GET /market/summaries` + `GET /market/index/dsex` + stock count |
| `GET /dashboard/movers` | 2 | Client-side movers from `price-windows` universe |
| `GET /dashboard/sectors` | 3 | Sector pulse |
| `GET /dashboard/market-alerts` | 3 | Timeline quality items |
| `GET /dashboard/stocks-in-focus` | 3 | Smart signal feed |
| `GET /dashboard/heatmap` | 3 | Institutional heatmap |
| `GET /dashboard/market-sentiment` | 3 | Insight sidebar + mood |

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
GET /dashboard/movers
  → service tries Redis GET
  → hit: return cached JSON
  → miss / Redis down: list_latest_daily_prices + mover rules → SET EX ttl → return
```

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `REDIS_URL` | unset | e.g. `redis://redis:6379/0` in Docker Compose |

## Phase 2 frontend migration

The dashboard uses:

- `GET /dashboard/overview` — pulse header (DSEX, breadth, turnover/volume context)
- `GET /dashboard/movers` — gainers, losers, turnover/volume leaders
- `GET /market/freshness` — session + cache TTL
- `GET /market/price-windows` — unmigrated sections (signals, heatmap, timeline)

Manual refresh invalidates TanStack Query keys `["dashboard", "overview", …]` and `["dashboard", "movers", …]`.

## DSEX data source

Overview embeds `DsexIndexSnapshotRead` from `MarketDataService.get_dsex_index_snapshot`, which reads synced `daily_market_summaries` (not live AmarStock on the read path). Index may lag up to one sync interval.
