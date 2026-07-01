# Market Universe Module

## Purpose

`market_universe_service` is the **single exchange-wide compute source** for trader intelligence. Dashboard, Market Pulse, Explorer, Scanner, Signals, and Watchlist consume scored rows from this module — they do not run parallel `list_market_price_windows` + decision-engine loops.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/universe-rows` | `ScoredUniverseRow[]` + `listed_stock_count` meta |

Serves from Redis `universe:scored:{exchange}` on cache hit. On miss, serves stale `universe:scored:prev:{exchange}` if present and spawns background rebuild. Cold miss returns HTTP 503 — **no inline compute on the HTTP request path**.

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
universe:scored:prev:{exchange}     # stale fallback during rebuild
dashboard:{section}:{exchange}      # presentation — lightweight snapshot (no universe)
pulse:{section}:{exchange}          # presentation — still uses scored rows + briefing
```

Background rebuild (`rebuild_market_read_cache`) writes `universe:scored` as step 3 after dashboard overview/sectors. Indicator/signal jobs spawn universe-only rebuild. See [market_caching.md](market_caching.md).

## Historical price windows

Consumer modules (pulse, explorer, scanner, signals, watchlist) **must not** call `GET /market/price-windows` or `list_market_price_windows` directly. **Dashboard** uses `market_snapshot` instead — it is not a universe consumer.

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
| `market_universe_service.py` | `get_scored_universe`, `recompute_scored_universe`, Redis get/set |
| `market_universe_router.py` | HTTP route |
| `market_universe_cache.py` | Key helpers |

## Consumers

| Module | Integration |
|--------|-------------|
| `market_pulse_service` | `get_scored_universe()` + pulse score + briefing presentation |
| `trader_decisions_service` | Delegates to universe service |
| Frontend `useMarketUniverse` | `GET /market/universe-rows` |
