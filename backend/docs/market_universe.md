# Market Universe Module

## Purpose

`market_universe_service` is the **single exchange-wide compute source** for trader intelligence. Dashboard, Market Pulse, Explorer, Scanner, Signals, and Watchlist consume scored rows from this module — they do not run parallel `list_market_price_windows` + decision-engine loops.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/universe-rows` | `ScoredUniverseRow[]` + `listed_stock_count` meta |

Serves from Redis `universe:scored:{exchange}` on cache hit; computes on miss.

## `ScoredUniverseRow` contract

Canonical row type in `market_universe_schemas.py`. Frontend mirror: `BackendScoredUniverseRowDto`.

### Allowed fields (cache-safe)

| Field group | Contents |
|-------------|----------|
| `stock` | `StockRead` summary (no embedded relations) |
| `technical_snapshot` | Scalar indicators — RSI, SMA20, trend, support/resistance, change%, volatility |
| `decision` | `TraderDecisionSummaryRead` — recommendation, confidence, opportunity_score, risk_label |
| `session` | Latest bar metadata — trade date, close, volume, turnover, change%, data quality |

### Forbidden in `universe:scored` Redis payload

Never cache or serialize:

- `prices[]` / OHLCV arrays / candle series
- Chart models, pattern detections, swing points
- Market events, ownership, valuation, briefing blocks
- Consumer-specific DTO fields (`FocusStockRead`, dashboard section shapes, etc.)
- `pulse_score` (owned by pulse presentation layer until promoted — see below)

Contract tests in `test_market_universe_contract.py` enforce this denylist.

## Pulse score ownership

| Scenario | Owner |
|----------|-------|
| Pulse-only consumer (default) | `market_pulse_service` calls `compute_pulse_score(snapshot, decision)` per row when building the pulse response |
| Second server-side consumer needs sort/filter/rank by pulse score | Promote `pulse_score` into `ScoredUniverseRow` in `market_universe_compute.py` |

Frontend-only pulse display does **not** trigger promotion.

## Cache hierarchy

```text
universe:scored:{exchange}          # foundation — lightweight ScoredUniverseRow list
dashboard:{section}:{exchange}      # presentation — derived from scored rows
pulse:{section}:{exchange}          # presentation — derived from scored rows + briefing
```

`invalidate_market_caches()` deletes presentation keys first, then `universe:scored`. Stock-workspace keys are **not** invalidated on sync.

## Historical price windows

Consumer modules (dashboard, pulse, explorer, scanner, signals, watchlist) **must not** call `GET /market/price-windows` or `list_market_price_windows` directly.

To extend historical context:

1. Document the use case here.
2. Widen the universe query window or add a new lightweight foundation field in `market_universe`.
3. Do not add parallel price-window loops in consumer services.

Per-stock chart OHLCV (`GET /stock-details/{exchange}/{symbol}/workspace`) is out of scope — it uses versioned `stock-workspace:*` keys.

## Module files

| File | Responsibility |
|------|----------------|
| `market_universe_schemas.py` | `ScoredUniverseRow`, `UniverseRowsRead` |
| `market_universe_compute.py` | `group_price_window_rows`, `build_scored_universe_rows` |
| `market_universe_service.py` | `get_scored_universe`, Redis get/set |
| `market_universe_router.py` | HTTP route |
| `market_universe_cache.py` | Key helpers |

## Consumers

| Module | Integration |
|--------|-------------|
| `market_dashboard_service` | `get_scored_universe()` + section presentation caches |
| `market_pulse_service` | `get_scored_universe()` + pulse score + briefing presentation |
| `trader_decisions_service` | Delegates to universe service |
| Frontend `useMarketUniverse` | `GET /market/universe-rows` |
