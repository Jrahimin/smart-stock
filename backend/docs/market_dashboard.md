# Market Dashboard

Trader `/dashboard` section endpoints with optional Redis caching. Admin dashboard is out of scope.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `market_dashboard_router.py` | HTTP only — optional `X-Market-Compute-Ms` header in local/dev |
| `market_dashboard_service.py` | Compute-on-miss, Redis get/set, lightweight snapshot orchestration |
| `market_snapshot.py` | Load latest prices + summaries (no trader decision engine) |
| `market_dashboard_compute.py` | Pure snapshot helpers (movers, mood, heatmap, sectors, alerts) |
| `dsex_metrics.py` | DB-first DSEX 1M/6M/1Y; AmarStock fallback only when local depth insufficient |
| `market_dashboard_cache.py` | Canonical cache keys |

**Policies:**

- Dashboard **never** calls `get_scored_universe()` or `compute_trader_decision_from_prices`.
- After sync, background `rebuild_market_read_cache()` warms overview, sectors, and movers before universe (see [market_caching.md](market_caching.md)).
- Redis optional — unset `REDIS_URL` and the API computes on every request.
- TTL: session-aware via `dashboard_cache_ttl_seconds` on `GET /market/freshness`.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /dashboard/overview` | DSEX snapshot (DB-first metrics), summaries, listed stock count — **pulse core** |
| `GET /dashboard/movers` | Gainers, losers, turnover/volume leaders |
| `GET /dashboard/sectors` | Sector participation + top gainer — **leaders widget** (loads independently of overview) |
| `GET /dashboard/market-alerts` | Timeline from lightweight snapshot + summary |
| `GET /dashboard/stocks-in-focus` | Legacy stub (empty); terminal UI uses `GET /signals/decisions/latest` |
| `GET /dashboard/heatmap` | Heatmap tiles from latest daily prices |
| `GET /dashboard/market-sentiment` | Mood + insights from snapshot breadth (no inline decision engine) |

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

## Request flow

```
GET /dashboard/overview
  → Redis GET dashboard:overview:DSE
  → miss: load_dashboard_market_snapshot()
         + build_dsex_performance_snapshot() (no AmarStock on read when depth sufficient)
  → SET EX ttl → return
```

## Computation notes

| Section | Data source |
|---------|-------------|
| Overview / sentiment DSEX | `list_daily_market_summaries` + `dsex_metrics` |
| Movers / heatmap | `list_latest_daily_prices` + `build_technical_snapshot` |
| Sectors / alerts / sentiment breadth | `load_dashboard_market_snapshot` |
| Stocks in focus (UI) | `GET /signals/decisions/latest` (universe Redis cache; not dashboard compute) |

Mover eligibility mirrors `market_mover_rules.is_eligible_session_mover`.

## Frontend load tiers

| Tier | Hooks | Notes |
|------|-------|-------|
| Pulse core | `useDashboardOverview` | DSEX, turnover, volume, breadth render when overview returns |
| Leaders (non-blocking) | `useDashboardSectors` | Own skeleton in pulse strip |
| Secondary | movers, stocks-in-focus, market-alerts | Core workspace columns |
| Deferred | heatmap, market-sentiment | Enabled after overview loads |

Manual refresh clears all IndexedDB + invalidates TanStack market query roots. Sync coordinator clears market IndexedDB only, then invalidates TanStack.

## DSEX data source

Overview uses local `daily_market_summaries` for 1M returns always. 6M/1Y use local data when ≥126/252 trading days exist; otherwise a cached AmarStock fallback (`dsex:amarstock_metrics:{exchange}`). AmarStock HTTP is **not** called on every dashboard read.
