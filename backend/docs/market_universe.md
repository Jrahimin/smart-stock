# Market Universe Module

## Purpose

`market_universe_service` is the **single exchange-wide compute source** for trader intelligence. Dashboard, Market Pulse, Explorer, Scanner, Signals, and Watchlist consume scored rows from this module — they do not run parallel `list_market_price_windows` + decision-engine loops.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/universe-rows` | `ScoredUniverseRow[]` + `listed_stock_count` meta |

Serves from Redis
`universe:scored:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}`
on cache hit. On miss, serves the equivalently versioned `scored:prev` key
if present and spawns background rebuild. Cold miss returns HTTP 503 — **no
inline compute on the HTTP request path**. Legacy unversioned keys are invalidated
but never accepted as current canonical results.

## `ScoredUniverseRow` contract

Canonical row type in `market_universe_schemas.py`. Frontend mirror: `BackendScoredUniverseRowDto`.

### Allowed fields (cache-safe)

| Field group | Contents |
|-------------|----------|
| `stock` | `StockRead` summary (no embedded relations) |
| `technical_snapshot` | Scalar indicators — RSI, SMA20, trend, support/resistance, change%, volatility |
| `decision` | `TraderDecisionSummaryRead` — compatibility fields plus the versioned canonical result, evidence strength, stance, holder/non-holder actions, primary reason, data reliability, trading risk, and constraints |
| `eligibility` | Shared status/reasons, exchange-session identity, traded coverage, quality counts, robust turnover and corporate-action state |
| `scanner` | Additive `scanner-conditions-v1` condition matches with reason, server rank score, capacity score, and deterministic per-condition rank. No OHLCV arrays are added. |
| `session` | Latest bar metadata — trade date, close, volume, turnover, change%, data quality |

### Forbidden in `universe:scored` Redis payload

Never cache or serialize:

- `prices[]` / OHLCV arrays / candle series
- Chart models, pattern detections, swing points
- Market events, ownership, valuation, briefing blocks
- Consumer-specific DTO fields (`FocusStockRead`, dashboard section shapes, etc.)
- `pulse_score` (owned by pulse presentation layer until promoted — see below)

Contract tests in `test_market_universe_contract.py` enforce this denylist.

Cached rows are accepted only when the envelope and every row match the current
exchange session, latest source-sync timestamp, strategy version, threshold
version, input-schema version, scanner-condition version, and aggregate payload
revision. Every row must carry eligibility, scanner context, and a valid input
hash. A stock may lag that session, but its row is then explicitly
review-only/ineligible. Old or mixed-identity caches are rebuilt. Market Pulse
ranks only `ELIGIBLE` rows.

Scanner predicates are owned by `modules/market_scanner/scanner_conditions.py`. They consume only canonical eligibility, technical snapshots, and decision summaries. Frontend Scanner cards group the returned matches and preserve their server ranks; they do not mirror liquidity, breakout, rebound, breakdown, risk, or compression thresholds. See [market_scanner.md](market_scanner.md).

## Pulse score ownership

| Scenario | Owner |
|----------|-------|
| Pulse-only consumer (default) | `market_pulse_service` calls `compute_pulse_score(snapshot, decision)` per row when building the pulse response |
| Second server-side consumer needs sort/filter/rank by pulse score | Promote `pulse_score` into `ScoredUniverseRow` in `market_universe_compute.py` |

Frontend-only pulse display does **not** trigger promotion.

## Cache hierarchy

```text
universe:scored:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}
universe:scored:prev:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}
dashboard:{section}:{exchange}      # presentation — lightweight snapshot (no universe)
pulse:{section}:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}:{pulse_score_version}
                                    # versioned Pulse presentation and briefing
```

Background rebuild (`rebuild_market_read_cache`) writes `universe:scored` as step 4 after dashboard overview, sectors, and movers. Indicator/signal jobs spawn universe-only rebuild. See [market_caching.md](market_caching.md).

## Historical price windows

Consumer modules (pulse, explorer, scanner, signals, watchlist) **must not** call `GET /market/price-windows` or `list_market_price_windows` directly. **Dashboard** uses `market_snapshot` instead — it is not a universe consumer.

To extend historical context:

1. Document the use case here.
2. Widen the universe query window or add a new lightweight foundation field in `market_universe`.
3. Do not add parallel price-window loops in consumer services.

Per-stock chart OHLCV (`GET /stock-details/{exchange}/{symbol}/workspace`) is out
of scope. Its `stock-workspace:*` keys also include strategy version so a strategy
release cannot reuse an older decision projection; they also include threshold
and input-schema versions.

## Module files

| File | Responsibility |
|------|----------------|
| `market_universe_schemas.py` | `ScoredUniverseRow`, `UniverseRowsRead` |
| `market_universe_compute.py` | `group_price_window_rows`, `build_scored_universe_rows` |
| `market_universe_service.py` | `get_scored_universe`, `recompute_scored_universe`, Redis get/set |
| `market_universe_router.py` | HTTP route |
| `market_universe_cache.py` | Key helpers |
| `market_universe_lineage.py` | Deterministic compact-payload revision |
| `../market_scanner/scanner_conditions.py` | Versioned scanner predicates and deterministic ranking |
| `../trading_intelligence/decision_snapshot_repository.py` | Append-only canonical decision snapshots |
| `../trading_intelligence/monitoring.py` | Freshness, lineage, drift, and mismatch checks |

## Consumers

| Module | Integration |
|--------|-------------|
| `market_pulse_service` | `get_scored_universe()` + pulse score + briefing presentation |
| `trader_decisions_service` | Delegates to universe service |
| `watchlists_service` | Projects technicals, canonical decision and holder/non-holder action from universe rows; never recomputes |
| Frontend `useMarketUniverse` | `GET /market/universe-rows` |
