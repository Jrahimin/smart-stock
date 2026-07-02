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

- Volatility 25% (now also absorbs gap risk — frequency of >3% opening gaps)
- Category 20%
- Liquidity 20% (classified by BDT average daily turnover, not share count)
- Data quality 15%
- Stale/sparse data 10%
- Overextension 10% (return over 20 sessions and distance above SMA20)

## Phase 2 Outputs

Included in the same API response without breaking Phase 1 fields:

- Pattern detections (top 10 rule-based patterns)
- Breakout analysis
- Ownership insights
- Valuation insights
- Event timeline

## Accuracy Model (Decision Engine Overhaul)

All logic lives in the shared engine so every surface (workspace, universe lists,
scanner, signals) stays consistent. Behaviour is tunable via constants.

Technical foundation (`technical.py`):

- **RSI** uses Wilder smoothing and returns a neutral `50` on a flat series
  (previously reported `100`, mislabelling dormant/floor names as overbought).
- **Trend** is structural: price vs `SMA20`/`SMA50` (or a rising/falling `SMA20`
  slope on shorter history). It no longer flips on a single red session.
- **Support/resistance** come from confirmed swing points (excluding the most
  recent bars), falling back to the 20-day Donchian extremes. `is_breakout`
  flags a close above prior resistance on volume ≥ expansion ratio.
- New snapshot fields (all optional, backward compatible with cached rows):
  `sma50`, `atr14`, `average_turnover`, `return_5d_percent`, `return_20d_percent`,
  `is_breakout`, `structure` (higher-high/lower-low), `gap_frequency_percent`.

Recommendation & confidence (`scoring.py`):

- **Global R/R gate** — a fresh `BUY` with reward/risk below the minimum is
  downgraded to `HOLD` everywhere (bypassed only by a confirmed breakout).
- **Breakout-aware** — a confirmed breakout is treated as strength, not a
  near-resistance caution.
- **Multi-day momentum** — blends RSI with 5/20-session returns.
- **Structure coherence** — a lower-high/lower-low structure caps a fresh `BUY`
  at `HOLD`.
- **Confidence v2** — reliability, not restated bullishness: conflicting pillars
  subtract, and illiquid/thin/stale contexts cap the value.

Trade plan (`trade_plan.py`):

- Stop is the closer of a structural stop (below support) and an ATR-based stop,
  then hard-capped so risk never exceeds `TRADE_PLAN_MAX_RISK_PERCENT`.
- Liquidity is labelled from BDT average daily turnover.

Corporate actions & regime:

- **Ex-date/anomalous-drop guard** (`engine.py`) — a >12% one-session drop that
  is not part of an existing downtrend (or that lands on a known ex-dividend
  date) suppresses the false `SELL`, emitting `WAIT` + a `possible_corporate_action`
  warning instead.
- **Market regime** (`market_regime.py`) — BULLISH/NEUTRAL/BEARISH from the
  benchmark index trend and breadth; a bearish regime downgrades fresh `BUY` to
  `HOLD` and caps confidence. Resolved identically in the universe and workspace
  paths.

## Implementation Layout

- `backend/app/modules/stock_details/decision/technical.py` — indicators, swing points, support/resistance, structure
- `backend/app/modules/stock_details/decision/scoring.py` — opportunity, risk, recommendation, confidence
- `backend/app/modules/stock_details/decision/trade_plan.py` — price position, liquidity, trade plan
- `backend/app/modules/stock_details/decision/warnings.py` — smart warnings
- `backend/app/modules/stock_details/decision/patterns.py` — pattern engine (validity filters + evidence-based confidence)
- `backend/app/modules/stock_details/decision/breakout.py` — breakout analysis
- `backend/app/modules/stock_details/decision/market_regime.py` — shared market regime classifier
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
