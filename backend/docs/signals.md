# Signals And Trader Decisions

## Single source of truth

All current trader-facing actions come from the canonical market universe for
the published `market_sync_id`. The decision engine runs once per stock during
that exchange-wide rebuild. No page owns a second BUY/WAIT/SELL mechanism.

```text
published generation
  → build_strategy_input + compute_trader_decision (once per stock)
  → canonical ScoredUniverseRow
  → Signals / Scanner / Explorer / Stock Details / Watchlist / Portfolio / Pulse
```

The canonical result contains the public `display_action`, internal
recommendation, decision date, strategy/threshold/input/taxonomy versions,
`shared_decision_id`, `input_hash`, eligibility, opportunity, risk, constraints
and trade plan.

## Runtime APIs

| Endpoint | Contract |
|----------|----------|
| `GET /api/v1/market/universe-rows` | Full canonical list payload and `meta.market_sync_id` |
| `GET /api/v1/signals/decisions/latest` | Decision-only projection of the same universe rows |
| `GET /api/v1/stock-details/{exchange}/{symbol}/decision-support` | Same canonical identity plus detail-only explanations and research context |
| `GET /api/v1/stock-details/{exchange}/{symbol}/workspace` | Page aggregate carrying the same top-level generation id |
| `GET /api/v1/market/price-windows` | Deprecated; embedded decisions still come from the universe |

Stock Details never invokes the decision engine for its current action. It
selects the stock from one `CanonicalUniverseSnapshot`, uses the row's shared
analysis, then independently adds patterns, warnings, ownership, valuation and
events. The response is checked against the current generation before return;
a mid-request publication change produces an explicit updating/503 response.

## Frontend consumption

Signal Center, Scanner and Explorer use the shared `market-universe-rows`
TanStack query. Stock Workspace and Portfolio include the freshness generation
in their query keys. The generic generation reader understands top-level
`market_sync_id` and nested `meta.market_sync_id`.

Watchlist and Portfolio represent a temporarily unavailable canonical decision
as `null`/Updating. They do not reinterpret absence as a real `WAIT` decision.

## Legacy persisted signals

`GET /api/v1/signals/latest` exposes historical `trading_signals` records. These
records do not override current canonical actions. A prior record may support a
NEW/transition label only when its strategy, threshold, taxonomy, session and
shared identity are comparable with the current canonical result.

## Missing or ineligible data

No OHLCV means no canonical decision. Sparse, non-traded, suspicious or
otherwise ineligible inputs produce explicit eligibility/reliability context.
A real canonical `WAIT` remains distinct from an unavailable/updating decision.

See [market_universe.md](market_universe.md),
[stock_details.md](stock_details.md), and
[market_caching.md](market_caching.md).
