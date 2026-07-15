# Signals And Trader Decisions

This document describes how trading actions are produced and consumed across the platform.

## Single Source Of Truth

All user-facing **Action** badges (`BUY`, `HOLD`, `WAIT`, `SELL`) come from one deterministic decision engine — not from legacy `trading_signals` rows and not from client-side heuristics.

| Layer | Module | Role |
|-------|--------|------|
| Orchestration | `backend/app/modules/stock_details/decision/engine.py` | OHLCV window, regime, liquidity, bundles output |
| Scoring | `backend/app/modules/stock_details/decision/scoring.py` | Opportunity, risk, recommendation, confidence |
| Technicals | `backend/app/modules/stock_details/decision/technical.py` | RSI, trend, support/resistance, breakout, structure |
| List summary | `backend/app/modules/stock_details/decision/summary.py` | Compact `TraderDecisionSummaryRead` for list APIs |
| Full workspace | `backend/app/modules/stock_details/stock_details_decision_service.py` | Patterns, trade plan, warnings, full `reasoning[]` |

**Input data:** `daily_prices` (OHLCV) and `daily_market_summaries` (index + breadth for market regime). See `backend/docs/market_data.md`.

**Lookback:** `DECISION_RECOMMENDATION_LOOKBACK` (90 sessions by default) in `trading_constants.py`. Universe rebuild and stock workspace both run the same engine on this window.

**Cached foundation:** `MarketUniverseService.get_scored_universe()` reads the
background-built scored universe. Redis identity includes exchange, strategy,
threshold, and input-schema versions; its envelope also binds the source-sync
and payload revisions. Rebuild order after sync: dashboard overview → sectors →
movers → **universe** (`market_cache_rebuild.py`).

```
daily_prices + daily_market_summaries
        ↓
build_strategy_input() + compute_trader_decision()  ← per stock
        ↓
build_trader_decision_summary()         ← list DTO (compact)
        ↓
Redis universe:scored:{exchange}:{strategy_version}:{threshold_version}:{input_schema_version}
        ↓
GET /market/universe-rows  (canonical list payload)
```

## Runtime API Surfaces

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `GET /api/v1/market/universe-rows` | **Canonical list** — stock + `technical_snapshot` + `trader_decision` + session | Preferred for explorer, scanner, signal center, dashboard feed |
| `GET /api/v1/signals/decisions/latest` | Decision-only slice of the same scored universe | Same Redis cache; no technical snapshot in response |
| `GET /api/v1/market/price-windows` | Deprecated OHLCV + embedded decision | Still reads `universe:scored` for decisions |
| `GET /api/v1/stock-details/{exchange}/{symbol}/decision-support` | Full workspace payload with `reasoning[]`, trade plan, patterns | Recomputes engine for one symbol; same formulas |

List endpoints expose `TraderDecisionSummaryRead` (`recommendation`, `confidence`, `reason`, `opportunity_score`, `risk_label`). Workspace exposes full `TraderDecisionRead.reasoning` (all lines).

## Legacy Persisted Signals

`GET /api/v1/signals/latest` returns rows from the `trading_signals` table.
Existing rows remain readable as **legacy strategy records** (`BUY` / `HOLD` /
`SELL`, confidence `0..1`). New canonical persistence may add
`strategy_version`, `threshold_version`, `action_taxonomy`,
`canonical_recommendation`, `signal_as_of`, `calculated_at`, and
`shared_decision_id`.

Terminal pages do **not** override the shared decision engine with persisted rows
for action badges. A prior row may support a **NEW** highlight only when all
identity fields are present, its strategy/threshold/taxonomy exactly match the
current canonical result, and `signal_as_of` equals that result's
`previous_session_date`. Mismatched or unversioned legacy rows are explicitly
not comparable and produce no transition claim.

The batch job hook lives at `backend/app/jobs/signals/generate_daily_signals.py`
and reports the current canonical strategy/threshold/taxonomy identity. The new
database columns are nullable so the migration does not invent identity for old
rows; when any identity field is supplied, the API contract requires the full set.

## Frontend Consumption

| Consumer | Data path | Decision resolver |
|----------|-----------|-------------------|
| Stock Explorer, Scanner, Watchlist | `useEnrichedUniverseIntelligence` → `GET /market/universe-rows` | `resolveTraderDecision()` |
| Signal Center | same universe rows | `resolveTraderDecision()` + `buildDecisionSupportingContext()` |
| Dashboard smart signals | `GET /market/universe-rows` (shared TanStack key `market-universe-rows`) | `mapUniverseRowsToSignalFeed()` → `resolveTraderDecision()` |
| Stock workspace | `GET /stock-details/.../decision-support` | Server `reasoning[]`; not the list summary |

Shared client module: `frontend/lib/market/trader-decision.ts`.

Row mapping: `frontend/lib/market/universe-row-mapper.ts` (`mapUniverseRowToListRow`).

`market-intelligence.ts` now builds chart/price context only. It does not
calculate action, RSI, risk or price levels; canonical backend fields drive badges.

## Surfaces Using The Shared Engine

- Stock Explorer (`/stocks`)
- Stock workspace decision rail (`/stocks/{exchange}/{symbol}`)
- Signal Center (`/signals`)
- Market Scanner (`/scanner`)
- Dashboard smart signal feed (`/`)

Scanner category rules are independent **filters** on the same universe; badges still use `trader_decision`.

## List `reason` Field

`build_trader_decision_summary()` sets `reason` from the engine's explicit
`primary_reason`, never from the last appended reasoning/constraint sentence.
The compact result also exposes `primary_reason_code`, stance, holder/non-holder
actions, evidence strength, data reliability, trading risk, and constraints.
Full ordered explanation remains available in workspace `decision-support`.

## Missing Data

Empty OHLCV produces no decision. Non-empty but limited, review-only, or
ineligible history produces a readable compatibility `WAIT` with explicit
eligibility/reliability reasons. The frontend uses unavailable `WAIT` only when
the backend result itself is absent.

See also: `backend/docs/stock_decision_support.md`, `backend/docs/frontend_localization.md`.
