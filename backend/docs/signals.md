# Signals And Trader Decisions

This document describes how trading actions are produced and consumed across the platform.

## Single Source Of Truth

All user-facing **Action** badges (`BUY`, `HOLD`, `WAIT`, `SELL`) come from the shared deterministic decision engine:

- `backend/app/modules/stock_details/decision/engine.py` — orchestrates OHLCV analysis
- `backend/app/modules/stock_details/decision/scoring.py` — opportunity, risk, recommendation
- `backend/app/modules/stock_details/decision/summary.py` — compact summary DTO builder

The engine uses the most recent `DECISION_RECOMMENDATION_LOOKBACK` sessions (90 by default) so list and detail surfaces stay aligned.

The recommendation applies, in order: a global reward/risk gate, breakout-aware
near-resistance handling, a lower-high/lower-low structure cap, an
ex-date/anomalous-drop guard (suppresses false `SELL`s → `WAIT`), and a market
regime gate (bearish regime downgrades fresh `BUY` → `HOLD`). Confidence is a
reliability score with conflict penalties and liquidity/staleness caps. The
market regime is resolved identically for list and detail from
`daily_market_summaries` via `decision/market_regime.py`. See
`backend/docs/stock_decision_support.md` for the full model.

## Runtime API Surfaces

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/price-windows` | OHLCV window + embedded `trader_decision` per stock |
| `GET /api/v1/signals/decisions/latest` | Decision-only list for signal center / scanners |
| `GET /api/v1/stock-details/{exchange}/{symbol}/decision-support` | Full workspace decision payload |

## Legacy Persisted Signals

`GET /api/v1/signals/latest` returns rows from the `trading_signals` table. These are **legacy strategy records** (`BUY` / `HOLD` / `SELL` only, confidence `0..1`).

Frontend terminal pages no longer override the shared decision engine with persisted rows. The batch job hook lives at `backend/app/jobs/signals/generate_daily_signals.py` and is reserved for future persistence of engine output under strategy name `deterministic_trader_v1`.

Mapping when persisting engine output to legacy rows:

| Engine recommendation | Legacy `signal_type` |
|-----------------------|----------------------|
| `BUY` | `BUY` |
| `SELL` | `SELL` |
| `HOLD` | `HOLD` |
| `WAIT` | `HOLD` (with metadata noting the wait context) |

## Frontend Consumption

- `frontend/lib/market/trader-decision.ts` — `resolveTraderDecision()` used by explorer, scanner, signal center, and dashboard feed
- `frontend/features/market-dashboard/hooks/use-market-universe.ts` — loads price windows and attaches `traderDecision`
- Client-side `generateSignal()` in `market-intelligence.ts` remains for legacy metadata only; it must not drive action badges

## Surfaces Using The Shared Engine

- Stock Explorer (`/stocks`)
- Stock workspace decision rail (`/stocks/{exchange}/{symbol}`)
- Signal Center (`/signals`)
- Market Scanner (`/scanner`)
- Dashboard smart signal feed (`/dashboard`)

Scanner category rules are independent **filters** on the same universe; badges on scan results still use `trader_decision`. Scans read shared engine fields (`is_breakout`, `return_20d_percent`, turnover-based liquidity), apply a BDT turnover floor to every scan, and use confirmed-rebound rules (oversold **and** turning up) rather than bare RSI thresholds.

## Missing Data

When OHLCV is insufficient, `trader_decision` is `null` and the frontend falls back to `WAIT` with an explicit unavailable reason.
