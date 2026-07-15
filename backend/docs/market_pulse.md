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
  "score_version": "pulse-attention-v2",
  "recommendations": { "uuid": "POTENTIAL_BUY" },
  "decision_taxonomy_version": "v2",
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

Opportunity history is intentionally empty until comparable point-in-time Pulse snapshots exist. Historical points must use the same formula, candidate population, and strategy version before the API can publish a trend.

The compatibility `money_flow.inflows` / `money_flow.outflows` arrays contain only observed positive/negative **average sector price changes** and declare `semantics=SECTOR_PRICE_CHANGE`. They are rendered as sector price leaders/laggards. Missing positive or negative sides remain empty; the backend never fabricates fallback signs. Institutional participation, accumulation, capital flow, and sector-rotation claims are not inferred from daily OHLCV.

### Redis caches

| Key | Contents |
|-----|----------|
| `pulse:response:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}:{pulse_score_version}:{decision_taxonomy_version}` | Full `MarketPulseRead` |
| `pulse:summary:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}:{pulse_score_version}:{decision_taxonomy_version}` | `MarketPulseSummaryRead` (includes `last_synced_at` generation identity) |

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

Pulse Score is a versioned attention score (0–100), not a recommendation, confidence, or probability. The current definition is `pulse-attention-v2`.

### Core components

| Component | Max points | Meaning |
|-----------|------------|---------|
| Trend | 35 | One canonical trend classification: uptrend 30, sideways 12, otherwise 0. Moving-average checks are not counted again. |
| Momentum | 30 | RSI band plus five-session return. Trend is not counted in this component. |
| Volume | 25 | Current volume versus the prior traded-session median. Missing/invalid baseline contributes 0 and remains unknown. |

### Modifiers

| Modifier | Range |
|----------|-------|
| Signal Boost | up to +10 |
| Risk Penalty | up to -20 |

Constants live in `backend/app/core/constants/trading_constants.py`.

### Focus labels

Each focus stock receives one editorial label. `Volume Breakout` requires a current price crossing of canonical resistance plus expanded relative volume; unusual volume alone does not qualify.

Client `previous_snapshot` payloads may include additive `score_version` and
`decision_taxonomy_version`. Score/focus/action deltas are emitted only when
both match the current versions; older snapshots remain accepted but are
treated as non-comparable until the browser stores one current-version response.

- `Potential Buy Setup`
- `New BUY Setup` (legacy read compatibility only; not newly emitted)
- `Momentum Building`
- `Volume Breakout`
- `Watch Closely`
- `Signal Upgrade`

### Focus selection

- Threshold: `PULSE_SCORE_FOCUS_THRESHOLD` (60)
- Maximum focus stocks: 5
- Candidate gate: canonical eligibility must be `ELIGIBLE`, and the stock, eligibility result, technical snapshot, and exchange session must share the same current trade date
- Stable ordering: score descending, robust turnover/capacity descending, symbol ascending, stock id ascending
- Sector diversification: normally max 2 per sector; one third name may enter only when it leads the best under-cap alternative by at least 10 score points, or no under-cap alternative exists. A sector never contributes more than 3 focus names.
- Monitor candidates use the same stable ordering and are always disjoint from focus
- `coverage` reports the score version, session date, universe count, eligible count, and excluded count

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
| Endpoints | `GET /market/freshness` + anonymous `GET /market/pulse/summary` + anonymous `GET /market/pulse/briefing` only |
| Server URL | `SERVER_API_BASE_URL` (required in production) |
| Fetch mode | `cache: "no-store"` |
| Timeout | `PULSE_CORE_LOADER_TIMEOUT_MS`, falling back to `DASHBOARD_CORE_LOADER_TIMEOUT_MS` |
| TanStack seed | `PULSE_ANONYMOUS_SUMMARY_QUERY_KEY` + `PULSE_ANONYMOUS_BRIEFING_QUERY_KEY` + freshness via `HydrationBoundary` |
| Generation guard | Hydrate summary only when `summary.last_synced_at === freshness.last_synced_at`; hydrate briefing only when reconciled summary is present |
| Client-only | Personalized briefing (`display_name`), `display_name` greeting, `previous_snapshot` since-last-visit personalization |
| Shared Redis | Anonymous requests only (fully versioned `pulse:summary` key including strategy, thresholds, input schema, and Pulse score version); personalized requests bypass shared cache reads and writes |
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
