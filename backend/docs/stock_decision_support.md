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

## Current Outputs

- **Canonical decision identity** — `strategy_version`, `threshold_version`,
  `action_taxonomy=TRADER_DECISION_V2`, `decision_taxonomy_version=v2`,
  exchange/session `as_of_date`, `previous_session_date`,
  `calculated_at`, deterministic `shared_decision_id`, `input_schema_version`,
  `data_revision`, `event_revision`, `input_hash`, replay status/limitations,
  result semantics, primary reason, contextual actions, eligibility, ordered
  blocker codes, opportunity quality, entry readiness/timing, regime result,
  and plan status.
- **Technical snapshot** — the same authoritative scalar technical projection
  supplied to universe/list consumers; clients use raw candles only for charts.
- **Trader decision** — internal compatibility `recommendation` plus an explicit
  public `display_action` (`POTENTIAL_BUY`, `WAIT`, or `SELL`), entry timing and
  condition, portfolio-neutral `stance`, contextual holder/non-holder actions,
  an explicit `primary_reason`, and authoritative constraints.
- **Evidence strength** — direction-aware technical agreement and coverage. The
  legacy `confidence` field remains equal-valued and tagged
  `confidence_semantics=HEURISTIC_EVIDENCE`; neither value is probability.
- **Directional evidence** — a small trend, multi-session momentum, and current
  level-event result with separate bullish/bearish values.
- **Data reliability** — freshness, valid-history coverage, source/window
  quality, atomic-row validity, and corporate-action resolution.
- **Trading risk** — volatility/gap, category, and overextension only.
- **Opportunity score** — backward-compatible long-setup composite, paired with
  typed `WEAK` / `CONSTRUCTIVE` / `STRONG` completed-session quality.
- **Risk score** — backward-compatible legacy composite; new decisions use the
  separate `trading_risk`, `liquidity`, and `data_reliability` results.
- **Price position** — distance to support/resistance and moving averages
- **Trade plan** — entry zone, structural invalidation, optional target zone,
  conservative risk/reward, `READY` / `PULLBACK` / `BREAKOUT` / `CONTINUATION`
  timing, readiness, condition/confirmation/expiry fields, management mode,
  `status`, and machine-readable `reasons`.
- **Liquidity analysis** — robust traded-session volume baseline, median turnover, provenance, coverage, and label
- **Eligibility** — `ELIGIBLE`, `LIMITED`, `REVIEW_ONLY`, or `INELIGIBLE` with machine-readable reasons
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

Phase 3 directional-evidence weights:

- Trend 50%
- Multi-session analytical return 30%
- Current structural level event 20%

Phase 3 trading-risk weights:

- Analytical volatility and gap frequency 55%
- Effective stock category 25%
- Overextension 20%

The opportunity and risk weights above remain compatibility projections. They
are not reused as the canonical evidence-strength or trading-risk formulas.

## Additional Detail Outputs

Included in the same API response without breaking Phase 1 fields:

- Pattern detections (top 3 rule-based patterns) with `pattern_match_score`; legacy `confidence` remains as an equal-valued compatibility field
- Breakout analysis with `evidence_score`; legacy `probability` remains as an equal-valued compatibility field
- Ownership insights
- Valuation insights
- Event timeline

## Result Semantics And Phase 1 Correctness

- Prices below support receive the below-support penalty before the near-support band is considered. The near-support band is inclusive from `0%` through `3%` above support.
- A fresh `BUY` requires `trade_plan.status=VALID_ENTRY_PLAN`. Breakouts cannot bypass an unavailable or watch-only plan.
- A structural stop is not moved above the invalidation level to satisfy the maximum-risk policy. Excess structural risk produces `WATCH_ONLY`.
- Populated entry plans enforce `0 < stop < entry_low <= entry_high < target_low <= target_high` and positive conservative reward/risk.
- Flags and triangles remain `Forming` until price crosses a pre-trigger boundary with volume confirmation. A symmetrical triangle remains neutral until an upside or downside trigger.
- Pattern match and breakout evidence values are deterministic point scores, not calibrated confidence or probability.

## Decision Model Evolution Phase 2 — Conditional Opportunity

Phase 2 is additive and keeps `TraderRecommendation.BUY` as the internal
compatibility action. Phase 3 now projects it through the public taxonomy below.
The canonical result and compact decision summaries now expose:

- `opportunity_quality`: completed-session `WEAK`, `CONSTRUCTIVE`, or `STRONG`;
- `entry_readiness`: `NOT_READY`, `CONDITIONAL`, or `READY`;
- `entry_timing`: `READY`, `PULLBACK`, `BREAKOUT`, `CONTINUATION`, or `null`;
- ordered `blocker_codes`; and
- one capped regime result: score, label, phase, and confidence.

Only a strong bullish completed-session opportunity with a valid condition and
invalidation can retain the internal `BUY`. Strong evidence without a safe plan
is `WAIT`. Data eligibility, corporate-action uncertainty, liquidity, high or
speculative trading risk, extension, structure, and invalidation remain
authoritative.

Plan policies:

- `READY` means the completed-session entry range is currently actionable.
- `PULLBACK` requires a precise support or moving-average zone and expiry.
- `BREAKOUT` requires a completed-session close/participation confirmation,
  trigger, invalidation, objective/management rule, and expiry.
- `CONTINUATION` is deliberately narrow: a completed breakout in price discovery
  with no reliable overhead resistance. It uses structural/ATR invalidation,
  trailing management, and a reassessment stop. It never fabricates a fixed
  reward ratio.

`STRUCTURAL`, `ATR_PROJECTION`, `MEASURED_MOVE`, and `TRAILING` are the supported
management modes. The initial implementation uses structural targets for ready
and pullback plans, an ATR projection for breakout when ATR is available (with
measured-move fallback), and trailing management for target-less continuation.

## Decision Model Evolution Phase 3 — Public Taxonomy And Replay

Phase 3 separates engine state from trader-facing language. New canonical
results use `TRADER_DECISION_V2` / `decision_taxonomy_version=v2`, retain
`recommendation` and `internal_action` for deterministic compatibility, and
expose `display_action` as the only public action source.

`POTENTIAL_BUY` is fail-closed. It requires all of the following from the same
completed session: internal `BUY`, `STRONG` opportunity quality,
`READY`/`CONDITIONAL` readiness, one of the four typed entry timings, a valid
entry plan, and a non-empty actionable condition. Any incomplete or legacy
combination renders `WAIT`; internal `SELL` renders `SELL`. Generic screens do
not render `HOLD`. The stock detail, Explorer, Scanner, Signals, Dashboard,
Market Pulse, and non-holder Watchlist projections all use this mapping and
show the entry condition within their existing UI structures.

Holdings remain contextual: a canonical holder `HOLD` renders `HOLD`, `REVIEW`
renders `WAIT`, and `SELL`/`REDUCE` renders `SELL`. This prevents a neutral
non-holder watchlist item from looking like portfolio advice while preserving
meaningful holder guidance.

The v2 taxonomy is part of canonical shared identity, Redis keys/envelopes,
Pulse comparison identity, immutable snapshot payloads, monitoring, and replay
manifests. Prior v1 identities and persisted records remain readable and
unchanged, but are not compared or relabeled as v2. Phase 3 requires no database
migration because the additive fields live in existing versioned payloads.

Replay now treats each timing as an execution policy: `READY` and
`CONTINUATION` fill at the next eligible session; `PULLBACK` waits for its zone;
`BREAKOUT` waits for completed close-and-volume confirmation and then fills on
the following session. Conditional plans can expire or invalidate without an
entry. Results cover 3, 5, 10, and 20 sessions and report timing, regime, and
liquidity cohorts with activation, expectancy, MFE/MAE, and false-breakout
diagnostics.

## Trading-Intelligence Decision Coherence

Decision precedence is fixed and explicit:

1. data eligibility and unresolved-event blocks;
2. reliable support-break / bearish evidence;
3. trading-risk and tradability blocks;
4. directional evidence;
5. fresh-entry plan feasibility;
6. contextual holder/non-holder projection.

Context mapping:

| Canonical state | Non-holder | Holder | Compatibility recommendation |
|---|---|---|---|
| Eligible bullish evidence + valid plan + no veto | `POTENTIAL_BUY` | `HOLD` | `BUY` |
| Constructive but plan/downgrade constrained | `WAIT` | `HOLD` | `HOLD` |
| Mixed/no directional edge | `WAIT` | `HOLD` | `WAIT` |
| High/speculative risk or illiquid without bearish evidence | `WAIT` | `WAIT` | `WAIT` |
| Eligible support break or coherent bearish trend/momentum | `SELL` | `SELL` | `SELL` |
| Unreliable/ineligible/unresolved data | `WAIT` | `WAIT` | `WAIT` |

`SELL` is never inferred from risk alone. Each decision stores its primary
reason separately, so compact-list reasoning cannot be replaced by a later
evidence cap or warning sentence. Warnings render the pre-decision constraint
set; unvalidated chart patterns remain secondary warnings and cannot change the
core action or create a critical post-decision contradiction.

## Phase 4 Decision Ownership

`StrategyInput` is the explicit boundary for the decision engine. Universe and
stock detail both build it through `decision/canonical.py`, using the full
corporate-action date set and the same exchange-session, regime and OHLCV
semantics. `CanonicalDecisionResult` is embedded additively while the original
decision fields remain readable.

For a stock/session/strategy/threshold identity, list and detail expose the same
core recommendation, contextual actions, evidence/risk/plan status, primary
reason and `shared_decision_id`. `calculated_at` is observational metadata and
does not participate in identity. Price/event/context content does: a corrected
input changes its revision hash, `input_hash`, and `shared_decision_id` even on
the same market session. Watchlists reuse the universe projection;
when it is unavailable they return an unavailable `WAIT`, not a local fallback
calculation.

The frontend may derive candle geometry for display, but client RSI, risk,
levels or signal heuristics cannot drive action badges.

## Phase 7 Audit Persistence

Every successful scored-universe rebuild appends missing results to
`canonical_decision_snapshots`, keyed immutably by `shared_decision_id`. The row
stores the full compact canonical result and its data/event/input revisions.
Existing rows are never updated in place; a source correction creates a new
identity. Snapshots intentionally do not archive all raw OHLCV/status rows, so
they report `IDENTIFIED_WITH_LIMITATIONS` and name the missing raw-input and
effective-dated status lineage. Replay manifests provide dataset-level
reproduction checks for formal backtests.

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
- OHLC rows are validated atomically before aligned high/low/close arrays are
  built. Volatility comes from analytical close-to-close returns even when
  persisted `price_change_percent` is null. `atr14` is Wilder-smoothed ATR14.
- Relative-volume baselines use the median of prior traded sessions and exclude
  the current bar. Liquidity includes median turnover, observation count, and
  `REPORTED`/`ESTIMATED`/`MIXED`/`UNKNOWN` provenance.

Recommendation & heuristic evidence (`scoring.py`):

- **Global plan gate** — every fresh `BUY` requires a valid ordered entry plan;
  no breakout bypass is allowed.
- **Breakout-aware** — a confirmed breakout is treated as strength, not a
  near-resistance caution.
- **Multi-day momentum** — blends RSI with 5/20-session returns.
- **Structure coherence** — a lower-high/lower-low structure caps a fresh `BUY`
  at `HOLD`.
- **Legacy confidence compatibility** — `confidence` now projects the same
  direction-aware evidence-strength value. Reliability and liquidity are shown
  separately rather than being hidden confidence caps.

Trade plan (`trade_plan.py`):

- Support defines structural invalidation. When structural risk exceeds
  `TRADE_PLAN_MAX_RISK_PERCENT`, the plan becomes `WATCH_ONLY`; the stop is not
  rewritten to make the setup look feasible.
- Missing or already-broken overhead resistance produces a target-less
  `WATCH_ONLY` plan; the engine no longer fabricates a fallback target.
- Liquidity is labelled from BDT median traded-session turnover.

Data eligibility, corporate actions & regime:

- **Eligibility gate** (`data_eligibility.py`) — a fresh decision requires at
  least 50 valid OHLC rows, at least 70% traded-session coverage, a current
  exchange session, acceptable window quality, non-zero latest volume, and a
  usable median-turnover baseline. These are conservative starting hypotheses
  pending historical calibration.
- **Official-session staleness** counts later exchange trade dates, not calendar
  days, so weekends and closures do not create false stale flags.
- **Corporate-action guard** — detail and universe load the same dividend
  ex-dates and corporate-action effective dates. No verified adjustment-factor
  source is available, so known unadjusted events and unexplained large
  discontinuities become `REVIEW_ONLY`/`WAIT`; factors are never inferred. A
  continued genuine downtrend/crash is not reclassified as an adjustment.
- **Market regime** (`market_regime.py`) — BULLISH/NEUTRAL/BEARISH from the
  benchmark index trend and breadth, returned as one score/label/phase/confidence
  result. It may block an otherwise valid breakout/continuation policy but
  cannot bypass a stock-level safeguard or fabricate bearish stock evidence.
  Resolved identically in universe, workspace, and replay paths.

## Implementation Layout

- `backend/app/modules/stock_details/decision/technical.py` — indicators, swing points, support/resistance, structure
- `backend/app/modules/stock_details/decision/data_eligibility.py` — exchange-session, quality, liquidity provenance, and event safeguards
- `backend/app/modules/stock_details/decision/evidence.py` — directional evidence, evidence strength, and data reliability
- `backend/app/modules/stock_details/decision/risk.py` — trading risk only
- `backend/app/modules/stock_details/decision/constraints.py` — authoritative entry/exit/downgrade constraints
- `backend/app/modules/stock_details/decision/recommendation.py` — contextual action matrix and primary reason
- `backend/app/modules/stock_details/decision/scoring.py` — compatibility opportunity/risk projections and entry point
- `backend/app/modules/stock_details/decision/conditional_opportunity.py` — typed quality and readiness policy
- `backend/app/modules/stock_details/decision/trade_plan.py` — price position, liquidity, trade plan
- `backend/app/modules/stock_details/decision/warnings.py` — smart warnings
- `backend/app/modules/stock_details/decision/patterns.py` — pattern engine (validity filters + heuristic match score)
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
- Non-empty but limited/unreliable histories return a readable decision bundle
  with eligibility reasons and a compatibility `WAIT`.
