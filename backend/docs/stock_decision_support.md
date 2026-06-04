# Stock Decision Support

Deterministic trader decision-support for the stock workspace. No AI/LLM is used; all outputs are formula-based and explainable.

## Endpoint

`GET /api/v1/stock-details/{exchange}/{symbol}/decision-support`

Example:

```http
GET /api/v1/stock-details/DSE/ACMEPL/decision-support
```

## Data Sources

- `stocks` — symbol, category, sector, market cap
- `daily_prices` — OHLCV window (up to 260 sessions)
- `shareholding_snapshots` — latest ownership snapshot (Phase 2 panel)
- `valuation_snapshots` — latest valuation snapshot (Phase 2 panel)
- `market_events`, `dividend_events`, `corporate_actions` — event timeline (Phase 2 panel)

## Phase 1 Outputs

- **Trader decision** — `BUY`, `HOLD`, `WAIT`, or `SELL` with confidence 0–100
- **Opportunity score** — weighted trend, momentum, volume, price position, risk adjustment
- **Risk score** — weighted volatility, category, liquidity, data quality, freshness
- **Price position** — distance to support/resistance and moving averages
- **Trade plan** — entry zone, stop loss, target zone, risk/reward
- **Liquidity analysis** — average volume, volume ratio, consistency label
- **Smart warnings** — deterministic warning cards with severity
- **Data freshness** — latest trade date, row count, stale/sparse flags

## Formula Weights

Configured in `backend/app/core/constants/trading_constants.py`.

Opportunity weights:

- Trend 28%
- Momentum 22%
- Volume 20%
- Price position 20%
- Risk adjustment 10%

Risk weights:

- Volatility 30%
- Category 20%
- Liquidity 25%
- Data quality 15%
- Stale/sparse data 10%

## Phase 2 Outputs

Included in the same API response without breaking Phase 1 fields:

- Pattern detections (top 10 rule-based patterns)
- Breakout analysis
- Ownership insights
- Valuation insights
- Event timeline

## Implementation Layout

- `backend/app/modules/stock_details/decision/technical.py` — indicators and support/resistance
- `backend/app/modules/stock_details/decision/scoring.py` — opportunity, risk, recommendation
- `backend/app/modules/stock_details/decision/trade_plan.py` — price position, liquidity, trade plan
- `backend/app/modules/stock_details/decision/warnings.py` — smart warnings
- `backend/app/modules/stock_details/decision/patterns.py` — pattern engine
- `backend/app/modules/stock_details/decision/breakout.py` — breakout analysis
- `backend/app/modules/stock_details/decision/engine.py` — shared orchestration entry point
- `backend/app/modules/stock_details/decision/summary.py` — compact summary builder
- `backend/app/modules/stock_details/stock_details_decision_service.py` — full workspace orchestration

## Shared Across Terminal Surfaces

The same engine powers:

- `GET /api/v1/market/price-windows` (`trader_decision` summary per stock)
- `GET /api/v1/signals/decisions/latest`
- `GET /api/v1/stock-details/{exchange}/{symbol}/decision-support`

List pages consume the summary; the stock workspace consumes the full payload. Both use the same recommendation lookback window configured in `trading_constants.py`.

See also: `backend/docs/signals.md`.

## Missing Data Behavior

- If the stock is not found → 404
- If OHLCV is empty → 404 with insufficient data message
- Missing ownership/valuation/events → corresponding response fields are `null` or empty arrays; warnings may note sparse context
