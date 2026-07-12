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

**Cached foundation:** `MarketUniverseService.get_scored_universe()` loads price windows, resolves regime once, runs `build_scored_universe_rows()` (decision per stock), and stores Redis key `universe:scored:{exchange}`. Rebuild order after sync: dashboard overview → sectors → movers → **universe** (`market_cache_rebuild.py`).

```
daily_prices + daily_market_summaries
        ↓
compute_trader_decision_from_prices()   ← per stock
        ↓
build_trader_decision_summary()         ← list DTO (compact)
        ↓
Redis universe:scored:{exchange}
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

`GET /api/v1/signals/latest` returns rows from the `trading_signals` table. These are **legacy strategy records** (`BUY` / `HOLD` / `SELL` only, confidence `0..1`).

Terminal pages do **not** override the shared decision engine with persisted rows for action badges. `useEnrichedUniverseIntelligence` may attach persisted rows for **NEW** highlight logic on watchlists only.

The batch job hook lives at `backend/app/jobs/signals/generate_daily_signals.py` and is reserved for future persistence under strategy name `deterministic_trader_v1`.

## Frontend Consumption

| Consumer | Data path | Decision resolver |
|----------|-----------|-------------------|
| Stock Explorer, Scanner, Watchlist | `useEnrichedUniverseIntelligence` → `GET /market/universe-rows` | `resolveTraderDecision()` |
| Signal Center | same universe rows | `resolveTraderDecision()` + `buildDecisionSupportingContext()` |
| Dashboard smart signals | `GET /market/universe-rows` (shared TanStack key `market-universe-rows`) | `mapUniverseRowsToSignalFeed()` → `resolveTraderDecision()` |
| Stock workspace | `GET /stock-details/.../decision-support` | Server `reasoning[]`; not the list summary |

Shared client module: `frontend/lib/market/trader-decision.ts`.

Row mapping: `frontend/lib/market/universe-row-mapper.ts` (`mapUniverseRowToListRow`).

Client-side `generateSignal()` in `market-intelligence.ts` is legacy metadata only; it must not drive action badges.

## Surfaces Using The Shared Engine

- Stock Explorer (`/stocks`)
- Stock workspace decision rail (`/stocks/{exchange}/{symbol}`)
- Signal Center (`/signals`)
- Market Scanner (`/scanner`)
- Dashboard smart signal feed (`/`)

Scanner category rules are independent **filters** on the same universe; badges still use `trader_decision`.

## List `reason` Field (Presentation Caveat)

`build_trader_decision_summary()` sets `reason = decision.reasoning[-1]` — the **last** reasoning line only. Many `BUY` names that pass the same rule branch therefore share identical summary text (e.g. *"Uptrend with favorable opportunity and acceptable reward potential."*) even though earlier reasoning lines differ (trend, RSI, volume).

Full explanation lives in workspace `decision-support`. List UIs should use `technical_snapshot` + `buildDecisionSupportingContext()` for per-stock differentiation, or the summary builder should be extended to expose a richer compact reason.

## Missing Data

When OHLCV is insufficient, `trader_decision` is `null` and the frontend falls back to `WAIT` with an explicit unavailable reason.

See also: `backend/docs/stock_decision_support.md`, `backend/docs/frontend_localization.md`.
