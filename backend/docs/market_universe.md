# Market Universe Module

## Invariant

For one published market generation there is one canonical current trading
decision per stock. Signals, Scanner, Stock Explorer, Stock Details, Watchlist,
Portfolio and Market Pulse consume that reusable result. Consumer services may
add presentation or domain-specific context, but they do not calculate a second
current action.

```text
market_data_generations.sync_id
        ↓
one exchange-wide canonical universe calculation
        ↓
generation-specific Redis payload
        ↓
all trader-facing consumers
```

`MarketUniverseService.resolve_generation_context()` resolves an immutable
`PublishedMarketGeneration` containing `trade_date`, `sync_id`, source timestamp
and current presentation state. The same object is used for input loading,
calculation and cache publication.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/universe-rows` | Canonical rows plus exchange, generation, state and lineage metadata |

The endpoint is Redis-only on the normal HTTP path. A missing current-generation
payload starts a coalesced background rebuild and returns HTTP 503 with an
updating message. It never performs an uncontrolled full-exchange calculation
inside the request.

## Canonical row

`ScoredUniverseRow` contains:

| Field | Contents |
|-------|----------|
| `stock` | Compact stock identity |
| `session` | Published-session price, trade date, volume, turnover and quality |
| `technical_snapshot` | Shared indicators and price structure |
| `eligibility` | Session participation, OHLCV quality, liquidity and corporate-action gate |
| `decision` | Canonical summary, action, constraints, versions, `shared_decision_id` and `input_hash` |
| `analysis` | Reusable opportunity, risk, directional evidence, reliability, trade plan, liquidity and price position |
| `scanner` | Versioned scanner matches and deterministic ranks |

The payload deliberately excludes OHLCV arrays, chart models, patterns, swing
points, ownership, valuation, events and page-specific briefing objects.

Stocks with no trade in the published session retain correct last-traded price
semantics. Eligibility records the missed-session state and prevents a stale
last trade from becoming a fake current signal.

## Cache identity and retention

```text
universe:scored:{exchange}:{market_sync_id}:{strategy_version}:{threshold_version}:{input_schema_version}:{decision_taxonomy_version}
```

Live generations expire after 24 hours; finalized generations use a 30-day
safety horizon. This retains a small operational window without storing every
snapshot in PostgreSQL. Older live keys cannot overwrite the current key and
expire naturally.

Cache acceptance validates the generation id, session, source revision, engine
versions, scanner version, row identities and aggregate payload revision.
`data_state` is intentionally not part of calculation identity:

```text
G124 LIVE → G124 STALE → G124 FINALIZATION_PENDING → G124 FINALIZED
```

These state changes reuse G124. A new `sync_id` is required only when canonical
inputs change.

## Rebuild fencing and overlap control

`market_cache_rebuild.py` uses the existing per-exchange Redis lock. Local
background spawns coalesce repeated requests into at most one follow-up run.
The rebuild resolves a generation once, calculates from that context, and checks
the current generation both before and after the Redis write. If G124 publishes
while G123 is calculating, the G123 result is discarded and the loop builds the
latest generation. Lock release uses an owner token so an expired/replaced lock
cannot be deleted by an older worker.

Redis unavailability or a cold current-generation cache degrades explicitly.
HTTP consumers do not fall back to a database-wide universe calculation.

## Consumer rules

| Consumer | Use |
|----------|-----|
| Signals / Explorer / Scanner | Read canonical rows directly |
| Stock Details | Select the symbol row from one canonical snapshot; add patterns, ownership, valuation and events only |
| Watchlist / Portfolio | Project canonical decisions; use `null`/updating when unavailable, never fabricate `WAIT` |
| Market Pulse | Rank canonical rows and persist finalized aggregates from the same cached generation |
| Dashboard | Uses its lightweight market snapshot, fenced to the published generation; it is not a decision consumer |

Consumer modules must not call `list_market_price_windows` and run the decision
engine independently. Backtesting remains a separate historical use case and is
not a current trader-facing surface.

## Decision-input corrections

Historical OHLCV corrections, relevant stock-detail event inputs, manual daily
prices and market summaries publish a new compact generation manifest after the
write succeeds. That new id invalidates server and browser analysis identity.
Profile-only presentation metadata does not advance the generation.

## Main files

| File | Responsibility |
|------|----------------|
| `market_universe_service.py` | Generation resolution, cache read/write, fencing and canonical snapshots |
| `market_universe_compute.py` | One exchange-wide decision and scanner calculation |
| `market_universe_schemas.py` | Canonical row and envelope contracts |
| `market_universe_cache.py` | Generation/version-aware Redis keys |
| `market_universe_lineage.py` | Deterministic payload revision |
| `../../jobs/market_cache_rebuild.py` | Locked latest-generation rebuild |
| `../trading_intelligence/decision_snapshot_repository.py` | Finalized audit snapshots from canonical rows |
