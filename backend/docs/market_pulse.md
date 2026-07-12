# Market Pulse Module

## Purpose

Market Pulse is the platform's curated daily trader briefing. It answers which stocks deserve attention today, what changed since the last refresh, and which unusual market events matter now.

Unlike the Dashboard or Scanner, Market Pulse is editorial and attention-focused — not a broad market overview or filterable screener.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/pulse` | Full Market Pulse briefing payload |
| `GET /api/v1/market/pulse/summary` | Hero, focus stocks, alerts — tier-1 load |
| `GET /api/v1/market/pulse/briefing` | Market briefing narrative — tier-2 load |

### Query parameters

| Param | Type | Notes |
|-------|------|-------|
| `exchange` | `DSE` / `CSE` | Default `DSE` |
| `display_name` | string | Optional greeting personalization |
| `previous_snapshot` | URL-encoded JSON | Optional prior snapshot for change detection |

### Previous snapshot shape

```json
{
  "last_synced_at": "2026-06-15T10:35:00+06:00",
  "focus_stock_ids": ["uuid", "uuid"],
  "scores": { "uuid": 82 },
  "recommendations": { "uuid": "BUY" },
  "alert_ids": ["alert-volume-uuid"]
}
```

When provided, the backend computes:

- Since your last visit summary
- What's Changed timeline entries
- New focus / alert counts

## Architecture

```text
market_pulse_router
  -> market_pulse_service
      -> market_universe_service.get_scored_universe()
      -> market_data_service.get_market_freshness
      -> market_data_service.list_daily_market_summaries
      -> pulse_score.compute_pulse_score (presentation only)
      -> market_pulse_briefing.build_market_briefing (presentation only)
```

### Briefing = presentation only

`market_pulse_briefing.py` aggregates existing `ScoredUniverseRow` data and `daily_market_summaries`. It **must not**:

- Recompute trader decisions
- Rebuild technical snapshots
- Call `list_market_price_windows`

Opportunity history sparklines use session-level aggregates from `daily_market_summaries`, not per-stock multi-date engine runs.

### Redis caches

| Key | Contents |
|-----|----------|
| `pulse:response:{exchange}` | Full `MarketPulseRead` |
| `pulse:summary:{exchange}` | `MarketPulseSummaryRead` (includes `last_synced_at` generation identity) |

Both are invalidated with exchange-wide keys on sync via `invalidate_market_caches()`.

### Module files

| File | Responsibility |
|------|----------------|
| `backend/app/modules/market_pulse/market_pulse_router.py` | HTTP route |
| `backend/app/modules/market_pulse/market_pulse_service.py` | Briefing orchestration |
| `backend/app/modules/market_pulse/market_pulse_schemas.py` | API contracts |
| `backend/app/modules/market_pulse/pulse_score.py` | Pulse Score + focus labels |

Registered in `backend/app/api/v1/v1_router.py`.

## Pulse Score

Pulse Score is an attention score (0–100), not a BUY score.

### Core components

| Component | Max points |
|-----------|------------|
| Trend | 35 |
| Momentum | 30 |
| Volume | 25 |

### Modifiers

| Modifier | Range |
|----------|-------|
| Signal Boost | up to +10 |
| Risk Penalty | up to -20 |

Constants live in `backend/app/core/constants/trading_constants.py`.

### Focus labels

Each focus stock receives one editorial label:

- `New BUY Setup`
- `Momentum Building`
- `Volume Breakout`
- `Watch Closely`
- `Signal Upgrade`

### Focus selection

- Threshold: `PULSE_SCORE_FOCUS_THRESHOLD` (60)
- Maximum focus stocks: 5
- Sector diversification: max 2 stocks per sector unless scores force inclusion

## Data sources

Uses existing platform capabilities only:

- `daily_prices` price windows (90-day lookback, up to 500 stocks)
- Trader decision engine (`stock_details/decision`)
- Technical snapshot (RSI, SMA20, EMA20, trend, volume ratio)
- Market freshness metadata

No AI is required for V1.

## Frontend

- Route: `/market-pulse`
- Feature module: `frontend/features/market-pulse/`
- API client: `frontend/lib/api/market-pulse-api.ts`
- Local storage retains the previous snapshot for change detection between visits

### Selective SSR

The `/market-pulse` route server-prefetches before hydration:

| Aspect | Behavior |
|--------|----------|
| Endpoints | `GET /market/freshness` + anonymous `GET /market/pulse/summary` only |
| Server URL | `SERVER_API_BASE_URL` (required in production) |
| Fetch mode | `cache: "no-store"` |
| Timeout | `PULSE_CORE_LOADER_TIMEOUT_MS`, falling back to `DASHBOARD_CORE_LOADER_TIMEOUT_MS` |
| TanStack seed | `PULSE_ANONYMOUS_SUMMARY_QUERY_KEY` + freshness via `HydrationBoundary` |
| Generation guard | Hydrate summary only when `summary.last_synced_at === freshness.last_synced_at` |
| Client-only | Briefing panel (`/market/pulse/briefing`), `display_name` greeting, `previous_snapshot` since-last-visit personalization |
| Shared Redis | Anonymous requests only (`pulse:summary:{exchange}`); personalized requests bypass shared cache reads and writes |
| Snapshot writes | Protected — write only when resolved summary generation matches freshness; personalized failures preserve `localStorage` |

Component layers:

| Component | Role |
|-----------|------|
| `market-pulse-page-shell.tsx` | Server load + dehydrate |
| `market-pulse-client.tsx` | Hook bridge |
| `market-pulse-view.tsx` | Presentational only |
| `hooks/use-market-pulse.ts` | Anonymous + personalized query orchestration |

## Future evolution

- Persist pulse snapshots per refresh cycle server-side
- Reuse Pulse Score in Scanner, Watchlist, and Stock Details from the same backend module
- Watchlist-aware personalization
- AI-generated narrative summaries on top of deterministic evidence

## Related

- Market data: `backend/docs/market_data.md`
- Decision support: `backend/docs/stock_decision_support.md`
- API reference: `backend/docs/api_collection.md`
