# Market Terminal Intelligence Upgrade

## Purpose

This upgrade keeps the existing deterministic OHLCV workflow stable while exposing one shared trader decision engine across the terminal. All action badges (`BUY`, `HOLD`, `WAIT`, `SELL`) must come from that engine rather than client-side heuristics or legacy persisted rows.

## Trader Decision Engine (Primary)

Runtime surfaces consume live decisions from:

- `GET /api/v1/market/price-windows` — embeds `trader_decision` per stock
- `GET /api/v1/signals/decisions/latest` — decision-only list for signal/scanner pages
- `GET /api/v1/stock-details/{exchange}/{symbol}/decision-support` — full workspace payload

Implementation lives under `backend/app/modules/stock_details/decision/` with orchestration in `engine.py`.

Frontend pages resolve actions through `frontend/lib/market/trader-decision.ts` (`resolveTraderDecision`).

## Legacy Persisted Signals (Optional / Deprecated For UI)

`GET /api/v1/signals/latest` returns persisted rows from `trading_signals`. These use the legacy `BUY` / `HOLD` / `SELL` vocabulary and `0..1` confidence decimals.

Terminal UI no longer overrides the shared engine with persisted rows. The enrichment feature flag and `/signals/latest` client fetch were removed from `useMarketUniverse`.

Persisted rows remain available for external integrations and future batch persistence via `generate_daily_signals`.

## Feature Flags

Advanced chart overlays and advanced scanner groups are controlled from frontend configuration. Backend signal enrichment is no longer required for consistent action badges because price windows include `trader_decision`.

## Data Quality And Freshness

`PARTIAL` and `SUSPICIOUS` prices are treated as cautionary context rather than hard failures. The UI should surface this state in risk, freshness, and session labels while continuing to render available deterministic intelligence.

The workspace still uses daily synced data, not live streaming. Polling should be driven by the market session model and used conservatively. Manual refresh remains the primary way to invalidate cached market data after an ingestion sync or data correction.
