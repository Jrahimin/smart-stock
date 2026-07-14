# StockWealth BD Trading Intelligence Audit and Refinement Plan

**Audit date:** 2026-07-14  
**Scope:** deterministic stock decisions, technical features, opportunity/risk/evidence scores, trade plans, warnings, chart patterns, breakout analysis, market regime, Market Pulse, scanner, and their data/ownership foundations.  
**Change boundary:** audit and implementation plan only. No production behavior was changed.

## Audit method and evidence standard

This audit traced the implemented data path rather than assessing formulas in isolation. It began with the product and architecture rules, then the market-data and stock-detail ingestion contracts, then the decision engine and every material consumer. Repository-wide searches covered action labels, recommendation, confidence, opportunity, risk, trend, momentum, volume, support/resistance, breakout/breakdown, trade-plan fields, Pulse, focus labels, scanner conditions, persisted signals, and client-side fallbacks.

Verdicts use the following meanings:

| Verdict | Meaning |
|---|---|
| Sound mathematics | The formula is internally correct for the stated definition. This does not establish predictive value. |
| Textbook convention | A recognized definition or conventional parameter, still strategy- and market-dependent. |
| Reasonable heuristic | Coherent and explainable, but not mathematically necessary and not yet validated for DSE/CSE. |
| Arbitrary / uncalibrated | A discretionary breakpoint, weight, or transformation without repository evidence of historical calibration. |
| Implementation error | Code does not implement its own intended meaning or contains an unreachable/incorrect branch. |
| Materially misleading | The label or downstream interpretation claims more than the calculation supports. |
| DSE-specific hypothesis | A plausible Bangladesh-market adaptation that requires point-in-time local testing. |
| Dynamic input | A value that should be effective-dated, session-aware, cross-sectionally calibrated, or position-size-aware rather than permanently hard-coded. |

Important reference points:

- Wilder RSI conventionally uses a 14-period smoothed gain/loss calculation; 30/70 are traditional interpretation levels, not proof of return predictability. [Fidelity RSI guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI)
- The implemented EMA seed and recursive update match the conventional EMA construction. [Fidelity EMA guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema)
- True range correctly includes gaps, while Wilder ATR initializes with an average and then applies recursive smoothing. [StockCharts ATR reference](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr-and-average-true-range-percent-atrp)
- Higher highs/higher lows and lower highs/lower lows are conventional trend-structure descriptions, not standalone forecasts. [Fidelity trend reference](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/basic-concepts-trend)
- Corporate actions create discontinuities; adjusted series are ordinarily used for return calculations, backtesting, and technical analysis, while raw prices remain useful for actual traded-price and event views. [LSEG corporate-actions guide](https://developers.lseg.com/en/article-catalog/article/workspace-corporate-actions-content-set-guide)
- Simple chart-pattern recognition can be formalized, but evidence in one market/sample does not validate this repository's simplified detectors or DSE applicability. [Lo, Mamaysky, and Wang, 2000](https://business.columbia.edu/sites/default/files-efs/pubfiles/19268/Lo-Mamaysky_wang_foundations.pdf)
- Selecting among many technical rules creates data-snooping risk. [Sullivan, Timmermann, and White, 1999](https://ideas.repec.org/a/bla/jfinan/v54y1999i5p1647-1691.html)
- Rolling/walk-forward testing, look-ahead and survivorship controls, sensitivity analysis, and regime analysis are baseline validation practices. [CFA Institute backtesting and simulation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/backtesting-and-simulation) and [Investment Model Validation](https://rpc.cfainstitute.org/research/foundation/2024/investment-model-validation)
- A number is a probability only when tied to a defined event and empirically calibrated; reliability diagrams compare predicted values with observed frequencies. [Scikit-learn probability-calibration guide](https://scikit-learn.org/stable/modules/calibration.html)
- Daily turnover is useful but incomplete as a liquidity proxy. Amihud's daily absolute-return/dollar-volume ratio is explicitly a rough price-impact measure; spreads and transaction data are finer measures. [Amihud, 2002](https://www.sciencedirect.com/science/article/abs/pii/S1386418101000246)
- Bangladesh rules are effective-dated and change. BSEC's current law index includes a 1 July 2026 market-control order and category/circuit directives. [BSEC laws index](https://sec.gov.bd/home/laws) CSE also publishes instrument price limits and current circuit information. [CSE price-limit description](https://www.cse.com.bd/trading/price_limit) and [daily circuit table](https://www.cse.com.bd/market/circuit_breaker)
- CSE itself uses traded-day coverage, free float, category, and suspension/non-trading criteria in an index eligibility context. That does not prescribe a trading strategy, but it supports treating these as first-class Bangladesh-market eligibility fields. [CSE index criteria](https://www.cse.com.bd/market/sectorindexdata)

## 1. Executive assessment

### Maturity

**Overall maturity: Early deterministic.**

The engine is beyond an experiment: it has typed domain results, pure calculation functions, a mostly shared server-side decision path, centralized constants, explicit explanations, data-quality flags, a market-regime gate, liquidity/risk concepts, and deterministic tests. Those are valuable foundations.

It is not yet **Trader-useful** as a consistently dependable decision layer, because several reachable outputs are mathematically contradictory or materially overstate what was computed. It is not **Professionally defensible** because there is no point-in-time historical validation framework, no strategy/calculation version on outputs, no calibrated interpretation of confidence/probability, incomplete corporate-action handling, and incomplete data/liquidity eligibility.

### Strongest areas

- Backend RSI uses Wilder smoothing and explicitly handles flat, all-gain, and all-loss edge meanings coherently.
- SMA and EMA formulas are mathematically sound; ascending date sorting is consistently attempted before calculation.
- True range includes overnight gaps, a necessary feature for DSE circuit/gap risk.
- The trend rule does not flip on one daily return; it uses price/SMA ordering and a short-history slope fallback.
- Opportunity and risk component weights each sum to 1.00, are centrally visible, and produce bounded deterministic outputs.
- The primary universe, signal-center badges, dashboard signal badges, scanner badges, and normal watchlist path consume the backend decision summary rather than independently inventing an action.
- Current-volume baselines in the backend exclude the latest session, avoiding self-dilution.
- The engine includes explicit sparse/stale states, liquidity labels, category risk, gap frequency, bearish-regime controls, and critical warning severities.
- List payloads avoid serializing full OHLCV/pattern state, which is a sound architecture and performance boundary.

### Most serious weaknesses

1. **The price-position score rewards prices below support.** A negative support distance satisfies “less than or equal to 3%” before the below-support branch, making that branch unreachable.
2. **“Confidence” is neither directionally correct nor empirically calibrated.** It largely reweights bullish opportunity pillars even for SELL and calls the result reliability.
3. **Breakout “probability” and pattern “confidence” are arbitrary point totals.** Several detectors mark a pattern Active without a price trigger; a neutral symmetrical triangle is mechanically converted into a bearish measured move.
4. **Trade plans can be semantically invalid.** Stops may be moved above structural invalidation to satisfy a risk cap, targets/zones are not invariant-checked, plans are emitted for WAIT/SELL, and BUY can bypass feasibility when reward/risk is missing or a breakout flag is set.
5. **Corporate-action-adjusted history is not implemented.** The adjusted-close column is populated as null by current sources; historical backfill can persist null daily changes, which makes volatility unavailable despite valid closes. The ex-date guard is not supplied to the universe path.
6. **Market Pulse contains materially misleading aggregation.** “Opportunity history” mixes transformed index returns with a current selected-stock Pulse average; “money flow” is average price change and can fabricate a +0.1 inflow and -0.1 outflow when neither exists.
7. **Eligibility is too weak for Bangladesh-market conditions.** Raw row count substitutes for traded-session coverage; zero-volume/stale/partial/suspicious histories and approximate turnover can still influence rankings; suspension, current category effectiveness, free float, and circuit state are absent.
8. **Warnings do not own vetoes.** Patterns and critical warnings are computed after the recommendation, so a BUY can coexist with a confirmed bearish-pattern critical warning.
9. **Duplicate paths remain.** Watchlist fallback recomputes without regime/ex-dates, the legacy frontend calculates different RSI/risk/support/resistance/BUY/SELL/HOLD metadata, and persisted signals can disagree with live decisions.
10. **There is no backtesting implementation.** The backtesting module is only a reserved README, so thresholds, rankings, confidence, trade plans, and predictive language have no repository evidence.

### Defensibility of current outputs

The outputs are defensible only as **experimental deterministic screening cues with explicit limitations**, not as validated trading recommendations, probabilities, safety assessments, expected returns, or reliable targets. The deterministic architecture is defensible; several current meanings are not.

Certainty is most overstated by:

- breakout/breakdown “probability”;
- decision and pattern “confidence”;
- “confirmed” or “Active” pattern states without trigger completion;
- “Accumulation,” “money flow,” and institutional-participation narratives inferred from daily volume/price only;
- target and expected-return language around heuristic resistance/measured moves;
- scanner “confirmed rebound” and “high-conviction” wording;
- Market Pulse “opportunity environment/history” and “sector rotation” claims.

### Minimum work before stronger product claims

Before stronger claims, complete Phase 0 correctness fixes, establish canonical point-in-time inputs and ownership, introduce data/liquidity eligibility and trade-plan invariants, rename uncalibrated probability/confidence outputs, and pass deterministic cross-surface regression tests. Before any predictive claim, complete a reproducible walk-forward backtest on point-in-time DSE/CSE data with corporate actions, delistings/suspensions, realistic execution, costs, non-trading, liquidity buckets, regime splits, sensitivity analysis, and held-out calibration.

## 2. Current decision-flow map

### Real primary flow

~~~mermaid
flowchart LR
    A["daily_prices: mixed live, DSE archive, per-stock backfill"] --> B["build_technical_snapshot()"]
    M["daily_market_summaries"] --> R["resolve_regime_from_summaries()"]
    B --> L["compute_liquidity()"]
    B --> K["compute_risk_score()"]
    L --> K
    B --> O["compute_opportunity_score()"]
    K --> O
    B --> T["compute_trade_plan()"]
    O --> D["compute_recommendation()"]
    K --> D
    T --> D
    R --> D
    D --> C["compute_decision_confidence()"]
    C --> S["build_trader_decision_summary()"]
    S --> U["market_universe scored cache"]
    U --> SG["Signals / Dashboard / Explorer / Watchlist preferred path"]
    U --> P["compute_pulse_score() and Pulse briefing"]
    U --> SC["Frontend scanner filters"]

    B --> PT["detect_patterns()"]
    PT --> BO["analyze_breakout()"]
    PT --> W["generate_warnings()"]
    O --> W
    K --> W
~~~

### Function/file trace

| Stage | Actual owner and function | Important input semantics | Output / consumers |
|---|---|---|---|
| Ingestion | backend/app/modules/market_data/market_data_service.py, _prepare_daily_price_values(); stock_details_service.py, _persist_daily_prices() | Live source supplies YCP/change; historical per-stock source stores raw close, null adjusted close/change, and close × volume turnover | daily_prices |
| Window load | market_data_repository.py, list_market_price_windows(); stock_details_repository.py, list_daily_prices_window() | Universe and engine recommendation window are 90 rows; detail repository may load up to 260 for patterns/chart | Technical and pattern paths |
| Technicals | stock_details/decision/technical.py, build_technical_snapshot() | Raw OHLCV; latest quality only; sorted dates; zero-volume sessions retained | TechnicalSnapshot |
| Regime | stock_details/decision/market_regime.py, resolve_regime_from_summaries() | Latest selected index summary plus up-to-50 close average and one-session breadth | BULLISH/NEUTRAL/BEARISH |
| Liquidity | trade_plan.py, compute_liquidity() | Mean 20-session turnover or share-volume fallback | Liquidity label and “consistency” score |
| Risk | scoring.py, compute_risk_score() | Volatility, category, liquidity, latest quality, stale/sparse, overextension, gap frequency | 0–100 risk + label |
| Opportunity | scoring.py, compute_opportunity_score() | Trend, RSI/returns, volume, support/resistance, and inverse risk | 0–100 opportunity |
| Trade plan | trade_plan.py, compute_trade_plan() | Current/support/SMA/ATR/volatility/resistance | Entry/stop/target/reward-risk for every decision |
| Recommendation | scoring.py, compute_recommendation() | Opportunity, risk, trend, support/resistance, trade-plan R/R, regime, suspected adjustment | BUY/HOLD/WAIT/SELL |
| Evidence value | scoring.py, compute_decision_confidence() | Reuses opportunity pillars, inverse risk, simple data value, conflict penalties/caps | 0–100 “confidence” |
| List summary | decision/summary.py, build_trader_decision_summary() | Selects reasoning[-1], which can be a cap message rather than decision rationale | Universe/list APIs |
| Patterns | decision/patterns.py, detect_patterns() | Up to full detail history; simplified swing/slice rules | Detail only, top 3 returned despite docs saying top 10 |
| Breakout panel | decision/breakout.py, analyze_breakout() | Four booleans plus pattern points | Detail “probability,” trigger and projected target |
| Warnings | decision/warnings.py, generate_warnings() | Computed after recommendation; primary returned pattern only | Detail only; no decision override |
| Universe | market_universe_compute.py, build_scored_universe_rows(); market_universe_service.py | First 500 active symbols in sort order, 90 rows each, shared regime, no ex-date set | Canonical list cache |
| Pulse rank | market_pulse/pulse_score.py, compute_pulse_score() | Technical snapshot + decision; repeated/correlated trend/momentum/risk inputs | Attention score |
| Pulse selection | market_pulse_service.py, _diversify_focus_list() | Threshold 60; score-only sort; soft/ineffective sector cap | Focus/monitor lists |
| Pulse briefing | market_pulse_briefing.py, build_market_briefing() | Aggregates potentially stale/ineligible universe rows; mixed metric history | Market story/state/money flow/opportunity/playbook |
| Scanner | frontend/features/scanner/scanner-workspace-view.tsx | Client filters over first 500 universe rows; duplicated liquidity floors | Scanner categories; badges remain backend decisions |

### Alternate and legacy paths

| Path | Current behavior | Classification |
|---|---|---|
| Watchlist backend fallback: watchlists_service.py → build_technical_snapshot() → compute_trader_decision_summary_for_stock() | Recomputes the engine without market regime and without ex-date data; frontend uses it only when universe intelligence is unavailable | **Divergence risk / actual alternate computation** |
| Detail path: stock_details_decision_service.py | Same engine and regime formula, but supplies known dividend ex-dates that universe/list does not | **Actual input divergence** |
| Deprecated market price windows | Embeds decisions looked up from universe while OHLCV rows may be selected with a different exchange scope and caller-specified window | **Legacy contract risk** |
| frontend/lib/market/market-intelligence.ts | Computes simple-window RSI, client risk, Donchian levels, and legacy BUY/HOLD/SELL metadata; flat RSI becomes 100 | **Actual different formulas, intended fallback/metadata only** |
| Persisted trading_signals | Arbitrary strategy rows with BUY/HOLD/SELL and 0–1 confidence; latest active selection is not a canonical live strategy | **Historical/legacy record, not compatible live decision** |
| Chart markers in chart-intelligence.ts | Presentation markers use 60-bar average volume and separate support/resistance tests | **Legitimate presentation annotation if clearly non-authoritative** |
| Dashboard market mood | Separate broad-market presentation heuristic; does not call decision engine | **Legitimate module-specific concept, but “Accumulation” wording is too strong** |
| Signal Center sort helpers in trader-decision.ts | Client invents risk-adjusted and volume-confirmation ranking scores from confidence | **Presentation-only derivation with divergence/meaning risk** |

## 3. Decision-ownership map

| Analytical concept | Intended authoritative owner | Current locations | Main consumers | Duplicate implementation/status | Current inconsistency risk | Recommended ownership and action |
|---|---|---|---|---|---|---|
| BUY/HOLD/WAIT/SELL | decision/scoring.py, compute_recommendation() orchestrated by engine.py | Canonical backend; watchlist fallback; legacy client generateSignal(); persisted trading_signals | Detail, universe, signals, dashboard, scanner, watchlist | Same concept is calculated differently in multiple places | **High** | Keep engine recommendation canonical; add holder/non-holder context fields; make watchlist read universe result; quarantine client signal as chart-only; version persisted historical signals |
| Opportunity score | scoring.py | Backend only; related-stocks uses separate threshold 60; Pulse briefing creates another “opportunity score” | Detail, lists, related stocks, Pulse | Pulse’s market “opportunity” is a different and mixed construct with the same name | **Critical terminology/metric collision** | Reserve stock opportunity for scoring.py; rename/rebuild Pulse environment measure with its own definition/history |
| Risk score/label | scoring.py | Backend canonical; legacy client inferRisk(); scanner treats high risk as breakdown; Signal Center subtracts local penalties | All surfaces | Backend output reused, but meanings transformed client-side | **High** | Canonical risk remains backend; scanner conditions must use explicit risk or breakdown predicates; presentation sorts must be named local ranks or moved server-side |
| Decision evidence/confidence | scoring.py | Backend; pattern confidence; breakout probability; persisted confidence; client confidence/ranks | All | Four incompatible scales/meanings | **Critical** | Rename live value to evidence_strength until calibrated; pattern_match_score and breakout_evidence_score; persisted strategy fields versioned and namespaced |
| Trend | technical.py, infer_trend() | Backend; legacy client inferTrend(); dashboard/Pulse market mood use other trend concepts | Lists/detail/scanner/Pulse | Client short-history rule omits SMA slope and can differ | **Medium/high** | Backend stock trend authoritative; broad market/sector trend remain module-specific with explicit names |
| Momentum | scoring.py component plus snapshot returns/RSI | Pulse recombines RSI, daily return, and trend; UI labels recommendation as momentum | Pulse, scanner, Signal Center | Overlapping constructs, not shared definitions | **High** | Keep raw RSI/returns canonical; define named stock_momentum_evidence once if reused; do not equate action with momentum |
| Volume spike/relative volume | technical snapshot baseline | scoring.py, patterns.py, breakout.py, Pulse, client markers/helpers | All | Mostly same 1.8 threshold, but baselines differ (20 excluding latest, 20 including latest, 60 including current) | **High** | Canonical RelativeVolumeResult with baseline type, traded-session count, robust statistic, and as-of date; chart markers may use a distinct labeled chart baseline |
| Liquidity | trade_plan.py | Backend turnover classification; scanner duplicates 2m/50k floors; client risk uses volume only | Risk, scanner, Pulse | Duplicated thresholds and incomplete eligibility | **High** | Canonical LiquidityProfile + EligibilityResult on server; scanner consumes eligibility instead of magic constants |
| Support/resistance | technical.py, resolve_levels() | Legacy client Donchian; chart markers consume backend level | Detail/list/scanner/chart | Different formulas in fallback | **Medium/high** | Backend structural levels authoritative with level type/date/age; chart presentation only consumes them |
| Breakout event | technical.py is_breakout | breakout.py scenario score; Pulse “Volume Breakout”; scanner shared flag | Detail/Pulse/scanner | “Breakout” label also used for relative volume; event lacks crossing condition | **High** | Canonical BreakoutEventResult in technical domain; separate breakout_setup/evidence panel; Pulse label must require price breakout |
| Breakdown | No equivalent canonical event | below-support rule, bearish pattern scenario, scanner SELL/high-risk union | Detail/scanner | Same word represents support failure, bearish pattern, SELL, or risk | **Critical** | Add canonical BreakdownEventResult; risk alone must not mean breakdown |
| Pattern detection | patterns.py | Detail only | Detail warnings/breakout panel | One owner, but semantics internally weak | **High analytical risk** | Keep detail-specific owner; rename scores/states; do not let patterns drive action until validated and chronology-safe |
| Trade plan | trade_plan.py | One backend owner | Detail and recommendation R/R gate | Centralized but plan has no validity state | **Critical** | Keep owner; return PlanFeasibility and enforce invariants before BUY |
| Warnings/vetoes | warnings.py for messages; recommendation.py for implicit vetoes | Rules duplicated between warnings and scoring | Detail only vs all decisions | Actual split ownership | **High** | Introduce canonical DecisionConstraints/VetoResult before recommendation; warnings render those results plus non-veto notices |
| Market regime | market_regime.py | Dashboard/Pulse market state are separate | Recommendation; market presentation | Legitimate distinct concepts, but similar labels | **Medium** | market_regime.py owns trading regime; presentation mood/state must not masquerade as same calculation |
| Market Pulse score | market_pulse/pulse_score.py | Pulse only | Pulse | One owner | **High analytical, low duplication** | Keep module-specific attention ranking; add eligibility gate, decorrelate components, stable tie policy, version |
| Focus/top five | market_pulse_service.py | Pulse only | Pulse | One owner; diversification promise not enforced | **High** | Keep service owner; formalize eligibility, deterministic sorting, hard sector cap or documented exception rule |
| Scanner condition | Currently frontend scanner-workspace-view.tsx | No backend model | Scanner | Local formulas/magic thresholds | **High** | Server-owned pure scanner predicates or a shared versioned eligibility/feature contract; frontend filters/renders only |
| Persisted historical signal | signals repository/model | Frontend enrichment and “NEW” comparison | Watchlist/metadata | Latest arbitrary strategy can be compared with canonical live action | **High** | Treat as immutable StrategySignalSnapshot keyed by strategy_version, signal_as_of, calculated_at, input_revision; compare only matching strategy family/version |

## 4. Formula and constants audit

### Core formulas

| Component | File/function | Current formula or threshold | Intended purpose and dependencies | Verdict / evidence basis | Recommended action | Backtesting requirement |
|---|---|---|---|---|---|---|
| SMA | technical.py, calculate_sma() | Arithmetic mean of last N closes | Trend reference | **Sound mathematics / convention** | Retain; define selected price series and valid-session policy | Verify predictive use and 20/50 periods, not arithmetic |
| EMA | technical.py, calculate_ema() | SMA seed of first N, alpha 2/(N+1), recursive through remaining values | Faster trend reference | **Sound conventional implementation** | Retain; test against independent fixtures | Test 20-period usefulness only |
| RSI | technical.py, calculate_rsi() | Wilder smoothed gains/losses, 14; flat 50, no losses 100, no gains 0 | Momentum oscillator | **Sound convention** | Retain formula; keep 30/70 as configurable convention; calculate only on eligible adjusted closes | Threshold and interaction require walk-forward calibration |
| ATR-labelled value | technical.py, calculate_atr() | Mean of up to last 14 true ranges, not recursive Wilder smoothing | Gap/range scale for stops | True range is **sound**; “ATR14” differs from conventional continuing Wilder ATR | Either implement Wilder ATR or rename rolling_mean_true_range_14 and document | Stop multiple and choice of smoothing require testing |
| Volatility | technical.py, standard_deviation() in build_technical_snapshot() | Population SD of stored last-20 price_change_percent values | Daily variability risk | Mathematically valid for supplied values, but input can be absent despite closes; no annualization | Derive point-in-time adjusted close returns; identify units; robust alternative as sensitivity | Calibrate thresholds by cross-section/regime |
| 5/20-session returns | return_percent_over_lookback() | close[-1]/close[-1-lookback] - 1 | Momentum/overextension | **Sound arithmetic**, raw-price and non-trading-sensitive | Use adjusted, valid traded-session closes; retain raw return separately for event view | Horizon thresholds require testing |
| Trend | infer_trend() | price > SMA20 > SMA50; mirrored downside; short history uses SMA20 slope | Structural trend | **Reasonable convention**; 20/50 and strict inequalities heuristic | Retain as compact baseline; require minimum valid sessions and expose evidence | Compare against simpler price/SMA baseline and threshold sensitivity |
| Swing points | detect_swing_points() | Local extrema with 3 bars each side | Structure/levels/patterns | **Reasonable heuristic**, creates a 3-session confirmation delay | Use centralized constant; expose confirmation date, not pivot date, in backtests | Validate false/late signals and look-ahead-safe event time |
| Support/resistance | resolve_levels() | Nearest confirmed swing below/above; 20-bar Donchian fallback; prior_swing_high is maximum confirmed high | Structural levels and breakouts | Coherent heuristic; fallback includes current bar; “prior” may be all-window maximum | Return level kind, age, confirmation date, strength; exclude current from fallback trigger level | Validate multiple definitions out of sample |
| Breakout flag | build_technical_snapshot() | close > maximum confirmed swing high and volume/mean ≥1.8 | Price/volume breakout | **Incomplete event definition**; no crossing requirement or buffer | Require prior close at/below level, current close above effective tick/buffer, current session, robust volume and eligibility | Essential; evaluate false-break rate and post-break returns |
| Relative volume | multiple | latest volume / arithmetic mean prior 20 rows; threshold 1.8 | Participation | Explainable heuristic; zero-volume sessions distort denominator | Use median/trimmed mean across valid traded sessions, sample count, outlier cap | Calibrate by liquidity bucket and session regime |
| Liquidity | trade_plan.py, compute_liquidity() | Mean turnover: ≥50m strong, ≥10m normal, ≥2m thin; else illiquid; share-volume fallback | Tradability/risk | **DSE-specific uncalibrated heuristic**; approximate turnover and no position size | Add provenance, traded-day ratio, median turnover, zero-return/no-trade share, free float, capacity vs intended order | Required by liquidity/sector bucket |
| Opportunity | scoring.py, compute_opportunity_score() | 28% trend +22% momentum +20% volume +20% price position +10% inverse risk | Long-opportunity evidence | Weights sum correctly; components correlated and arbitrary; support bug corrupts value | Fix bug; decorrelate; define score as evidence index, not probability | Full component ablation, monotonicity and sensitivity |
| Risk | scoring.py, compute_risk_score() | 25% volatility +20% category +20% liquidity +15% latest quality +10% stale/sparse +10% overextension | Trading risk | Transparent heuristic; mixes market risk, data reliability and tradability; category/effective dates missing | Split market/trading risk, liquidity/capacity, and data reliability; preserve composite for compatibility | Validate loss/drawdown monotonicity by bucket |
| Price position | scoring.py, _score_price_position() | +12 when support_distance ≤3 before checking <0 | Reward proximity to support | **Implementation error**: below support receives +12; negative branch unreachable | Check below support first; use signed ranges and unit tests | Correctness test first; later calibrate distance bands |
| Recommendation | scoring.py, compute_recommendation() | Ordered threshold/veto chain; BUY opportunity ≥55, uptrend, RSI ≤78, low/medium risk; multiple special gates | Action selection | Deterministic and explainable, but precedence is complex, thresholds arbitrary, HOLD ambiguous | Make explicit decision table; central ConstraintResult; position-aware meanings | Validate every boundary and out-of-sample action outcomes |
| Decision confidence | scoring.py, compute_decision_confidence() | Weighted opportunity pillars + inverse risk + data score; direction conflict penalties; caps | Claimed reliability | **Materially misleading**: bullish orientation reused for SELL, duplicated inputs, quality ignored in data score, no calibration | Rename evidence_strength; calculate direction-aware coherence and separate data reliability; calibrate before probability language | Reliability curve/Brier only after defining event/horizon |
| Trade plan | trade_plan.py, compute_trade_plan() | Entry -1%/+0.5%; support -0.5%/+1.5%; stop max(structural, entry-2ATR, -8% cap); target resistance else +6%; target low -3% | Entry/risk/target reference | **Unvalidated and unsafe without invariants** | Add plan status, structural invalidation, conservative R/R, tick/circuit checks; no plan for ineligible action | Event replay, fill/slippage, MAE/MFE and target/stop hit order |
| Market regime | market_regime.py | Latest index vs up-to-50 mean ±0.5%; breadth adv/(adv+decl), bullish .55, bearish .40 | Broad-risk gate | Reasonable compact heuristic; no minimum history/quality/date alignment; thresholds arbitrary | Minimum coverage, session alignment, unchanged coverage, regime metadata/hysteresis | Transition stability and conditional performance |
| Pattern match score | patterns.py, _evidence_confidence() | Base45 + fixed boolean weights | Pattern evidence | **Not confidence/probability**; simplified geometries/states | Rename pattern_match_score; correct triggers/chronology/geometry; quarantine from decisions initially | Pattern-specific precision/base-rate comparison |
| Breakout probability | breakout.py, analyze_breakout() | 20 × matched factor count + pattern_score//10, cap92 | Scenario strength | **Not a probability**; no event definition/outcome/calibration | Rename breakout_evidence_score; separate setup vs confirmed event; validate targets | Required before any probability wording |
| Pulse Score | pulse_score.py | Trend max35 + momentum30 + volume25 + signal boost10 − risk penalty up to20 | Attention rank | Transparent but highly correlated and unvalidated; missing volume baseline earns points | Gate eligibility; remove duplicate pillars; missing evidence gets zero/unknown; version | Cross-sectional ranking lift, stability, turnover, capacity |
| Pulse focus | constants/service | score ≥60, top5, nominal max2 sector | Editorial focus list | Threshold/top count product heuristics; sector limit not actually hard | Deterministic tie rule; explicit hard/exception policy; eligible candidate pool | Top-k lift and concentration/capacity analysis |
| Scanner floors | scanner-workspace-view.tsx | mean turnover ≥2m else average volume ≥50k | Exclude illiquid names | Duplicates backend threshold and ignores other eligibility | Consume server EligibilityResult | Validate coverage and false opportunity rate |

### Constants and threshold classification

| Constant group | Current values | Classification | Action |
|---|---|---|---|
| RSI/MA/ATR periods | RSI14, SMA/EMA20, SMA50, ATR14 | Widely used **conventions**, not universal optima | Retain as baseline; pre-register a small sensitivity grid |
| Recommendation/history | 90-row recommendation, 20 minimum rows, 260 detail load | Reasonable engineering/strategy heuristics | Minimum must mean valid traded sessions; test 20/50/90/260 interactions |
| Stale threshold | 7 calendar days | Arbitrary and **dynamic by exchange calendar** | Replace with missed official-session count and session date alignment |
| Level proximity | 3%, 2.5%, breakout-near 4% | Arbitrary strategy bands; discontinuous | Normalize by ATR/effective tick where justified; calibrate |
| Volatility | 2.3% elevated, 3% high | Arbitrary unconditional DSE levels | Use rolling cross-sectional/liquidity-bucket context or validated static bands |
| Volume | 1.8 expansion, .45 thin, .55 consistency, breakout gate 1.0 | Common-style heuristics, not mathematically required | One canonical result; robust baseline; calibrate by liquidity |
| Opportunity/risk weights | Listed above, each sum 1 | Internally coherent but arbitrary | Component ablation, correlation analysis, sensitivity; reduce overlap |
| Risk labels | 35/55/75 and Z always speculative | Product/DSE heuristic; category rules are effective-dated | Version and validate against forward drawdown/loss; source categories as-of |
| Category scores | A15, B30, G20, N45, Z75 | DSE-specific subjective mapping | Move to effective-dated policy table with regulatory source and rationale |
| Overextension/gap | +25% in20, +20% above SMA20; >3% gap; max15 bonus scaled by frequency | Plausible DSE hypotheses, arbitrary | Test separately; gap input must use adjusted prior close and valid open |
| Confidence weights/caps | six weights; conflict10; illiquid40, thin60, stale50, HOLD/WAIT72 | Arbitrary presentation controls | Replace with explicit reliability/evidence model; calibrate |
| Trade plan | 0.5 volatility buffer, 2ATR, 8% cap, min R/R1.2, fallback +6% | Strategy hypotheses; target constant name is misleading | Feasibility first, then historical calibration; no silent structural-stop override |
| Liquidity BDT bands | 2m/10m/50m average daily turnover | DSE-specific but unvalidated and not capacity-aware | Median/percentile/capacity framework; effective as-of distribution |
| Pattern | min30, separation5, prior trend8%, base45 and evidence points | Detector design choices, arbitrary | Validate each detector or remove from trading claims |
| Corporate-action guard | drop ≥12%, prior window5 | Safety heuristic, can suppress genuine crash or miss action | Known event/adjustment data authoritative; heuristic only produces “unresolved,” never truth |
| Regime | 50, .5%, breadth .55/.40, cap60 | Common-style heuristic | Minimum history, hysteresis and walk-forward calibration |
| Pulse | threshold60, top5, component caps, jump10 | Editorial/product heuristics | Eligibility + version + ranking validation |
| Hard-coded/unused | technical.py SWING_POINT_LOOKBACK=3 while PATTERN_SWING_LOOKBACK unused; client 1.8/.55 and scanner floors; unused BUY/SELL/HOLD confidence and risk constants | Centralization defect | Delete dead constants; import canonical outputs rather than numeric mirrors |

## 5. Findings by priority

Priority labels describe the current code path, not observed live portfolio losses. “Reachable” means the code permits the contradiction; production incidence could not be measured without a production snapshot and historical replay.

### P0 — mathematically wrong, contradictory, or materially misleading

#### P0.1 — Below-support prices receive a bullish price-position reward

- **Affected:** decision/scoring.py, _score_price_position(); opportunity and confidence consumers.
- **Current behavior:** support_distance is checked for ≤3 before <0. Every negative value is therefore labeled “near support” and receives +12; the intended -20 branch is unreachable.
- **Why it matters:** a structural failure raises the long-opportunity score and can raise confidence even though recommendation precedence later emits SELL.
- **User impact:** contradictory cards such as meaningful opportunity/evidence alongside a support-failure action.
- **Correction:** branch in signed order: below invalidation, near support within [0, band], neutral/extended above. Add explicit boundary semantics.
- **Required tests:** -0.01%, -1%, exactly 0%, 2.999%, 3%, and 3.001%; property that crossing below support never increases long opportunity.
- **Validation:** correctness does not require backtesting; the proximity band does.

#### P0.2 — Confidence is directionally incorrect and not reliability

- **Affected:** scoring.py, compute_decision_confidence(); summary/UI labels; Pulse signal boost; Signal Center sorting.
- **Current behavior:** trend, momentum, volume and price-position are bullish opportunity component scores. They are averaged directly even for SELL; only a later conflict penalty partially reacts. “Data alignment” is 85 whenever not stale/sparse, even when latest quality is SUSPICIOUS. Risk and opportunity evidence is reused.
- **Why it matters:** the value does not answer “how reliable is this recommendation?” A coherent downtrend SELL can score weakly because bearish evidence is numerically low, while suspicious bullish data can remain high.
- **User impact:** ranking and meter values imply trust that is neither calibrated nor directionally coherent.
- **Correction:** immediately rename to evidence_strength. Separate data_reliability, tradability, directional_coherence, and decision_margin. Invert/transform evidence by recommended direction and give missing/conflicting data explicit treatment.
- **Required tests:** mirror-image bullish BUY and bearish SELL; suspicious/partial caps; monotonic data degradation; neutral WAIT with strong mixed evidence; no reuse dependence that double-counts the same component.
- **Validation:** retain only “evidence strength” until a horizon/event-specific reliability curve is established out of sample.

#### P0.3 — Breakout probability and pattern confidence are unsupported numerical claims

- **Affected:** decision/breakout.py; decision/patterns.py; detail schemas and frontend breakout/pattern labels.
- **Current behavior:** breakout “probability” is 20 points per matched boolean plus one-tenth of pattern points. Pattern “confidence” is base45 plus fixed evidence points. Neither is linked to an outcome or frequency.
- **Why it matters:** a bounded 0–100 heuristic is not automatically a percentage probability or confidence level.
- **User impact:** users can interpret 80 as an 80% chance, which is false.
- **Correction:** rename to breakout_evidence_score and pattern_match_score; remove percent/probability phrasing. Define explicit outcomes before later calibration.
- **Required tests:** exact factor contribution and missing-evidence behavior; terminology/schema contract tests.
- **Validation:** only restore probability after independent chronological calibration with reliability diagrams, Brier decomposition, coverage, and confidence intervals.

#### P0.4 — Pattern states and direction can assert events that never occurred

- **Affected:** patterns.py _detect_flag(), _detect_triangle(), _detect_head_shoulders(), _detect_cup_and_handle(); breakout.py; warnings.py.
- **Current behavior:** flags become Active on volume without a price crossing; the breakout level is the max/min of a window containing the latest close, so the same close cannot demonstrate crossing that inclusive extreme. All triangles are Active without a trigger. A neutral symmetrical triangle uses support and a downside target. H&S always remains Forming. Text claims flag-slope alignment without checking slope.
- **Why it matters:** pattern state feeds breakout direction and can generate a critical “confirmed” bearish warning because Active is treated as confirmed.
- **User impact:** false active/confirmed patterns, bearish breakdown panels from neutral formations, and arbitrary targets.
- **Correction:** define FORMING, TRIGGERED, CONFIRMED, FAILED with as-of trigger rules; use pre-trigger levels excluding current close; keep symmetrical direction unresolved until price breaks; validate target positivity/order.
- **Required tests:** no active state before crossing; symmetrical upside/downside branches; current-bar exclusion; failure/invalidation; prefix-only chronology; no negative targets.
- **Validation:** each pattern must beat its unconditional base rate on held-out data before influencing a decision.

#### P0.5 — Trade plans can be invalid yet still support a positive action

- **Affected:** trade_plan.py compute_trade_plan(); scoring.py compute_recommendation().
- **Current behavior:** an 8% cap can move the stop above structural invalidation instead of declaring the trade too risky. The stop can be forced to only 0.1% below entry. Fallback target is a hard +6%; target_low is always 3% below target_high and can fall inside/below entry. R/R uses midpoint and optimistic target_high. Missing R/R does not block BUY; confirmed breakout bypasses the R/R gate. Plans exist for WAIT/SELL/stale/sparse rows.
- **Why it matters:** a risk cap should constrain position acceptance or sizing, not rewrite the thesis invalidation level. A mathematically populated plan can be economically nonsensical.
- **User impact:** misleading stop, target, and reward/risk; false impression of executable protection in gap/circuit markets.
- **Correction:** preserve structural invalidation; if required risk exceeds policy, return WATCH_ONLY/INVALID. Enforce stop < conservative entry ≤ entry zone < conservative target, positive finite R/R, tick/circuit feasibility, and plan/action compatibility.
- **Required tests:** all plan invariants, resistance below price, support above entry, deep support, missing ATR/level, circuit/gap, breakout target below price, WAIT/SELL plan status.
- **Validation:** replay fills, stop/target ordering, MAE/MFE, slippage, non-fill and circuit scenarios.

#### P0.6 — Raw corporate-action history can produce false returns, trends, volatility, patterns, and actions

- **Affected:** ingestion sources/services, models.DailyPrice, technical.py, engine.py, universe/detail orchestration.
- **Current behavior:** adjusted_close_price is stored as null by current ingestion. Per-stock historical rows have null prior/change percentages and approximate turnover. Technical returns/RSI/MAs use raw close; volatility uses stored change percentages, so it can be missing even with complete closes. Detail supplies dividend ex-dates; universe/list does not. A >12% heuristic is used as a partial substitute.
- **Why it matters:** a bonus/split/rights/dividend gap is not ordinary price evidence. The heuristic can also suppress a genuine crash.
- **User impact:** false SELL/breakout/volatility/pattern and list/detail disagreement around ex-dates.
- **Correction:** point-in-time corporate-action event pipeline and adjustment factors; derive a consistent analytical OHLC series; retain raw execution prices separately; mark unresolved discontinuities ineligible. Supply the same event context to all consumers.
- **Required tests:** split, bonus, rights and cash-dividend examples; known/unknown ex-date; adjusted volume where share count changes; list/detail equality; genuine crash not auto-cleared.
- **Validation:** source reconciliation and event-by-event audit; no predictive backtest needed for correctness, but all historical testing must use point-in-time treatment.

#### P0.7 — Market Pulse opportunity history compares incompatible quantities

- **Affected:** market_pulse_briefing.py, _opportunity_history_from_summaries() and build_market_briefing().
- **Current behavior:** prior points are 50 + 8 × index daily change; the current point is the average Pulse score of focus stocks, monitor stocks, or a fallback pool. “Previous session,” weekly average, and improving/softening compare these unlike measures.
- **Why it matters:** the time series has no stable definition.
- **User impact:** false improvement/softening and a misleading market opportunity environment.
- **Correction:** remove history until true point-in-time Pulse snapshots exist, or recompute every historical point from the same eligible universe, strategy version, and as-of data.
- **Required tests:** same formula and population identity for all points; no selection-pool substitution; version discontinuity behavior.
- **Validation:** ranking/environment validation after point-in-time snapshots.

#### P0.8 — Market Pulse “money flow” can be fabricated

- **Affected:** market_pulse_briefing.py, _sector_performance() and money_flow fallback.
- **Current behavior:** average daily price change is called inflow/outflow. When no positive sector exists, the leading sector is forced to +0.1; when no negative sector exists, one is forced to -0.1.
- **Why it matters:** this creates facts absent from inputs and labels price movement as capital flow.
- **User impact:** fictitious sector inflow/outflow.
- **Correction:** never synthesize signs. Rename to sector price leadership/lagging, or calculate documented turnover/price-flow proxies with limitations.
- **Required tests:** all-positive, all-negative, all-flat and insufficient-sector cases must produce empty appropriate sides, never fabricated values.
- **Validation:** terminology/correctness first; any flow interpretation needs separate empirical work.

### P1 — major analytical or ownership weakness

#### P1.1 — No canonical data eligibility gate for DSE/CSE

- **Affected:** technical.py, engine.py, universe service, Pulse, scanner, dashboard and watchlist.
- **Current behavior:** 20 raw rows count as sufficient even if many are zero-volume/non-trading; only latest quality is scored; active stock status substitutes for suspension/tradability; stale is seven calendar days.
- **Why it matters:** conventional indicators assume comparable observations. Stale last-traded prices and non-trading sessions can mimic low volatility/support.
- **User impact:** technically strong but untradeable names can rank; stale data can shape breadth and Pulse.
- **Correction:** pure DataEligibilityResult with current exchange session, valid OHLC checks, minimum adjusted history, traded-session ratio, median turnover, stale-session count, quality coverage, category/suspension/circuit/corporate-action status, and explicit exclusion/review reasons.
- **Tests:** all Bangladesh-specific cases in the test plan; all consumers must receive identical eligibility.
- **Validation:** tune eligibility thresholds by liquidity/capacity, not predictive return alone.

#### P1.2 — Warning severity and recommendation veto ownership are split

- **Affected:** scoring.py and warnings.py; stock_details_decision_service.py.
- **Current behavior:** recommendation computes before patterns and warnings. Some veto logic is duplicated in scoring; critical pattern warnings cannot alter the decision.
- **Why it matters:** severity is presentation-only, not a control.
- **User impact:** reachable BUY plus critical bearish-pattern warning.
- **Correction:** compute ConstraintResult before recommendation; include hard block, downgrade, review-only and informational reasons. Warnings render that authoritative result.
- **Tests:** every hard veto dominates every positive branch; no critical contradiction.
- **Validation:** policy correctness first; pattern veto requires backtesting.

#### P1.3 — HOLD/WAIT/SELL lack holder versus non-holder semantics

- **Affected:** scoring.py, schemas, watchlist and all action labels.
- **Current behavior:** HOLD can mean maintain an existing position or “do not chase” for a non-holder; SELL is shown even to non-holders; WAIT can mean no edge or bad data.
- **Why it matters:** one label cannot prescribe the same action to two different portfolio states.
- **User impact:** non-holders may interpret HOLD as a purchase-quality endorsement; holders may interpret WAIT as no management action.
- **Correction:** authoritative stance plus non_holder_action and holder_action; preserve recommendation temporarily as a backward mapping. SELL should mean exit/reduce for a holder and avoid for a non-holder.
- **Tests:** decision matrix contracts for both contexts.
- **Validation:** terminology/policy, then outcome analysis by context.

#### P1.4 — List/detail/watchlist are not guaranteed identical

- **Affected:** stock_details_decision_service.py, market_universe_compute/service.py, decision/summary.py, watchlists_service.py.
- **Current behavior:** detail has ex-date inputs; universe does not. Watchlist fallback has neither regime nor ex-dates. Detail and universe caches can be same-day eventually consistent. Cache keys omit strategy version. Summary reason may be the final cap sentence.
- **Why it matters:** one symbol/date can show different action or rationale.
- **User impact:** loss of trust and irreproducible screenshots/audits.
- **Correction:** one StrategyInput/DecisionResult keyed by stock, exchange session, price revision, event revision and strategy version. Consumers read it; detail enriches patterns/valuation without recalculating the core differently.
- **Tests:** list/detail/watchlist byte-equivalent core fields for the same key; cache invalidation on strategy/input version.
- **Validation:** deterministic contract, not backtest.

#### P1.5 — Persisted signals are not safely comparable with live decisions

- **Affected:** models.TradingSignal, signals service/repository/job, frontend enrichment and trader-decision helpers.
- **Current behavior:** table uses BUY/HOLD/SELL and 0–1 confidence, accepts strategy_name but no formal strategy version/input revision/calculation-as-of. Latest active strategy can be arbitrary; same-date persisted metadata can overwrite legacy client signal and drive NEW comparisons.
- **Why it matters:** historical record, alternate strategy and current canonical action are conflated.
- **User impact:** false “new/upgrade” badges and unexplained disagreement.
- **Correction:** immutable StrategySignalSnapshot with strategy_id/version, signal_as_of, calculated_at, market-session id, input revision, action taxonomy and score definitions. Compare only like-for-like versions.
- **Tests:** mismatched strategy ignored for change; matching prior session accepted; later correction/version shown as revision, not market signal.
- **Validation:** historical integrity first.

#### P1.6 — Opportunity/risk/Pulse reuse correlated evidence

- **Affected:** scoring.py and pulse_score.py.
- **Current behavior:** trend state and price/SMA distance overlap; momentum includes returns that also determine trend/overextension; risk enters opportunity, recommendation, confidence and Pulse penalty; Pulse trend counts price>SMA20, price>EMA20 and trend again.
- **Why it matters:** nominally diverse components can be one moving-average/price move repeated several times.
- **User impact:** score changes look more strongly corroborated than they are.
- **Correction:** component-correlation/ablation audit; keep a smaller set of orthogonal evidence and separate reliability from direction/risk.
- **Tests:** duplicated-feature perturbation must not create disproportionate score jumps; contribution sum/invariance.
- **Validation:** walk-forward ablation and sensitivity.

#### P1.7 — Pulse candidate eligibility, risk protection and diversification are inadequate

- **Affected:** pulse_score.py and market_pulse_service.py.
- **Current behavior:** no pre-score exclusion for stale/suspicious/illiquid/zero-volume/corporate-action rows; risk penalty caps at20; missing volume baseline earns a normal score. Sorting has no explicit tie-break. The sector algorithm can add a third sector member at the final slot and fill pass ignores limits. Monitor list can duplicate focus.
- **Why it matters:** attention ranking can elevate unsafe or incomparable rows and is not fully deterministic under ties.
- **User impact:** top-five stock with unacceptable liquidity/data risk; concentrated focus despite documentation.
- **Correction:** eligibility before score; unknown evidence contributes zero/unknown; stable sort by score, eligibility tier, liquidity/capacity, symbol; enforce a documented diversification rule and non-overlapping monitor pool.
- **Tests:** risk exclusions, ties, sector cap, override threshold, monitor disjointness, repeated execution.
- **Validation:** top-k lift, capacity and sector concentration.

#### P1.8 — Pulse narratives overclaim daily evidence

- **Affected:** pulse_score.py and market_pulse_service/briefing.py.
- **Current behavior:** volume suggests “institutional participation”; highest volume ratio is “accumulation leader”; positive-price subsets imply sector rotation; any BUY uptrend can say “fresh breakout”; high priority says 30D average while canonical baseline is prior20. Breadth/sector calculations include rows not aligned to the latest exchange session.
- **Why it matters:** daily OHLCV cannot identify participant type or true money flow.
- **User impact:** persuasive but unsupported causal narratives.
- **Correction:** factual descriptions only: relative volume, price breadth, turnover leader, price leadership. Enforce session eligibility and correct baseline labels.
- **Tests:** narrative facts must trace to fields; no institutional/flow/precedence claim without data.
- **Validation:** not predictive; semantic evidence audit.

#### P1.9 — Scanner conditions are inconsistent and partially mislabeled

- **Affected:** scanner-workspace-view.tsx, scanner-language.ts, trader-decision.ts.
- **Current behavior:** duplicated liquidity floors; support rebound lacks a lower bound and can include prices below support; risk_compression is HIGH/SPECULATIVE OR volatility<1.1; breakdown_risk is SELL OR high risk; oversold uses RSI<40; default categories slice alphabetic universe order, advanced support sorts by absolute price.
- **Why it matters:** condition names do not match predicates and result order is not analytical rank.
- **User impact:** “confirmed rebound,” “breakdown,” or “high-conviction” results that do not meet those meanings.
- **Correction:** explicit backend condition IDs and predicates; separate risk watch from compression; require support reclaim/turn evidence; distinguish weak RSI from conventional oversold; stable meaningful ranking; consume EligibilityResult.
- **Tests:** positive/negative examples per condition, below-support exclusion, ordering, backend/detail equality.
- **Validation:** false-positive/coverage analysis by scan.

#### P1.10 — Breakout and breakdown are not symmetric canonical events

- **Affected:** technical.py, breakout.py, scanner and Pulse labels.
- **Current behavior:** breakout can remain true on later closes above an old maximum; no canonical breakdown flag exists. Breakout analysis defaults to upside unless an active pattern suggests downside.
- **Why it matters:** setup, event and persistent state are conflated; downside classification depends on weak pattern logic.
- **User impact:** stale “new breakout,” missing true breakdown, and incorrect scenario panel.
- **Correction:** separate BreakoutSetup, BreakoutEvent, BreakoutRetest, FailedBreakout and mirrored downside events with trigger timestamp/level.
- **Tests:** crossing, no-cross persistence, retest, failed event, volume missing, corporate-action gap.
- **Validation:** event-study outcomes and false-break rate.

#### P1.11 — Market regime has insufficient input controls

- **Affected:** market_regime.py and summary repositories.
- **Current behavior:** a directional regime can be produced with very short index history; latest breadth may be missing/misaligned; unchanged and coverage are omitted; no quality or hysteresis.
- **Why it matters:** broad-market vetoes can change BUY/HOLD from weak context.
- **User impact:** abrupt/inexplicable regime downgrade.
- **Correction:** require minimum index sessions and same-session breadth coverage, include metadata and previous-state hysteresis, return UNKNOWN when unreliable rather than NEUTRAL.
- **Tests:** short/missing/misaligned history, holiday gap, breadth veto, transition hysteresis.
- **Validation:** regime stability and conditional action performance.

#### P1.12 — No empirical validation or production audit identity

- **Affected:** backtesting module, schemas, caches, persisted signals, docs.
- **Current behavior:** backtesting contains only a README. Outputs omit strategy version, threshold version, calculation time, market-session id and input revision.
- **Why it matters:** predictive value, regressions and historical reproducibility cannot be demonstrated.
- **User impact:** no defensible answer to why a prior action changed.
- **Correction:** add the early essential identity first: strategy version, as-of date, calculated-at time, shared decision identity, result semantics and primary reason. Add input/revision lineage and replay-grade metadata during production hardening.
- **Tests:** early shared-identity and cache-version separation; as-of replay and selected golden snapshots in Phases 6–7.
- **Validation:** practical backtesting in Phase 6; full replay/audit hardening in Phase 7.

### P2 — important refinement

#### P2.1 — ATR definition and malformed-row alignment need correction

- **Affected:** technical.py calculate_atr()/build_technical_snapshot().
- **Current behavior:** rolling TR mean is named ATR14; highs/lows/closes are filtered independently, so malformed rows can become misaligned.
- **Correction:** validate OHLC rows atomically; implement Wilder smoothing or rename. Test synthetic series where rolling and Wilder differ.
- **Validation:** compare stop performance only after correctness.

#### P2.2 — Mean volume/turnover is fragile in a zero-volume/outlier market

- **Affected:** technical.py and liquidity/scoring/Pulse.
- **Current behavior:** zero sessions lower the arithmetic mean and a single block/outlier raises it; approximate turnover lacks provenance.
- **Correction:** valid traded-session ratio plus median/trimmed baseline, observation count, MAD/outlier flag, actual-versus-estimated turnover.
- **Validation:** liquidity-bucket sensitivity.

#### P2.3 — Support/resistance lacks level metadata and fallback precision

- **Affected:** technical.py.
- **Current behavior:** consumers receive only numeric levels; Donchian fallback includes latest; prior high is maximum confirmed rather than necessarily recent/nearest.
- **Correction:** LevelResult should include method, pivot date, confirmation date, touches, age and invalidation. Use pre-event window for triggers.
- **Validation:** compare alternative definitions.

#### P2.4 — Staleness and universe cache checks are too coarse

- **Affected:** engine.py and market_universe_service.py.
- **Current behavior:** seven calendar days; universe cache checks only the first row’s trade date, allowing mixed-session rows.
- **Correction:** exchange-session calendar and per-row or payload-level session identity/coverage.
- **Tests:** mixed-date payload, holiday/closure, stale individual stock.
- **Validation:** correctness.

#### P2.5 — Constants are only partially centralized

- **Affected:** trading_constants.py, technical.py, scanner, client helpers, Pulse briefing.
- **Current behavior:** unused signal confidence/risk constants, unused PATTERN_SWING_LOOKBACK, local 1.8/.55 and scanner floors, multiple hard-coded Pulse and narrative thresholds.
- **Correction:** typed StrategyParameters grouped by concept; delete dead values; API exposes strategy/threshold version, not raw client mirrors.
- **Tests:** static forbidden-constant/import checks.
- **Validation:** sensitivity for strategy values.

#### P2.6 — Documentation overstates consistency and contains stale descriptions

- **Affected:** stock_decision_support.md, signals.md, market_pulse.md, market_universe.md, market_data.md.
- **Current behavior:** docs say top10 patterns while response limit is3; missing OHLCV supposedly yields null although nonempty sparse rows yield WAIT; ex-date behavior is not identical list/detail; Market Pulse says 30D in output but uses20; market-data “derived on write” does not describe per-stock historical null changes; watchlist is described as universe-only despite backend fallback.
- **Correction:** update after behavior is corrected; document exact data provenance, score semantics and alternate paths.
- **Tests:** documentation contract assertions where feasible.
- **Validation:** audit.

#### P2.7 — Existing tests are permissive and sometimes encode wrong behavior

- **Affected:** test_stock_decision_support.py, test_breakout_and_patterns.py, test_market_universe_contract.py and frontend scanner/signal tests.
- **Current behavior:** indicator tests often assert only non-null; recommendation allows broad sets; trade plan checks existence only; a test enshrines neutral symmetrical triangle downside; “prioritizes actionable” sorts HOLD90 above BUY80; no Pulse formula/diversification or scanner predicate tests.
- **Correction:** replace with exact fixtures, invariants, boundary tables, chronology and cross-surface contracts.
- **Validation:** targeted branch coverage for decision paths first; mutation testing only later if the critical precedence logic warrants it.

### P3 — optional improvement

#### P3.1 — Presentation-only chart markers and ranking helpers need explicit namespaces

- **Affected:** chart-intelligence.ts and trader-decision.ts.
- **Current behavior:** chart “volume spike” uses a different 60-bar baseline; client “risk-adjusted” and “volume-confirmed” ranks are undocumented composites.
- **Correction:** retain only as clearly named chart_annotation or ui_sort_heuristic, or consume backend evidence fields.
- **Tests:** never changes authoritative action or score.
- **Validation:** optional UX evaluation, outside core roadmap.

#### P3.2 — Add contribution diagnostics after the model is simplified

- **Affected:** result schemas only in a later phase.
- **Correction:** expose canonical component values, constraints, missing evidence and audit metadata.
- **Validation:** explanation fidelity tests; optional UI is separated in Section 13.

## 6. Contradiction and divergence matrix

| Contradiction/divergence | Current status | Mechanism | Required resolution |
|---|---|---|---|
| Opportunity rises below support while recommendation is SELL | **Actual formula contradiction** | Unreachable below-support penalty in _score_price_position() | Fix signed branch and add monotonic invariant |
| BUY with critical bearish-pattern warning | **Reachable by construction** | Patterns/warnings run after recommendation and cannot veto | Canonical pre-decision constraints; until validated, critical pattern makes result REVIEW/WAIT, not BUY |
| BUY with Category Z critical warning | Generally prevented today | Z forces speculative risk, blocking BUY, but the rule exists in separate modules | Preserve as one explicit category constraint and test it |
| High confidence with SUSPICIOUS latest data | **Reachable** | Confidence data_alignment ignores DataQualityFlag; no suspicious cap | Separate data reliability and hard cap/exclusion |
| High confidence with weak historical quality | **Reachable** | Only latest quality is used; historical partial/suspicious share is ignored | Window quality coverage in EligibilityResult |
| Top Pulse rank with stale/illiquid/suspicious data | **Reachable** | No eligibility gate; risk penalty capped at20; missing volume earns points | Eligibility before scoring; risk/data exclusion tiers |
| Positive action with invalid trade plan | **Reachable** | No PlanFeasibility; missing R/R does not block BUY; breakout bypass | Enforce plan invariants and action-plan matrix |
| Breakout target below current/entry | **Reachable** | fallback resistance ×1.05 can remain below current after a break; no invariant | Pre-break level and target ordering validation |
| List BUY versus detail WAIT around an ex-date | **Reachable actual input divergence** | Detail supplies ex dates; universe does not | Same StrategyInput/event revision for all surfaces |
| Watchlist action differs from universe/detail | **Reachable fallback divergence** | Backend watchlist recomputes without regime/ex dates | Read canonical universe/decision snapshot |
| Live decision differs from persisted signal | **Expected but ambiguously presented** | Different taxonomy, score scale, strategy and date; latest arbitrary strategy | Namespaced historical strategy snapshot; compare only matching versions |
| Scanner “breakdown risk” differs from detail breakdown | **Actual semantic inconsistency** | Scanner uses SELL OR HIGH/SPECULATIVE; no canonical breakdown flag | Canonical BreakdownEventResult; separate risk watch |
| Scanner “support rebound” includes broken support | **Reachable** | Only upper bound price ≤ support×1.04; no lower bound/reclaim | Require valid near-support range and rebound event |
| Frontend changes backend action meaning | Badge resolver normally prevents it; legacy metadata still differs | generateSignal(), simple RSI/risk/levels, persisted enrichment | Quarantine legacy model and remove after consumers migrate |
| Flat RSI backend 50 versus legacy client 100 | **Actual formula inconsistency** | Client returns100 whenever average loss is zero, including no gain | Use backend snapshot; if retained, mirror flat condition exactly |
| Backend relative volume versus client/chart relative volume | **Actual baseline inconsistency** | Prior20 excluding latest vs20 including latest vs60 including current | Canonical relative-volume metadata or explicit chart-only names |
| Pulse “Volume Breakout” without price breakout | **Reachable semantic inconsistency** | Label is selected from high relative volume when decision is not BUY | Require BreakoutEvent or rename Unusual Volume |
| Pulse 30D label versus 20-session calculation | **Actual documentation/output mismatch** | Briefing string is hard-coded 30D | Use baseline metadata in label |
| Pulse opportunity history changes formula at final point | **Actual mathematical inconsistency** | Past transformed index returns, current selected-stock score | Remove or rebuild same metric point-in-time |
| Pulse money inflow/outflow without signed observations | **Actual fabricated output path** | Fallback forces +0.1 and -0.1 | Empty state, never synthetic data |
| Focus max two per sector | **Documentation differs from implementation** | Last slot and fill pass can exceed two | Enforce or document a quantitative override |
| Summary reason explains cap rather than action | **Reachable** | reasoning[-1] after confidence/regime cap | Store primary_decision_reason separately |
| “Insufficient OHLCV gives null decision” | **Docs differ from implementation** | Any nonempty history can produce a sparse WAIT bundle | Define eligibility/result state and update docs |
| “Top 10 patterns” | **Docs differ from implementation** | DECISION_PATTERN_RESPONSE_LIMIT is3 | Correct doc or contract |
| “All terminal consumers use universe only” | **Docs differ from implementation** | Watchlist backend fallback recomputes | Remove fallback decision computation |
| First500 represents exchange universe | **Potential coverage divergence** | Active symbols selected alphabetically with a hard limit | Load all eligible symbols or explicitly paginate/declare coverage |
| Cached and recalculated results use same strategy | **Not guaranteed** | Cache key has no strategy/threshold version | Versioned cache/result identity |

## 7. Recommended target model

### Design objective

Keep a small deterministic model, but make the sequence authoritative and typed:

~~~mermaid
flowchart LR
    A["Point-in-time raw data + corporate actions + exchange session"] --> B["Input validation and analytical price-series selection"]
    B --> C["DataEligibilityResult"]
    C -->|Ineligible| X["WAIT / unavailable with reasons"]
    C -->|Eligible or limited| D["TechnicalFeatureSet"]
    D --> E["LiquidityAndCapacityResult"]
    D --> F["TechnicalEvidenceResult"]
    D --> G["TradingRiskResult"]
    M["RegimeResult"] --> H["DecisionConstraints"]
    E --> H
    F --> H
    G --> H
    H --> I["TradePlanFeasibility"]
    I --> J["CanonicalDecisionResult"]
    J --> K["EvidenceStrength + DataReliability"]
    J --> L["List / detail / signals / watchlist"]
    J --> P["Pulse eligibility then attention ranking"]
    D --> Q["Scanner predicates"]
    C --> Q
~~~

### 7.1 Data eligibility

Return a typed result rather than silently converting bad data into a neutral technical state:

- **ELIGIBLE:** latest bar equals the stock's current exchange session; OHLC is valid; required adjusted analytical series is resolved; minimum valid history and traded-session ratio pass; liquidity/capacity meets the surface's policy; no suspension or unresolved critical event.
- **LIMITED:** calculations may be shown, but no fresh BUY or focus/scanner promotion. Examples: 20–49 valid sessions, partial source coverage, no reliable turnover provenance, borderline traded-session ratio.
- **REVIEW_ONLY:** technically calculable but unresolved corporate action, price-source conflict, abnormal gap, circuit-locked state, or category/status transition.
- **INELIGIBLE:** stale last trade beyond allowed missed sessions, suspended/inactive, invalid OHLC, zero valid trades over the required interval, unresolved adjusted-series break, or insufficient history.

Eligibility must record:

- exchange session and latest stock trade session;
- valid OHLC rows, traded rows, zero-volume rows and traded-session ratio;
- raw and adjusted series availability;
- quality counts by flag and source;
- turnover provenance (reported/estimated/mixed), median and percentile;
- stale official-session count;
- corporate-action and ex-date resolution;
- category, suspension/status and effective dates;
- circuit bands/current lock where available;
- reason codes and policy/strategy version.

Suggested initial safeguards are hypotheses to be calibrated, not final values. An initial policy can require 50 valid adjusted sessions for full trend evidence, at least 70% traded sessions over the eligibility window, and a position-size-aware median-turnover floor. The 70% value is a defensible starting hypothesis because CSE uses traded-day coverage in an index eligibility context, not because it is universally optimal.

### 7.2 Technical feature set

Use one point-in-time analytical OHLCV series:

- adjusted price and correspondingly adjusted volume for split/bonus-like capital changes;
- raw price/YCP/circuit fields retained for execution and displayed session move;
- atomic row validation so high/low/close never desynchronize;
- RSI14 Wilder, SMA20, EMA20 and SMA50 retained as baseline features;
- choose and name Wilder ATR14 or rolling_mean_true_range_14 explicitly;
- returns derived from analytical closes, not nullable stored percentage columns;
- robust relative volume with baseline statistic, observation count and traded-session policy;
- structural levels with kind, pivot date, confirmation date, age and touches;
- breakout/breakdown event objects with trigger date and prior-crossing condition;
- no pattern feature in the core decision until its detector is independently validated.

### 7.3 Opportunity, risk and evidence

Do not force all concepts into one score:

- **TechnicalEvidenceResult:** direction (bullish/neutral/bearish), component values and contribution, with a deliberately small orthogonal set.
- **TradingRiskResult:** volatility/gap/downside/overextension risk. Risk predicts potential adverse behavior; it is not data quality.
- **LiquidityAndCapacityResult:** tradability, expected capacity tier, no-trade share and turnover provenance.
- **DataReliabilityResult:** source quality, freshness, history completeness, corporate-action resolution.
- **OpportunityIndex:** optional backward-compatible long-setup index; never called probability. It should not contain the same risk term later used multiple more times without explicit reason.
- **EvidenceStrength:** deterministic agreement/coverage measure for the selected action. For SELL, bearish evidence is positive agreement rather than a low bullish score. It remains evidence strength until calibrated.

### 7.4 Regime

RegimeResult should include classification, as-of session, benchmark, history count, breadth coverage, index distance, breadth ratio, quality and previous state. UNKNOWN is distinct from NEUTRAL. A regime can constrain new exposure but should not fabricate stock-level bearish evidence.

### 7.5 Trade-plan feasibility

The plan is a conditional scenario, not a forecast:

- **VALID_ENTRY_PLAN:** eligible new long; stop is a genuine thesis invalidation below conservative entry; target reference exceeds conservative entry; conservative R/R passes; tick/circuit/non-fill checks pass.
- **WATCH_ONLY:** technical setup exists but structural risk, entry distance, liquidity, circuit or target makes a current trade infeasible.
- **MANAGE_EXISTING:** holder-specific invalidation/management levels, not a fresh entry plan.
- **UNAVAILABLE:** action/data does not support a plan.

Use a conservative calculation: entry at the less favorable edge of the entry zone, target at target_low, risk to the structural stop plus cost/slippage allowance. If structural stop exceeds the policy risk cap, reject the plan or reduce sizing; never move the stop away from structural meaning.

### 7.6 Authoritative action model and decision matrix

The clean model has a portfolio-neutral **stance** plus two contextual actions. The current recommendation field can remain during migration:

| Eligibility / evidence state | Risk and plan | Non-holder action | Holder action | Backward-compatible recommendation |
|---|---|---|---|---|
| Ineligible, stale, sparse, unresolved event or suspicious critical data | Not applicable | WAIT / DO NOT EVALUATE | REVIEW; no automated exit from bad data alone | WAIT |
| Bullish evidence, acceptable risk, valid entry plan, no veto | Valid | BUY | HOLD / manage with plan | BUY |
| Constructive trend but current entry infeasible/near resistance/weak participation | Acceptable but WATCH_ONLY | WAIT | HOLD if holder plan remains valid | HOLD during compatibility; later contextual fields remove ambiguity |
| Mixed/sideways evidence, no directional edge | Acceptable | WAIT | HOLD only if holder invalidation is intact; otherwise REVIEW | WAIT or HOLD based on explicit holder context |
| High/speculative or illiquid but not structurally bearish | No fresh-entry feasibility | AVOID/WAIT | REVIEW or reduce by policy, not automatic SELL | WAIT |
| Confirmed support breakdown/downtrend with reliable current data | Bearish evidence and valid downside event | AVOID | SELL/REDUCE | SELL |
| Suspected/known corporate-action discontinuity not resolved | Event review | WAIT | REVIEW | WAIT |
| Bearish pattern only, no confirmed price trigger | Unvalidated/secondary | WAIT | REVIEW/HOLD by core structure | Core action unchanged; warning is forming only |
| Confirmed, validated bearish event conflicts with bullish setup | Hard constraint | WAIT/AVOID | SELL/REVIEW per event policy | SELL or WAIT according to explicit constraint |

Decision precedence must be data eligibility → hard constraints → directional evidence → plan feasibility → contextual action. A low opportunity score alone should not mean SELL; SELL needs reliable bearish structure/event evidence. Risk alone should not mean breakdown.

### 7.7 Warning overrides

DecisionConstraints is authoritative:

- **BLOCK:** ineligible data, unresolved corporate action, suspended/circuit-unexecutable, invalid plan for a fresh BUY.
- **DOWNGRADE:** bearish regime, thin capacity, extended entry, inadequate volume evidence.
- **EXIT/AVOID:** reliable support breakdown or validated bearish event.
- **INFORMATIONAL:** near level, RSI convention, partial evidence.

The warning list is a rendering of constraints plus informational observations. No critical warning may contradict the final action without an explicit documented exception code.

### 7.8 Pulse ranking

Pulse remains a module-specific **attention score**, not a stock recommendation:

1. Exclude INELIGIBLE and REVIEW_ONLY candidates from focus; optionally show them in a separate risk monitor, not the opportunity rank.
2. Score only known evidence; missing volume/history earns no positive default.
3. Remove repeated moving-average/trend counting or demonstrate incremental value.
4. Apply a stable tie order and record candidate-pool size/coverage.
5. Enforce a real sector-cap policy, with any exception based on a predefined score gap and shown in audit metadata.
6. Make monitor candidates disjoint from focus.
7. Store point-in-time Pulse snapshots before showing history/change claims.
8. Market-level breadth and sector leadership must use current-session eligible rows only.

### 7.9 Authoritative output

The first authoritative result should be deliberately small. A versioned CanonicalDecisionResult needs only the metadata required to explain and share a current decision safely:

- stock_id and exchange;
- strategy_version;
- as_of_date and calculated_at;
- shared_decision_id;
- result_semantics for each 0–100 value;
- compatibility recommendation, evidence strength, opportunity/risk summaries and trade-plan feasibility;
- primary_reason, with a short ordered reason list only where already available.

Input hashes, complete source/event revision lineage, replay manifests and full audit payloads are valuable, but they are Phase 7 hardening work. They should not block correction or centralization of the live deterministic engine.

Universe/list, detail, signals, dashboard, scanner and watchlist consume this identity. Detail may add patterns, valuation, ownership and events, but must not silently recompute core action with different inputs.

## 8. Centralization and consistency plan

### What remains centralized

- Analytical price-series selection and row validation.
- RSI/SMA/EMA/ATR/returns/relative volume and structural level definitions.
- DataEligibilityResult, LiquidityAndCapacityResult and DataReliabilityResult.
- TechnicalEvidenceResult, TradingRiskResult and canonical constraints.
- Canonical action matrix, trade-plan feasibility and audit metadata.
- Strategy/threshold versions and effective-dated market policy inputs.

### What remains module-specific

- Pattern detection and detail-only explanatory panels.
- Market regime as a separate market-context domain result.
- Market Pulse attention score/selection, consuming canonical eligible rows.
- Scanner strategy predicates, provided they consume shared features/eligibility and have explicit scanner versions.
- Dashboard descriptive market breadth/mood, with distinct names and no action inference.
- Chart annotations, clearly presentation-only.

### Pure domain boundaries

A practical non-monolithic layout:

- decision/data_eligibility.py — analytical series and eligibility policy.
- decision/technical.py — pure technical features.
- decision/levels.py or a retained technical.py section — structural levels/events.
- decision/liquidity.py — liquidity/capacity.
- decision/risk.py — market/trading risk.
- decision/evidence.py — directional evidence and evidence strength.
- decision/constraints.py — veto/downgrade policy.
- decision/trade_plan.py — feasibility and plans.
- decision/recommendation.py — small explicit matrix.
- decision/engine.py — orchestration only.

Splitting is warranted only as files become independently owned/tested; the key is one authoritative implementation per meaning, not a large rewrite.

### Reusable calculation result models

Use frozen dataclasses internally and typed Pydantic read models at boundaries. Do not pass bare 0–100 integers without:

- result semantics;
- direction where relevant;
- strategy version;
- as-of date;
- a primary reason.

Known/missing component counts, full contributions and constraint traces may be added when a consumer has a concrete need; they are not mandatory for the first shared result.

### Legacy trading_signals

- Stop treating “latest active across all strategies” as prior canonical action.
- Preserve old rows as LEGACY_EXTERNAL or LEGACY_UNVERSIONED.
- New snapshots use a distinct table/model or mandatory strategy_id/version fields.
- Never overwrite live action; expose relationship as historical comparison only.
- A scheduled deterministic snapshot must call the same canonical engine with an explicit as-of cut and store the early essential identity.
- WAIT must be representable, or historical taxonomy must be explicitly mapped with an UNKNOWN/NOT_COMPARABLE result.

### Current versus historical

- **Current live decision:** latest completed/declared market snapshot under the current strategy version.
- **Historical signal:** immutable output calculated using information available at signal_as_of and the strategy version then in force.
- **Recalculated historical scenario:** clearly labeled replay under a newer strategy; never replaces original history.
- Corporate actions and fundamentals/categories must be point-in-time. Detailed revision lineage is added with the backtesting/hardening work.

### List, detail, scanner, Pulse and frontend

- Universe publishes the canonical result or a compact projection of it.
- Detail fetches the same result identity and adds expensive enrichments.
- Watchlist consumes the canonical compact result; holding status selects holder_action without recomputing evidence.
- Scanner consumes eligibility/features and returns condition matches or uses backend versioned predicates; it never duplicates market thresholds.
- Pulse consumes eligible compact results and owns only attention ranking.
- Frontend formats, filters, sorts on named server fields, chooses holder/non-holder action, and renders explanations. It does not calculate action, risk, evidence, support/resistance, breakout, or scanner business thresholds.
- Legacy market-intelligence calculations remain chart fallback only during migration, then are removed.

### Versioning and backward compatibility

- Add fields; do not initially remove recommendation, confidence, opportunity_score or risk_label.
- Mark confidence_semantics = HEURISTIC_EVIDENCE and strategy_version in the same release.
- Keep compatibility recommendation mapping while new holder_action/non_holder_action migrate.
- Early cache identity includes exchange, session and strategy version.
- A threshold change increments threshold_version even if API schema does not change.
- Persisted and cached old versions remain readable but never compared silently with a new version.
- Remove old calculations only after consumer and contract search tests prove no authoritative use.

Input hashes, data/event revision keys, lineage-aware invalidation and replay identity are deferred to Phase 7 after the shared live result is stable.

## 9. Calibration and backtesting plan

This section describes the full validation direction. Phase 6 implements the practical minimum: chronological replay, explicit execution/cost assumptions, simple baselines, core outcome/rank metrics and a small sensitivity grid. Complete revision lineage, large subgroup matrices, extensive multiple-testing controls and institutional-grade independent validation belong to Phase 7 or later.

### 9.1 Prerequisites

Do not backtest current raw tables as if they were point-in-time truth. First establish:

- the best available historical membership, category, suspension and sector state, with missing point-in-time coverage disclosed rather than silently filled;
- corporate-action events and analytical adjustment factors;
- source/provenance sufficient to distinguish reported, estimated and unresolved data;
- exchange sessions/holidays;
- reliable OHLCV, reported versus estimated turnover, zero-volume and no-trade semantics;
- point-in-time benchmark and breadth;
- deterministic as-of engine entry point that cannot query future rows.

Complete source-revision lineage is not a prerequisite for the first useful backtest; it is Phase 7 hardening.

### 9.2 Signal timestamp and execution

- Primary signal time: after the DSE/CSE session data used by the engine is complete and quality checks pass. Store signal_as_of as exchange session close and calculated_at separately.
- No same-close execution using that close's data.
- Baseline execution: next eligible trading session open, only if open is reliable and an order could trade within the applicable circuit. Secondary conservative scenario: next eligible close.
- If volume is zero, stock is suspended, locked at circuit, or the assumed order exceeds capacity, record no fill/delayed fill; do not carry forward an imaginary execution automatically.
- For current intraday snapshots, maintain a separate snapshot strategy identity; do not compare its incomplete-bar output with EOD results.

### 9.3 Outcomes and horizons

Evaluate multiple predeclared outcomes:

- 5-, 10- and 20-valid-trading-session raw and benchmark/sector-relative returns;
- maximum favorable excursion and maximum adverse excursion;
- first passage of conservative target versus structural stop, with same-day ambiguity resolved pessimistically unless intraday ordering exists;
- support-break/failure and breakout follow-through rates;
- holder exit outcomes separately from non-holder entries;
- no-trade/WAIT opportunity cost and avoided drawdown.

Probability calibration requires one precise binary event per score, for example: “positive DSEX-relative return after costs at 10 valid sessions” or “target before stop within 20 valid sessions.” Do not calibrate one number against shifting outcomes.

### 9.4 Benchmarks and baselines

- DSEX total/price benchmark as supported by available point-in-time data;
- sector benchmark;
- equal-weight eligible universe;
- liquidity-matched universe;
- simple predeclared baselines: price above SMA20, price>SMA20>SMA50, RSI-only convention, and no-trade;
- current engine versus each proposed refinement with identical execution/cost assumptions.

### 9.5 Metrics

**Decision quality**

- count and coverage by action;
- forward raw/excess return distribution and median;
- directional precision/hit rate for BUY and SELL/AVOID;
- MFE, MAE and downside tail quantiles;
- stop/target incidence and time-to-event;
- false-break and failed-rebound rate.

**Economic strategy**

- net return, maximum drawdown and win/loss;
- turnover, exposure, average holding period and trade count;
- percent unfilled/delayed and performance after costs/slippage;
- concentration by symbol, sector, category and liquidity.

**Scores/ranks**

- Spearman rank information coefficient for forward excess returns;
- top-k lift versus eligible universe, precision@5, rank stability/turnover;
- monotonic outcome curves across opportunity/risk/evidence/Pulse buckets;
- a focused component-ablation comparison.

**Calibration**

- reliability diagrams with sample counts and confidence intervals;
- Brier score for a defined probability;
- discrimination separately from calibration;
- no probability label if buckets are non-monotonic or underpowered.

Sharpe/Sortino, expected shortfall, detailed calibration decomposition, capacity modeling and broader statistical intervals are useful Phase 7 extensions, not minimum Phase 6 acceptance gates.

### 9.6 Chronological protocol

- Reserve a final untouched test period before parameter work when history is sufficient.
- Use rolling or expanding walk-forward windows; all calibration/training dates precede validation dates.
- Parameters are selected only on training/validation folds. Evaluate the frozen test once.
- Prevent overlapping outcome labels from leaking across fold boundaries; use explicit purging when needed.
- Preserve point-in-time universe membership; never backfill today's active list into history.
- Create all swing/pattern events from the prefix available at that date. A pivot is usable only on its confirmation date.
- Record strategy version and explicit data cutoff. Full data-revision replay lineage is Phase 7.

### 9.7 Parameter sensitivity and data-snooping controls

- Pre-register a small economically motivated grid, not hundreds of indicator combinations.
- Perturb the material thresholds/weights most likely to change actions or rank.
- Prefer broad stable plateaus over a single optimum.
- Compare component removal as well as addition.
- Report the tried variants. If selection becomes extensive, keep conclusions exploratory until later multiple-testing controls are added.
- Freeze the smallest coherent model that survives ablation.

### 9.8 Costs, liquidity and non-trading

- Parameterize current broker commission, exchange/clearing/regulatory fees, taxes and VAT from effective-dated primary sources at implementation time.
- Slippage model tiers by median reported turnover, no-trade share, price, free float where reliable, and order as percent of typical daily turnover.
- Apply higher cost/non-fill assumptions for thin/Z/category-transition/circuit-adjacent names.
- Do not use close×volume estimated turnover as if reported without sensitivity bounds.
- Model limit orders, tick size, daily price limits, gaps through stops, partial fill and locked circuit.
- Treat non-trading days as missing execution opportunities, not zero-cost flat returns.

### 9.9 Proportionate stratification

The minimum Phase 6 report stratifies principal results by market regime, sector and liquidity/traded-session bucket, plus category or data quality when sample size is adequate. Always show sample counts.

Category transitions, free float, price/circuit bands, corporate-action proximity, history length, source revisions and stressed-subperiod matrices are Phase 7 extensions. Add them earlier only when the corresponding safeguard or finding is under direct review.

### 9.10 Acceptance and failure criteria

Acceptance thresholds must be written before the frozen test is viewed. At minimum:

- no known look-ahead violation and an explicit survivorship/coverage limitation statement;
- the required phase-level correctness, invariant and consistency tests pass;
- eligible coverage and exclusions are reported, not hidden;
- score buckets are directionally monotonic or the score is not marketed as ordinal evidence;
- material conclusions do not disappear under the small predeclared sensitivity grid;
- economic performance is reported after all modeled costs and non-fills;
- no result depends primarily on one stock/sector or a handful of events;
- any exposed probability beats a declared base-rate forecast on held-out Brier score and has a defensible reliability plot;
- Pulse top-k demonstrates stable incremental lift/capacity over simple baselines before “opportunity” claims.

Failure includes:

- same-close execution, future-confirmed pivots, revised future categories/actions, or present-day survivorship;
- sign reversal under small parameter changes;
- benefit disappearing after realistic cost/liquidity treatment;
- non-monotonic confidence/probability with inadequate sample;
- unacceptable tail loss in thin/speculative buckets;
- no improvement over a simpler baseline;
- missing strategy version or as-of cutoff.

No acceptance result proves future predictive performance. It supports a bounded, versioned claim under the tested data and execution assumptions.

Phase 7 may raise these gates with full replay lineage, broader subgroup validation, richer tail/capacity metrics, multiple-testing controls and independent review.

## 10. Prioritized implementation roadmap

This is the normative implementation roadmap for Codex Desktop using GPT-5.6 Sol High. It uses seven substantial phases: each phase groups one coherent domain, preserves current API fields where practical, and ends with a usable, reviewable system state. UI layout, page flow and visual redesign remain out of scope; only necessary terminology and data-contract changes are included.

The minimum test gate is risk-based. Exact regression, boundary, invariant, chronology and cross-surface tests are required where a defect could change a trading decision; broad property suites, mutation testing, large golden catalogs, full fuzzing, replay manifests and institutional validation are deferred to Phase 7 or later.

### Phase 1 — Correctness fixes and honest result semantics

> Correct the known P0 contradictions without redesigning the decision model.  
> End with the current engine safer, internally consistent and honest about what its scores mean.

- **Major scope:** fix below-support branch ordering; add minimum trade-plan ordering/feasibility guards so invalid or missing plans cannot support BUY; stop untriggered flags/triangles from becoming confirmed/critical; keep symmetrical patterns neutral until a price trigger; replace probability claims with evidence-score semantics; mark current confidence as heuristic evidence; remove mixed Pulse opportunity history and fabricated sector money-flow values.
- **Key files/modules:** decision/scoring.py, trade_plan.py, patterns.py, breakout.py, warnings.py, stock_details_decision_service.py, market_pulse_briefing.py, relevant schemas and terminology/types.
- **Required minimum tests:** exact below/at/above-support regression; trade-plan stop/entry/target invariant cases and BUY guard; one triggered and one untriggered bearish/bullish pattern case; neutral symmetrical-triangle case; Pulse all-positive/all-negative/all-flat aggregation; API compatibility/semantics assertion.
- **Dependencies:** none. This phase intentionally works within the existing architecture and data model.
- **Stable completion criteria:** all P0 formula/output contradictions addressed; old response fields remain readable; current endpoints and pages continue to work; no BUY can carry an invalid plan; no 0–100 heuristic is presented as calibrated probability.
- **Expected complexity:** L, but bounded to correctness and semantics rather than score redesign.

### Phase 2 — Data correctness and DSE/CSE safeguards

> Make the analytical input series and candidate eligibility suitable for Bangladesh-market conditions.  
> End with unreliable, stale, non-trading or corporate-action-distorted inputs failing safely before recommendation or ranking.

- **Major scope:** derive analytical returns/volatility from consistent closes when stored changes are null; make OHLC validation atomic; choose and document Wilder ATR14 or rename the rolling true-range mean; use official-session staleness; add a practical EligibilityResult covering valid history, traded-session ratio, zero volume, latest/window quality, median/robust turnover, reported-versus-estimated turnover, suspension/category/circuit state where available; supply known ex-date context consistently; treat unresolved discontinuities as REVIEW_ONLY/WAIT. Implement adjusted corporate-action series only when verified source data is available; otherwise retain the conservative block rather than invent factors.
- **Key files/modules:** market_data_service/repository/schemas.py, stock_details ingestion/repository, models.py if additive fields are needed, decision/technical.py, engine.py, a focused data_eligibility.py/liquidity.py module, universe input loading and exchange-session helpers.
- **Required minimum tests:** known RSI/SMA/EMA/ATR fixtures; null stored changes with valid closes; out-of-order and one malformed OHLC row; zero-volume and low traded-session examples; stale versus holiday/session case; low/estimated-turnover cases; known ex-date, unresolved large gap and genuine downtrend/crash; list/detail eligibility equality.
- **Dependencies:** Phase 1 semantics and safe WAIT behavior. If a reliable corporate-action source is unavailable, the phase remains complete with conservative unresolved-event exclusion.
- **Stable completion criteria:** fresh BUY/focus candidates use sufficient valid traded history and current-session data; volatility no longer disappears solely because ingestion left change percentages null; list/detail share the same ex-date eligibility; unresolved corporate actions cannot create directional decisions.
- **Expected complexity:** L.

**Interim generic-PARTIAL recovery policy (implemented 2026-07-15):** retain the 50-session quality window, but do not apply the `excessive_partial_history` LIMITED status when the most recent 20 sessions contain no more than 10% `PARTIAL` rows. This prevents older source-completeness gaps from suppressing a fresh, valid analytical series. It does not waive invalid/latest OHLC, stale-session, zero-volume, suspicious-quality, turnover, category, or corporate-action safeguards. The permanent Phase 2 outcome remains separate analytical-OHLCV validity from generic source-field partiality.

### Phase 3 — Decision logic, risk, evidence and trade-plan coherence

> Refine the model only after inputs and immediate correctness are stable.  
> End with explicit action precedence, direction-aware evidence and warnings that cannot contradict the recommendation.

- **Major scope:** separate data reliability, liquidity/tradability, trading risk and directional evidence conceptually while retaining compatibility opportunity/risk fields; reduce obvious correlated double counting; make evidence strength direction-aware for BUY and SELL; define authoritative constraints before recommendation; introduce holder/non-holder action semantics with a compatibility recommendation; rebuild primary reason ownership; complete trade-plan feasibility without moving stops above structural invalidation; keep patterns secondary until validated.
- **Key files/modules:** decision/scoring.py, trade_plan.py, engine.py, warnings.py, summary.py and, where useful, focused evidence.py, constraints.py and recommendation.py modules; decision schemas.
- **Required minimum tests:** exact recommendation boundaries that can change BUY/HOLD/WAIT/SELL; bullish/ bearish mirror evidence case; stale/suspicious/liquidity degradation cases; hard-veto precedence; holder versus non-holder matrix; primary-reason regression; deep structural stop, missing resistance and poor R/R plan cases.
- **Dependencies:** Phase 2 feature/eligibility outputs. The phase must consume them but does not require backtesting to correct semantics and precedence.
- **Stable completion criteria:** one explicit decision table covers every output; SELL requires reliable bearish evidence rather than high risk alone; critical constraints and warnings agree with the action; compatibility API fields remain stable; every BUY has a valid entry plan.
- **Expected complexity:** L.

### Phase 4 — Authoritative decision ownership and cross-surface consistency

> Centralize the shared decision result without turning the engine into a monolith.  
> End with list, detail, watchlist, signals and dashboard consuming the same decision identity for a stock/date/version.

- **Major scope:** introduce a compact CanonicalDecisionResult with strategy_version, as_of_date, calculated_at, shared_decision_id, result semantics and primary reason; make universe the reusable compact source; make detail reuse or recreate through the same input factory; remove watchlist fallback recomputation; formalize persisted-signal comparison as comparable/not-comparable using strategy/version/date; quarantine and then remove client action/risk/RSI/level duplication once consumers are proven migrated; add exchange/session/strategy-version cache identity.
- **Key files/modules:** decision engine/summary/schemas, market_universe compute/service/cache/schemas, stock-details decision/workspace service, watchlists service, signals model/service/repository, frontend universe mappers, trader-decision.ts and legacy market-intelligence.ts consumers.
- **Required minimum tests:** one normal and one ex-date/stale fixture across universe, detail and watchlist; signal-center/dashboard mapper consistency; persisted matching-version prior signal versus mismatched legacy signal; backend-unavailable frontend fallback to WAIT; cache version separation.
- **Dependencies:** Phases 1–3 produce the stable result to centralize. Until migration completes, additive fields and compatibility projections keep every endpoint usable.
- **Stable completion criteria:** repository search finds one authoritative stock action calculation; all major surfaces agree on core fields for the same shared_decision_id; watchlist no longer calculates a parallel decision; legacy client formulas cannot drive action badges.
- **Expected complexity:** L.

### Phase 5 — Market Pulse and scanner alignment

> Align ranking and scanning with canonical eligibility and decision meaning.  
> End with deterministic top-five/focus and scanner results that cannot reintroduce unsafe or mislabeled candidates.

- **Major scope:** apply eligibility before Pulse scoring; make missing evidence neutral/unknown rather than positive; simplify overlapping Pulse components; add stable tie ordering, enforce a documented sector rule and keep monitor candidates disjoint; use only same-session eligible rows in breadth/sector summaries; keep history absent until comparable snapshots exist; replace unsupported institutional/flow narratives. Move scanner business predicates to backend/shared domain results, remove duplicated liquidity floors, separate high-risk watch from compression and breakdown, require valid rebound/breakout events, and use meaningful deterministic ordering.
- **Key files/modules:** market_pulse/pulse_score.py, market_pulse_service.py, market_pulse_briefing.py and schemas/tests; a focused scanner domain/service or canonical condition fields; frontend scanner workspace/language and trader-decision helpers.
- **Required minimum tests:** Pulse eligibility exclusion, missing-volume behavior, threshold/tie and third-same-sector cases, monitor disjointness, same-session breadth, no fabricated sector side; scanner truth-table examples for breakout, rebound, breakdown, risk watch and compression; stable ordering; scanner/detail badge consistency.
- **Dependencies:** Phase 4 canonical compact result and Phase 2 eligibility. Pulse and scanner continue using existing responses until their individual migration is complete.
- **Stable completion criteria:** no ineligible stock enters focus/opportunity scans; top-five and scanner order are repeatable; every scanner label matches its predicate; frontend contains no duplicated trading/liquidity thresholds; Pulse remains an attention score, not a recommendation.
- **Expected complexity:** L.

### Phase 6 — Practical point-in-time backtesting and calibration

> Build the minimum credible replay needed to evaluate the deterministic engine, not an institutional research platform.  
> End with reproducible chronological results for fixed strategy versions and honest evidence/probability decisions.

- **Major scope:** prefix-only as-of replay; point-in-time universe/category/corporate-action handling to the extent historical data supports it; next-session execution assumption; zero-volume/suspension/circuit non-fill; configurable costs and simple liquidity slippage tiers; 5/10/20-session outcomes; DSEX and simple MA/RSI baselines; rolling/expanding walk-forward splits; a small predeclared parameter-sensitivity grid; decision/Pulse metrics; basic reliability diagrams/Brier score only for a precisely defined event. Record limitations when historical status/action data is incomplete.
- **Key files/modules:** backend/app/modules/backtesting, focused repositories/read models, CLI/config, strategy-version constants and research documentation.
- **Required minimum tests:** no same-close execution; prefix chronology for swings/pattern triggers; one survivorship/status fixture if data exists; corporate-action/non-trade/circuit execution cases; chronological fold boundaries; identical outputs for two runs with the same explicit configuration. Full replay manifests and hash lineage are not required yet.
- **Dependencies:** Phases 2–5. This dependency is unavoidable because backtesting inconsistent inputs or duplicate decisions would validate the wrong system; the production engine remains fully usable before this phase.
- **Stable completion criteria:** a documented command can compare the current strategy with simple baselines using chronological data and costs; results disclose coverage and excluded data; no probability wording is restored unless held-out calibration is adequate; failed validation leaves the deterministic engine usable but explicitly heuristic.
- **Expected complexity:** L.

### Phase 7 — Production hardening and deferred advanced validation

> Add operational depth only after the corrected, centralized and historically evaluated engine is stable.  
> End with durable audit/replay controls and proportionate monitoring, without blocking earlier product value.

- **Major scope:** input/data/event revision lineage, optional input hashes, reproducible replay manifests, lineage-aware cache invalidation, immutable historical decision snapshots, selected golden regressions for critical strategies, targeted property/fuzz tests for proven high-risk boundaries, optional mutation testing for recommendation precedence, broader regime/sector/liquidity validation, distribution/drift and cross-surface mismatch monitoring, runbooks, deprecation cleanup and final documentation. Large golden suites and institutional-grade independent validation remain conditional on product risk and data maturity.
- **Key files/modules:** result/persistence schemas and migrations, cache keys, backtesting artifacts, jobs/monitoring, critical test suites, legacy frontend/deprecated endpoints and analytical docs.
- **Required minimum tests:** audit metadata round-trip; approved version change separates caches/history; one replay-manifest reproduction; monitoring detects a seeded stale/mismatch condition; removed legacy paths have import/contract coverage. Advanced property, fuzz, mutation and golden expansion is risk-driven, not a blanket gate.
- **Dependencies:** Phase 6 establishes which rules and outputs merit hardening. Earlier phases remain stable and backward compatible without these advanced controls.
- **Stable completion criteria:** important historical decisions are reproducible or explicitly marked with known limitations; version/cache changes are safe; critical regressions and operational mismatches are detected; superseded calculations are removed after a deprecation window; documentation matches implementation.
- **Expected complexity:** L, divisible into independent hardening releases after the core seven-phase plan.

The phase descriptions above are the implementation authority. The prior granular inventory is retained below only for finding-to-task traceability; it must not be used as a separate sequence or as additional phase gates.

<details>
<summary>Superseded granular task inventory (non-normative reference)</summary>

### Phase 0 — Correct invalid or misleading behavior

#### 0.1 Correct signed support-distance scoring

- **Priority:** P0
- **Files affected:** decision/scoring.py; test_stock_decision_support.py.
- **Intended change:** evaluate below-support before near-support and define inclusive boundaries once.
- **Rationale:** removes a mathematical contradiction immediately.
- **Dependencies:** none.
- **Tests:** signed boundary table and monotonic property; regression that below-support long opportunity is lower than exactly-at-support under otherwise identical inputs.
- **API/migration impact:** numeric score changes only; no schema/database migration.
- **Documentation impact:** record correctness fix and threshold semantics.
- **Acceptance criteria:** below-support branch reachable; no negative distance earns near-support reward; all recommendation boundary tests pass.
- **Complexity:** S

#### 0.2 Remove probability and unqualified confidence claims

- **Priority:** P0
- **Files affected:** breakout.py, patterns.py, stock_details_schemas.py; frontend stock decision language/components/types; scoring.py/schema metadata.
- **Intended change:** expose breakout_evidence_score and pattern_match_score labels; mark current decision value as heuristic evidence strength in an additive semantics field while retaining confidence for compatibility.
- **Rationale:** prevents unsupported percentage interpretation before calibration.
- **Dependencies:** agreement on compatibility aliases.
- **Tests:** serialized field/label contracts; no “probability” or calibrated-confidence claim in core analytical copy; old clients still parse compatibility fields.
- **API/migration impact:** additive aliases/semantics first; deprecate old names later; no DB migration.
- **Documentation impact:** update stock decision and API docs.
- **Acceptance criteria:** every 0–100 value declares its meaning; no user-facing core label implies observed probability.
- **Complexity:** M

#### 0.3 Remove fabricated/mixed Market Pulse aggregates

- **Priority:** P0
- **Files affected:** market_pulse_briefing.py, market_pulse_schemas.py and Pulse tests.
- **Intended change:** stop generating opportunity history from mixed formulas; return no history until same-definition snapshots exist. Replace “money flow” with factual price leadership or empty arrays; remove synthetic ±0.1 fallback.
- **Rationale:** current outputs contain invented or incomparable values.
- **Dependencies:** optional schema compatibility decision for empty history.
- **Tests:** all-positive/all-negative/all-flat sectors; identical metric identity across history; no sign fabrication.
- **API/migration impact:** values become empty/null; schemas remain backward compatible if fields already optional/list.
- **Documentation impact:** state history unavailable pending snapshots and define sector metric.
- **Acceptance criteria:** each aggregate can be reproduced from same-session eligible inputs; no fabricated observation.
- **Complexity:** S

#### 0.4 Add immediate trade-plan invariants and BUY guard

- **Priority:** P0
- **Files affected:** trade_plan.py, scoring.py, engine.py, schemas and tests.
- **Intended change:** add feasibility status/reasons; reject plan if stop/entry/target ordering or finite positive conservative R/R fails; any fresh BUY requires VALID status. Remove R/R missing and breakout bypass loopholes unless a separate valid breakout plan exists.
- **Rationale:** prevents action from relying on invalid risk geometry.
- **Dependencies:** compatibility plan-status field.
- **Tests:** property invariants; deep support, resistance below price, 0.1% stop, missing fields, breakout and WAIT/SELL cases.
- **API/migration impact:** additive plan_status/reasons; recommendation changes on invalid cases; no DB migration.
- **Documentation impact:** define scenario plan, not forecast.
- **Acceptance criteria:** no BUY has invalid/unavailable plan; every numeric plan satisfies ordered invariants.
- **Complexity:** M

#### 0.5 Stop untriggered patterns from becoming confirmed warnings

- **Priority:** P0
- **Files affected:** patterns.py, breakout.py, stock_details_decision_service.py, warnings.py and pattern tests.
- **Intended change:** triangles/flags without crossings remain FORMING; symmetrical direction remains neutral; Active is not treated as confirmed; critical bearish warning requires explicit confirmed price trigger.
- **Rationale:** removes false event and action-warning contradictions while full detector refinement waits.
- **Dependencies:** pattern status enum compatibility.
- **Tests:** no-trigger states, symmetrical direction, warning severity, current-bar level exclusion.
- **API/migration impact:** status/direction outputs change; schema can remain.
- **Documentation impact:** exact status semantics.
- **Acceptance criteria:** no pattern gets critical “confirmed” warning without a trigger event; neutral pattern never defaults bearish.
- **Complexity:** M

#### 0.6 Introduce conservative corporate-action unresolved blocking

- **Priority:** P0
- **Files affected:** engine.py, universe compute/service, stock detail service, warnings and schemas.
- **Intended change:** pass known event context identically; when a large discontinuity is unresolved, set REVIEW_ONLY/WAIT and suppress affected return/pattern/trade-plan claims rather than declaring an adjustment or breakdown.
- **Rationale:** safe interim until adjusted series exists.
- **Dependencies:** common event query or preloaded event map.
- **Tests:** list/detail equality, known ex-date, unknown gap, genuine continued downtrend.
- **API/migration impact:** additive reason/status; more WAIT decisions around unresolved events.
- **Documentation impact:** explain conservative unresolved status.
- **Acceptance criteria:** identical core action across list/detail for same event revision; no unadjusted gap drives a fresh BUY/SELL automatically.
- **Complexity:** M

### Phase 1 — Establish authoritative decision ownership

#### 1.1 Define StrategyInput and CanonicalDecisionResult

- **Priority:** P1
- **Files affected:** decision domain models, engine.py, stock_details_schemas.py, market_universe_schemas.py.
- **Intended change:** one typed input/result with exchange session, data/event revisions, eligibility, result components, actions, reason codes and versions.
- **Rationale:** makes same-input reproducibility and ownership enforceable.
- **Dependencies:** Phase 0 semantics; version naming.
- **Tests:** serialization, deterministic equality, required metadata, no hidden date.today dependency.
- **API/migration impact:** additive fields; existing compact summary remains projection.
- **Documentation impact:** canonical contract and ownership.
- **Acceptance criteria:** every consumer can identify the exact strategy/input/as-of identity of a decision.
- **Complexity:** L

#### 1.2 Make universe output the reusable core result

- **Priority:** P1
- **Files affected:** market_universe_compute/service/schemas.py, stock_details_decision_service.py, workspace service/cache.
- **Intended change:** compute/store canonical core once per session/version; detail reuses matching core and enriches it, with controlled recompute only through the same StrategyInput factory.
- **Rationale:** eliminates list/detail input drift.
- **Dependencies:** 1.1; shared event and regime context.
- **Tests:** list/detail equality across normal, regime, ex-date, sparse and stale fixtures; cache version mismatch.
- **API/migration impact:** additive result identity; cache-key revision.
- **Documentation impact:** universe/detail flow.
- **Acceptance criteria:** same stock/session/version produces identical recommendation, evidence, risk, opportunity and primary reason on all endpoints.
- **Complexity:** L

#### 1.3 Remove watchlist decision recomputation

- **Priority:** P1
- **Files affected:** watchlists_service.py/repository/schemas.py; frontend universe-intelligence and watchlist view model.
- **Intended change:** watchlist retrieves/project canonical result by stock; holding flag selects holder_action. If canonical result is unavailable, return unavailable/WAIT rather than a different calculation.
- **Rationale:** removes known alternate engine inputs.
- **Dependencies:** 1.1–1.2.
- **Tests:** universe available/unavailable, holding/non-holder, cache miss, no regime/ex-date divergence.
- **API/migration impact:** watchlist DTO can retain trader_decision field but source/identity added.
- **Documentation impact:** correct market-universe/watchlist claims.
- **Acceptance criteria:** watchlist never calls compute_trader_decision_summary_for_stock().
- **Complexity:** M

#### 1.4 Formalize persisted historical signal ownership

- **Priority:** P1
- **Files affected:** models.py, signals schemas/repository/service/job, migrations, frontend enrichment/change helpers.
- **Intended change:** introduce versioned immutable historical signal identity; filter comparisons by matching strategy/version/taxonomy; classify legacy rows.
- **Rationale:** current “latest active” signal is not comparable to live action.
- **Dependencies:** 1.1 action taxonomy/version.
- **Tests:** like-for-like prior detection, mismatched strategy ignored, WAIT support, correction/replay identities.
- **API/migration impact:** additive columns/table and data migration label for legacy rows; do not rewrite old values.
- **Documentation impact:** historical versus live contract.
- **Acceptance criteria:** a NEW/upgrade comparison always cites matching strategy version and immediately prior valid session.
- **Complexity:** L

#### 1.5 Quarantine and retire client analytical duplication

- **Priority:** P1
- **Files affected:** frontend/lib/market/market-intelligence.ts, universe mappers, trader-decision.ts, chart/view-model consumers and tests.
- **Intended change:** prove action/risk/RSI/levels consumers use backend fields; rename retained fallback to chart-only; remove generateSignal/inferRisk and duplicate RSI/levels when no longer consumed.
- **Rationale:** prevents accidental reactivation of inconsistent formulas.
- **Dependencies:** stable canonical API.
- **Tests:** import/usage denylist; unavailable backend always WAIT; backend values win; chart annotations cannot change action.
- **API/migration impact:** frontend internal only.
- **Documentation impact:** frontend responsibility boundary.
- **Acceptance criteria:** repository search finds one authoritative action calculation and one stock technical calculation.
- **Complexity:** M

### Phase 2 — Calculation and data correctness

#### 2.1 Build point-in-time corporate-action analytical series

- **Priority:** P0/P1
- **Files affected:** market/stock-details ingestion, models/migrations, corporate-action repository/service, technical input builder.
- **Intended change:** ingest effective-dated splits/bonus/rights/dividend events or verified adjustment factors; construct adjusted analytical OHLCV and raw execution series with provenance/revision.
- **Rationale:** necessary for correct indicators and historical replay.
- **Dependencies:** reliable source selection and reconciliation policy.
- **Tests:** event fixtures, multiple actions, volume/share adjustment, late correction, source conflict.
- **API/migration impact:** new factor/provenance fields or table; backfill job; backward-compatible raw columns.
- **Documentation impact:** source priority and adjustment methodology.
- **Acceptance criteria:** every eligible historical row can identify analytical/raw price and adjustment lineage; unresolved events are ineligible.
- **Complexity:** L

#### 2.2 Correct return, volatility and ATR input construction

- **Priority:** P1/P2
- **Files affected:** technical.py and ingestion validation/tests.
- **Intended change:** atomic OHLC rows; derive analytical close-to-close returns even if stored change is null; explicitly implement Wilder ATR14 or rename rolling TR mean; retain raw daily move separately.
- **Rationale:** current historical rows can make volatility disappear and malformed data can misalign ATR.
- **Dependencies:** 2.1 analytical series selection.
- **Tests:** exact SMA/EMA/RSI/ATR series; null stored changes with valid closes; malformed OHLC.
- **API/migration impact:** possible additional raw/analytical volatility fields; no breaking removal.
- **Documentation impact:** exact formulas/units.
- **Acceptance criteria:** known fixtures match independent results; volatility exists whenever enough valid analytical closes exist.
- **Complexity:** M

#### 2.3 Implement data eligibility and robust liquidity/capacity

- **Priority:** P1
- **Files affected:** new data_eligibility/liquidity domain modules, engine, universe schemas/service, trading constants/policy data.
- **Intended change:** official-session staleness, valid/traded session ratios, window quality coverage, median/trimmed turnover, no-trade share, provenance, free float/status/category/circuit inputs and capacity tier.
- **Rationale:** DSE/CSE low-liquidity/stale-price reality must constrain candidates before scoring.
- **Dependencies:** 2.1; exchange calendar/status sources; position-size policy.
- **Tests:** zero volume, stale prices, low free float, mixed quality, suspension, circuit, estimated turnover, holidays.
- **API/migration impact:** additive EligibilityResult/LiquidityAndCapacityResult; policy version; perhaps status history tables.
- **Documentation impact:** eligibility and Bangladesh safeguards.
- **Acceptance criteria:** all focus/scanner/BUY candidates are ELIGIBLE under the same policy; exclusions include machine-readable reasons.
- **Complexity:** L

#### 2.4 Refine levels and canonical breakout/breakdown events

- **Priority:** P1/P2
- **Files affected:** technical.py or new levels.py; breakout.py; schemas; scanner/Pulse consumers.
- **Intended change:** pre-event trigger levels with metadata; prior-close crossing, buffer/tick and current-session rules; setup/event/retest/failure states; symmetric downside.
- **Rationale:** prevents persistent and pattern-dependent event misclassification.
- **Dependencies:** 2.1–2.3.
- **Tests:** crossing/event chronology, no repeat event, retest/failure, missing volume, corporate action, support/resistance edge cases.
- **API/migration impact:** additive event object; keep is_breakout compatibility boolean derived from event.
- **Documentation impact:** event definitions.
- **Acceptance criteria:** event is point-in-time reproducible and never uses the current bar in its own prior trigger.
- **Complexity:** L

#### 2.5 Harden market regime inputs

- **Priority:** P1
- **Files affected:** market_regime.py, summary ingestion/repositories, engine result.
- **Intended change:** minimum history, same-session breadth, coverage/quality, UNKNOWN state, optional hysteresis and audit fields.
- **Rationale:** regime currently changes actions with weak or misaligned context.
- **Dependencies:** exchange session identity.
- **Tests:** transitions, short history, missing breadth, misalignment, unchanged-heavy market, deterministic repeat.
- **API/migration impact:** additive regime metadata and possibly UNKNOWN enum.
- **Documentation impact:** exact classifier limitations.
- **Acceptance criteria:** no directional regime without sufficient aligned data; transition reason is auditable.
- **Complexity:** M

### Phase 3 — Decision-model coherence

#### 3.1 Split data reliability, liquidity, trading risk and directional evidence

- **Priority:** P1
- **Files affected:** scoring.py refactored into small pure modules, engine/result schemas, constants.
- **Intended change:** remove category/data quality/liquidity from an opaque single interpretation; create separate typed results and a smaller directional evidence index; run correlation/ablation before retaining components.
- **Rationale:** reduces double counting and clarifies what each score means.
- **Dependencies:** Phase 2 feature correctness and eligibility.
- **Tests:** component bounds/contributions, missing evidence, direction symmetry, monotonic risk/reliability degradation.
- **API/migration impact:** additive results; compatibility opportunity/risk projection maintained.
- **Documentation impact:** formula/version definitions.
- **Acceptance criteria:** no component is counted twice without an explicit documented transformation; every score has one meaning.
- **Complexity:** L

#### 3.2 Implement the contextual action matrix and authoritative constraints

- **Priority:** P1
- **Files affected:** new constraints/recommendation modules, engine, warnings, schemas, watchlist mapping.
- **Intended change:** explicit precedence and holder/non-holder actions; critical constraints computed before action; primary reason stored separately.
- **Rationale:** resolves HOLD/WAIT/SELL ambiguity and warnings contradiction.
- **Dependencies:** 3.1 and plan feasibility.
- **Tests:** full decision table, every boundary ±epsilon, veto precedence, holder/non-holder cases, primary reason.
- **API/migration impact:** additive stance/non_holder_action/holder_action/constraints; compatibility recommendation.
- **Documentation impact:** decision matrix and action semantics.
- **Acceptance criteria:** exhaustive table covers every result; no critical constraint conflicts with output.
- **Complexity:** L

#### 3.3 Rebuild evidence strength directionally

- **Priority:** P1
- **Files affected:** evidence/scoring module, schemas, Pulse/sort consumers.
- **Intended change:** evidence coverage/agreement by selected direction, separate from data reliability and risk; no probability claim.
- **Rationale:** current confidence is bullishness reused as reliability.
- **Dependencies:** 3.1–3.2.
- **Tests:** bullish/bearish mirror, mixed evidence, missing inputs, data-quality independence, deterministic caps.
- **API/migration impact:** evidence_strength canonical; confidence compatibility alias with semantics metadata.
- **Documentation impact:** score interpretation.
- **Acceptance criteria:** SELL strength rises with coherent bearish evidence; worsening data reliability never raises trust.
- **Complexity:** M

#### 3.4 Complete trade-plan and pattern refinement

- **Priority:** P1/P2
- **Files affected:** trade_plan.py, patterns.py, breakout.py, constraints.
- **Intended change:** structural plan/capacity/cost/circuit treatment; validated status lifecycle for patterns; patterns remain secondary until empirical acceptance.
- **Rationale:** Phase 0 guards invalidity; this phase makes the models coherent.
- **Dependencies:** canonical levels/events, liquidity and action matrix.
- **Tests:** complete plan/pattern chronology and invariants.
- **API/migration impact:** richer additive metadata; old fields remain projections.
- **Documentation impact:** scenario/reference terminology.
- **Acceptance criteria:** no plan rewrites invalidation to pass risk; no pattern affects action without a validated policy version.
- **Complexity:** L

### Phase 4 — Pulse and scanner consistency

#### 4.1 Rebuild Pulse eligibility, score and top-five selection

- **Priority:** P1
- **Files affected:** pulse_score.py, market_pulse_service.py, schemas/tests/constants.
- **Intended change:** eligible pool first; zero for missing evidence; decorrelated attention components; explicit stable ties; real sector policy; disjoint monitor; point-in-time score identity.
- **Rationale:** ensures rank means comparable attention among tradable candidates.
- **Dependencies:** Phases 1–3.
- **Tests:** exact component table, missing values, exclusions, ties, sector rules, repeated execution.
- **API/migration impact:** score_version and candidate coverage fields; score/ranks will change.
- **Documentation impact:** precise attention definition.
- **Acceptance criteria:** no ineligible focus stock; top-five and ties reproducible; documented sector rule always holds.
- **Complexity:** L

#### 4.2 Correct Pulse market aggregation and narratives

- **Priority:** P1
- **Files affected:** market_pulse_briefing.py/service.py and tests.
- **Intended change:** same-session eligible breadth; factual sector price leadership; true snapshot history; correct baseline labels; remove institutional/accumulation/flow causality.
- **Rationale:** aligns story with available evidence.
- **Dependencies:** 4.1 and stored Pulse snapshots for history.
- **Tests:** session coverage, all sign cases, narrative-field trace, history version boundaries.
- **API/migration impact:** additive coverage/version; renamed semantic labels may be copy-only.
- **Documentation impact:** aggregation definitions.
- **Acceptance criteria:** every numerical/history/narrative claim maps to a documented calculation using consistent data.
- **Complexity:** M

#### 4.3 Move scanner business predicates to an authoritative domain

- **Priority:** P1
- **Files affected:** new backend scanner service/domain/schema/router or versioned shared server condition result; frontend scanner workspace/language.
- **Intended change:** named pure predicates over canonical eligibility/features; separate breakout, rebound, momentum, breakdown, high-risk watch and compression; analytical ranking.
- **Rationale:** removes duplicated thresholds and mislabeled client logic.
- **Dependencies:** canonical events/eligibility/action.
- **Tests:** condition truth tables, ordering, exclusions, consistency with detail.
- **API/migration impact:** new/additive endpoint or fields; frontend migration without redesign.
- **Documentation impact:** scanner condition specification/version.
- **Acceptance criteria:** frontend contains no liquidity/risk/technical business thresholds; each result includes condition reason and version.
- **Complexity:** L

#### 4.4 Add cross-surface consistency contracts

- **Priority:** P1
- **Files affected:** backend integration/contract tests and frontend mapping tests.
- **Intended change:** one fixture/session checked across universe, signal list, detail, watchlist, scanner and Pulse eligibility.
- **Rationale:** prevents future divergence.
- **Dependencies:** 4.1–4.3.
- **Tests:** normal/ex-date/stale/illiquid/regime/version/cache cases.
- **API/migration impact:** none beyond prior tasks.
- **Documentation impact:** consistency guarantee.
- **Acceptance criteria:** core identity and action fields match everywhere; only documented module-specific projections differ.
- **Complexity:** M

### Phase 5 — Historical validation

#### 5.1 Implement a point-in-time deterministic replay engine

- **Priority:** P1
- **Files affected:** backtesting module, repositories, data snapshots/policies, CLI/config, test fixtures.
- **Intended change:** prefix-only as-of replay with point-in-time universe/events/categories/regime, next-session execution, cost/slippage/non-fill, outcome store and reproducible run manifest.
- **Rationale:** predictive and calibration claims are impossible without it.
- **Dependencies:** complete Phase 2 data and versioned engine.
- **Tests:** deliberate leakage traps, survivorship fixtures, same-close prevention, corporate action, circuit/non-trade, reproducible run hash.
- **API/migration impact:** internal research tables/artifacts; no production action API change.
- **Documentation impact:** backtest methodology/runbook.
- **Acceptance criteria:** independent rerun of a manifest yields identical signals/fills/metrics; all leakage traps fail closed.
- **Complexity:** L

#### 5.2 Run component ablation, walk-forward calibration and frozen test

- **Priority:** P1
- **Files affected:** research configs/results and approved constants/version after review.
- **Intended change:** evaluate simple baselines, current model and reduced candidates; pre-register sensitivity and acceptance; calibrate only on chronological folds; evaluate frozen test once.
- **Rationale:** establishes whether heuristics add robust value.
- **Dependencies:** 5.1.
- **Tests:** research pipeline correctness, fold boundaries, parameter manifest and multiple-testing record.
- **API/migration impact:** threshold/strategy version increment only after approval.
- **Documentation impact:** model card with both positive and negative results.
- **Acceptance criteria:** Section 9 criteria met; otherwise retain experimental labels and remove unsupported components.
- **Complexity:** L

#### 5.3 Calibrate or permanently relabel evidence/probability outputs

- **Priority:** P1
- **Files affected:** evidence/pattern/breakout score schemas, calibration artifacts, docs.
- **Intended change:** for each defined outcome/horizon, produce held-out reliability analysis; only expose probability if sufficiently calibrated and stable.
- **Rationale:** closes the semantic gap responsibly.
- **Dependencies:** adequate sample from 5.2.
- **Tests:** calibrator trained only on prior folds; reliability sample counts; fallback on version/regime shift.
- **API/migration impact:** optional new calibrated_probability with outcome/horizon/version; evidence score remains.
- **Documentation impact:** exact probability event and limitations.
- **Acceptance criteria:** held-out calibration acceptance met; otherwise no probability field.
- **Complexity:** M/L

### Phase 6 — Production hardening

#### 6.1 Add strategy/audit metadata and versioned cache identity

- **Priority:** P1
- **Files affected:** result schemas, caches/keys, universe/Pulse/workspace services, signal persistence and migrations.
- **Intended change:** strategy/threshold/data/event versions, signal_as_of, calculated_at, input hash/revision on all outputs and cache keys.
- **Rationale:** makes historical explanation and cache correctness possible.
- **Dependencies:** 1.1 and validated strategy.
- **Tests:** old/new cache separation, version bump invalidation, audit round-trip.
- **API/migration impact:** additive fields and persistence columns/table.
- **Documentation impact:** audit identity.
- **Acceptance criteria:** any displayed decision can be replayed or explicitly marked unreplayable with its exact identity.
- **Complexity:** M

#### 6.2 Add regression, monitoring and drift controls

- **Priority:** P1/P2
- **Files affected:** tests, jobs/monitoring, data-quality metrics, runbooks.
- **Intended change:** golden decision snapshots by strategy version; distribution monitors for actions/scores/eligibility/missing fields; cross-surface mismatch and data-source revision alerts.
- **Rationale:** deterministic does not mean stable when data and thresholds change.
- **Dependencies:** versioned outputs.
- **Tests:** seeded drift/mismatch alerts and no false alert on approved version bump.
- **API/migration impact:** admin/telemetry only; no user UI requirement.
- **Documentation impact:** operational thresholds and incident response.
- **Acceptance criteria:** unexpected score/action distribution shift, stale universe, or cross-surface mismatch is detected within one scheduled cycle.
- **Complexity:** M

#### 6.3 Remove deprecated calculations and update documentation

- **Priority:** P2
- **Files affected:** legacy frontend helpers, deprecated price-window decision embedding, dead constants/jobs as approved; all analytical docs.
- **Intended change:** delete unused/duplicate paths after telemetry and contract proof; document exact canonical formulas, versions, inputs and limitations.
- **Rationale:** completes one-source ownership without a monolith.
- **Dependencies:** all consumers migrated; deprecation window completed.
- **Tests:** repository denylist/search, API compatibility, docs contract.
- **API/migration impact:** removals only in a declared version/deprecation release.
- **Documentation impact:** comprehensive.
- **Acceptance criteria:** repository search shows one owner per concept as defined in Section 3; no stale promise remains.
- **Complexity:** M

</details>

## 11. Risk-based test plan

This section is a risk catalog, not a requirement to implement every possible permutation in the first phase that touches a module. Each roadmap phase lists its required minimum gate.

Use exact regression, boundary, invariant, chronology and cross-surface tests when they directly protect a recommendation, veto, risk label, eligibility decision, rank or trade plan. Prefer a small representative fixture set calculated independently from the implementation. Property testing, mutation testing, broad fuzzing, large golden-snapshot suites and exhaustive historical matrices are deferred to Phase 7 unless a specific defect demonstrates an earlier need.

### 11.1 Indicator and chronology tests

| Case | Concrete test | Expected assertion |
|---|---|---|
| SMA | Values 1..20, period20 | SMA = 10.5 exactly within decimal tolerance |
| EMA seed/update | Values1..21, period20 | seed=10.5 and next EMA=11.5 under alpha=2/21 |
| Wilder RSI known series | Fixed published/reference series, including 44.34, 44.09, 44.15, 43.61, …, 46.28 | Match independent Wilder reference, not merely non-null |
| Flat prices | At least15 identical closes | RSI=50; returns=0; volatility=0 when derived from closes; no breakout |
| All gains | Strictly increasing closes | RSI=100 after period |
| All losses | Strictly decreasing closes | RSI=0 after period |
| Insufficient history | 0,1,14,15,19,20,49,50 rows | Explicit per-feature availability and EligibilityResult; no accidental BUY |
| ATR true range | Synthetic gap bar where high-low is smaller than high-prev-close | TR uses gap distance |
| Wilder versus rolling ATR | Highs [10,12,13,14], lows [10,9,11,12], closes [10,11,12,13], period2 | TRs [3,2,2]; conventional Wilder continuation=2.25, distinguishing current rolling mean=2.0 |
| Out-of-order dates | Shuffle a unique dated fixture | Same snapshot/result as ascending input |
| Duplicate dates | Two rows same date with different revision/source | Input builder rejects or deterministically selects declared revision; never counts both |
| Missing atomic OHLC | One row missing/invalid high or low in a pure input fixture | Whole row excluded/reviewed; high/low/close lists remain aligned |
| Deterministic repeat | Same explicit input run twice | Equivalent decision fields, primary reason and shared identity semantics |

### 11.2 Data quality, Bangladesh market and liquidity tests

| Case | Concrete test | Expected assertion |
|---|---|---|
| Zero volume latest | Current session close exists, volume0 | Not a focus/scanner opportunity; eligibility/reliability reason present |
| Repeated zero volume | Mixed 20-row window with only half traded | Traded-session ratio exact; mean/median policy does not inflate relative volume |
| Stale last trade | Exchange session advances while stock date does not | Stale by missed sessions, independent of weekend/calendar-day count |
| Holiday/closure | Seven calendar days but no missed official session beyond policy | Not falsely stale |
| Volume outlier | Prior normal volumes plus one 100× block | Robust baseline and outlier flag; bounded influence |
| Current volume spike | Valid current volume against prior baseline | Latest excluded from its own baseline |
| Low liquidity | Reported median turnover below policy or order exceeds capacity | No BUY/focus/opportunity scan; technically strong state may remain visible as review-only |
| Estimated turnover | close×volume values only | Provenance=ESTIMATED; lower reliability/capacity treatment |
| Partial latest data | Partial OHLC source fallback | Eligibility/reliability penalty and no unsupported confidence |
| Suspicious latest/history | Source mismatch latest and several suspicious historical rows | Hard cap/exclusion according to policy; window quality counts exact |
| Mixed sessions | Universe payload includes latest and lagging individual stocks | Only current eligible rows enter breadth/Pulse; cache validator detects coverage |
| Low free float | Technically strong and liquid-looking volume but free float below policy | Separate capacity/operator-risk reason; no silent normal classification |
| Category transition | Same stock before/after effective-dated Z transition | Correct as-of category and settlement/risk policy |
| Suspension | Point-in-time suspended status | INELIGIBLE regardless of old last price |
| Circuit lock | Price at limit with no executable exit/entry | Plan WATCH_ONLY/UNAVAILABLE and non-fill in backtest |

### 11.3 Corporate-action and adjusted-series tests

- Cash-dividend ex-date: raw price gap is retained for execution view; analytical total-return/price convention is explicitly selected; no false support break.
- Bonus/split: historical OHLC and volume are adjusted consistently; market value continuity check passes within rounding.
- Rights issue: factor/event handling follows documented methodology; unresolved terms force REVIEW_ONLY.
- Multiple actions in one history: factors compose in correct effective-date order.
- Late event correction: deferred lineage test in Phase 7; early phases require only that a corrected known event changes the current eligibility result safely.
- Unknown 12%+ gap: never automatically declared corporate action; result is unresolved/WAIT.
- Genuine crash after prior decline: not suppressed by a simplistic adjustment guard.
- Exact ex-date list/detail/watchlist: canonical fields and action are identical.
- Pattern/level prefix across an adjustment: no artificial pole, triangle, breakout or volatility spike.

### 11.4 Support, resistance, structure and event tests

- No swings: Donchian fallback identifies method and excludes current bar when used as a trigger.
- One/two confirmed swings: nearest relevant support/resistance selected with pivot and confirmation dates.
- Resistance below current: represented as broken/prior resistance, never as an overhead target.
- Support above current: represented as failed support, not “near support.”
- Exact equality and tick rounding at levels.
- A swing at t is unavailable until t+confirmation bars; historical signal timestamp is confirmation date.
- Higher-high/higher-low and lower-high/lower-low require chronologically coherent pairs; mixed structures stay neutral.
- Breakout setup near resistance is not an event.
- Breakout event requires prior close at/below and current eligible close above level/buffer plus volume policy.
- A later close above the same level is continuation/retest, not a fresh breakout.
- False breakout: close returns below level within declared horizon; event outcome recorded.
- Mirrored breakdown, failed breakdown and reclaim cases.
- Corporate-action gap never creates an event when unresolved.

### 11.5 Opportunity, risk, evidence and recommendation tests

- Every component score is within its declared range and weighted contributions sum exactly to the composite within rounding.
- Below-support distance table proves the P0 branch correction.
- RSI boundary values at 29.999/30/30.001 and 69.999/70/70.001 reveal intended discontinuities; no undocumented equality behavior.
- Opportunity/recommendation values immediately below/at/above 38,45,48,55,65 and RSI78 are explicit.
- Risk label boundaries immediately below/at/above35,55,75; effective-dated Z policy.
- Risk veto dominates opportunity and breakout unless an explicit validated exception is declared.
- Worsening data quality, freshness or liquidity never raises evidence strength or relaxes eligibility.
- Mirror fixture: bullish BUY and equally coherent bearish SELL receive comparable directional evidence coverage.
- SELL requires reliable bearish evidence; high risk alone produces WAIT/AVOID, not breakdown/SELL.
- HOLD/WAIT tests separately for holder and non-holder.
- Suspected corporate action, sparse, stale and UNKNOWN regime paths.
- Bearish regime transition and breakout exception with exact constraint reasons.
- Primary decision reason remains the action reason even when evidence/regime caps are appended.
- Repeated rule boundary execution is deterministic across Python versions/rounding policy.

### 11.6 Trade-plan tests

- No plan without latest eligible price.
- VALID_ENTRY_PLAN invariants: 0 < stop < conservative entry ≤ entry_zone_high < conservative target; finite positive R/R.
- Entry zone low ≤ high; target low ≤ high; values conform to DSE tick/rounding policy.
- Deep structural support produces WATCH_ONLY rather than moving stop above invalidation.
- ATR stop tighter than structure, ATR stop wider than structure, missing ATR, missing support and missing resistance.
- Resistance/current relationships that would put target below entry.
- Conservative R/R uses adverse entry edge, target_low and modeled cost/slippage.
- Plan invalid/missing always blocks fresh BUY.
- WAIT/SELL/stale/sparse/illiquid/circuit-locked plan statuses.
- Gap through stop produces modeled worse fill/no-fill, not guaranteed stop price.
- Same bar reaches stop and target without intraday ordering: pessimistic or declared ambiguity policy.

### 11.7 Pattern chronology tests

- Run representative prefixes immediately before and at a detector trigger; the earlier prefix must not contain the later event.
- Double top/bottom prior-trend and separation boundaries; neckline trigger required for CONFIRMED.
- Bull/bear flag: pole, consolidation slope, contraction and price crossing tested separately; current close excluded from pre-break level.
- Ascending/descending/symmetrical triangles: converging geometry, apex timing, neutral direction until crossing.
- H&S/inverse H&S: ordered shoulders/head, neckline construction, trigger and invalidation.
- Cup/handle: prior advance, rim symmetry, roundedness, handle depth/slope and trigger; fixed slices alone insufficient.
- Negative/zero target impossible.
- Missing OHLC does not shift swing indices against a filtered close array.
- Pattern match score never called probability and never changes core action until validation policy enables it.

### 11.8 Regime tests

- No summaries and fewer-than-minimum index sessions → UNKNOWN, not neutral certainty.
- Index exactly at ±band boundaries.
- Breadth exactly at .40/.55 boundaries and high unchanged share.
- Index bullish/breadth bearish veto; mirrored case.
- Latest breadth date differs from latest index/stock session → UNKNOWN/review.
- If regime hysteresis is implemented, test one transition at and around its boundary; hysteresis is not an early mandatory feature.
- Same summary input across universe/detail gives identical RegimeResult identity.

### 11.9 Pulse tests

- Exact component fixtures for all bands; missing volume baseline contributes zero/unknown, never a default positive.
- Ineligible stale/suspicious/illiquid/corporate-action candidate cannot enter focus.
- Equal scores use explicit stable tie order independent of input ordering.
- Sector diversification with 0–5 slots; third same-sector candidate handled exactly by policy; exception score gap tested.
- Monitor candidates are disjoint from focus.
- Threshold exactly below/at/above focus boundary.
- Candidate pool fewer than five and all candidates excluded.
- Same-definition historical snapshot; strategy-version discontinuity breaks/labels the series.
- All-positive/all-negative/all-flat sector aggregation has no fabricated side.
- Breadth ignores lagging-session stocks.
- Top-five/rank repeat exactly from same snapshot.

### 11.10 Scanner and cross-surface tests

- Volume breakout requires canonical BreakoutEvent.
- Momentum continuation uses declared feature/threshold and eligible data.
- Support rebound requires lower and upper support distance plus a reclaim/turn event; a below-support close fails.
- Oversold/weak-RSI terminology matches exact threshold.
- High-risk watch and low-volatility compression are separate predicates.
- Breakdown requires canonical downside event; risk alone fails.
- Result ordering uses declared score/capacity/tie keys, not alphabetic universe or absolute share price.
- Frontend contains no duplicated liquidity/technical business constants after migration.
- For a fixed stock/session/version, list, detail, signal center, dashboard, scanner badge and watchlist action projection use the same canonical result.
- Holding/non-holding watchlist changes contextual action only, not technical evidence.
- Live decision versus persisted signal: matching prior version can produce NEW; mismatched/unversioned row cannot.
- Cache/stale fallback never serves a different strategy/input identity as current.

### 11.11 Test-quality requirements

- Replace “is not None” and broad “one of any action” assertions with exact expected values/reasons.
- Keep table-driven boundary coverage focused on branches that can change BUY/HOLD/WAIT/SELL, eligibility, vetoes, ranking or plan validity.
- Use one or two representative chronology fixtures per event/pattern before expanding the matrix.
- Add targeted branch coverage where it is inexpensive; do not make global coverage percentage a phase gate.
- Defer mutation testing, broad property tests, NaN/infinity fuzzing, large versioned golden catalogs and repeated multi-process determinism suites to Phase 7.
- Add a universe-coverage regression when the 500-symbol limit is changed or removed; a full performance suite is not required for earlier logic phases.

## 12. Terminology review

No UI change is required in this audit. The following wording should be changed when the corresponding backend behavior is implemented.

| Current/risky term | Risk | Recommended wording now | Condition for stronger wording |
|---|---|---|---|
| Probability | A point score is read as an observed event frequency | Evidence score / setup evidence | Defined event+horizon and held-out calibration |
| Confidence | Conflates bullish alignment, reliability and risk | Evidence strength; show data reliability separately | Held-out reliability for the exact action/outcome |
| Strong BUY | Implies validated magnitude/conviction and suitability | BUY setup with strong rule agreement | Validated tier with outcome/capacity disclosure |
| Safe / low risk | No equity trade is safe; current risk omits many hazards | Lower modeled trading-risk tier / fewer flagged risks | Never use “safe” as an absolute claim |
| Target | Sounds like expected future price | Scenario target reference / resistance objective | A forecast requires validated model and interval |
| Expected return | Current system does not estimate expectation | Implied upside to scenario reference | Calibrated conditional return estimate with horizon/costs/interval |
| Breakout confirmed | Current event may not cross a prior level | Breakout setup / testing resistance / price-volume break event | Canonical crossing, eligibility and follow-through definition |
| Breakdown | Currently includes SELL or high risk in scanner | Support-break event; elevated-risk watch separately | Canonical downside crossing event |
| Accumulation | Daily volume cannot identify buyer type | Relative-volume expansion / turnover leader | Participant/order-flow evidence or carefully validated proxy |
| Money flow / inflow / outflow | Average price change is not money flow | Sector price leadership / lagging sectors | Documented turnover-flow measure |
| Institutional participation | Participant identity is unavailable | Unusual relative volume / high turnover | Actual participant/order-flow data |
| Star of the day | Promotional certainty from rank | Top attention-ranked stock / session price leader | Prefer factual rank even after validation |
| New BUY Setup | Can be BUY without proof it is newly changed | BUY setup; New only with matching prior strategy snapshot | Like-for-like prior-session comparison |
| Volume Breakout | Used for volume expansion without price break | Unusual volume / relative-volume expansion | Canonical price breakout plus volume |
| Confirmed rebound | One positive close near/below support is insufficient | Rebound watch / positive session near support | Predefined reclaim and follow-through |
| High conviction | Current confidence is uncalibrated | Higher evidence agreement | Validated and calibrated tier |
| Opportunity environment | Current Pulse aggregate is selection-biased/mixed | Attention environment or eligible setup breadth | Stable point-in-time metric with validation |
| Volume consistency score | Current value is one-session volume ratio | Current relative-volume tier | Multi-session consistency statistic |

## 13. Optional future UI and explainability improvements

These are future product ideas and are deliberately excluded from the core implementation roadmap:

- Evidence contribution breakdown using the canonical, simplified components rather than every raw indicator.
- Visible hard-veto/downgrade reasons and distinction between data block, risk block and entry-feasibility block.
- Data-quality/eligibility status with last eligible session, traded-session ratio and turnover provenance.
- Holder versus non-holder contextual action, once backend fields exist.
- Recommendation history showing original historical strategy output separately from a replay under the current strategy.
- Strategy/threshold version and calculation-as-of metadata in an audit details affordance.
- Clear comparison when live/current and persisted historical signals differ, including why they are or are not comparable.
- Plan status and assumptions: valid entry, watch only, manage existing, unavailable; structural stop versus risk budget.
- Pattern state timeline: forming, triggered, confirmed, failed, with trigger/confirmation dates.

Do not build these before the underlying calculations and semantics are corrected.

## 14. Final verdict

### 1. Which calculations are sound?

- Date sorting of unique rows.
- SMA arithmetic.
- EMA seed and recursive formula.
- Wilder-smoothed RSI with flat=50, all-gain=100 and all-loss=0.
- True-range calculation, including gaps.
- Simple lookback return arithmetic.
- Weighted-sum/clamp mechanics and the fact that declared opportunity/risk weights each total1.
- Basic price-versus-moving-average and higher-high/higher-low descriptions as deterministic classifications.
- Current-volume comparison excluding the latest bar from the backend baseline.
- Market-mover requirement for current session, positive price and positive volume.

These are sound definitions, not validated predictors.

### 2. Which are reasonable heuristics?

- Price>SMA20>SMA50 trend and short-history SMA slope.
- Swing-based levels with delayed confirmation.
- RSI30/70 interpretation and 20/50/90 lookbacks.
- Relative-volume participation concept.
- Turnover-based liquidity tiers, category risk, gap frequency and overextension as DSE risk hypotheses.
- Broad index/breadth regime gate.
- Opportunity/risk composite architecture and a separate Pulse attention score.
- Sector diversification of a top-five attention list.

Every listed heuristic needs local sensitivity/backtesting; several also need corrected inputs.

### 3. Which are arbitrary or weak?

- Almost every breakpoint, component point table, weight and cap: opportunity/risk/evidence, 1.8 volume, 2.3/3% volatility, proximity bands, liquidity BDT bands, category scores, 55/65 recommendation thresholds, 1.2 R/R, 2ATR/8% plan limits, 12% adjustment guard, regime .5/.55/.40, pattern evidence points, Pulse60/top5 and narrative thresholds.
- Trade-plan entry percentages and fallback +6% target.
- Simplified pattern geometry and measured moves.
- Client risk-adjusted/volume-confirmation sorting scores.

Arbitrary does not mean unusable; it means unvalidated and strategy-dependent.

### 4. Which are misleading or dangerous?

- Below-support bullish score due to wrong branch order.
- Probability/confidence labels without calibration.
- Directionally bullish confidence formula for SELL.
- Pattern Active/confirmed states without price triggers and neutral triangle forced bearish.
- Invalid trade plans and structural stops rewritten to meet caps.
- Raw corporate-action gaps entering technicals and list/detail ex-date divergence.
- Pulse mixed opportunity history and fabricated money flow.
- Institutional/accumulation/sector-rotation claims from simple daily volume/price.
- Scanner confirmed-rebound/breakdown/high-conviction meanings that do not match predicates.
- High Pulse rank without eligibility/risk gates.

### 5. Where is the same analytical concept implemented more than once?

- Action: canonical backend, watchlist fallback, legacy client generateSignal, persisted strategy rows.
- RSI/trend/risk/support/resistance/volume behavior: backend and legacy client, with different formulas.
- Relative volume: backend prior20, client20 including latest, chart60 including current.
- Liquidity thresholds: backend and scanner local constants.
- Breakout/breakdown meaning: technical flag, breakout panel, pattern direction, Pulse label and scanner unions.
- Confidence: live decision0–100, pattern match0–100, breakout point score0–92, persisted strategy0–1, client fallback.
- Opportunity: stock opportunity versus Pulse market “opportunity.”
- Market direction: trading regime, dashboard mood and Pulse market state are legitimate separate modules but currently use overlapping labels.

### 6. Which implementation should become authoritative?

The versioned CanonicalDecisionResult orchestrated by decision/engine.py should own stock action and its exact inputs. Pure domain owners should remain separate for eligibility, technical features, liquidity/capacity, trading risk, evidence, constraints, plan feasibility and recommendation. Market regime remains its own shared market-context result. Pulse owns only attention ranking over canonical eligible results. Scanner owns versioned condition predicates over canonical fields. Frontend owns presentation and portfolio-context selection, not calculations.

### 7. What must be fixed first?

1. Below-support branch error.
2. Probability/confidence terminology and directional evidence defect.
3. Mixed/fabricated Pulse aggregates.
4. Trade-plan invariants and BUY feasibility.
5. False pattern Active/confirmed states and post-hoc critical warning.
6. Conservative identical corporate-action handling across list/detail.
7. Canonical versioned input/result and removal of alternate recomputation.

### 8. What must be backtested?

All predictive or strategy choices: RSI/MA/return interactions, volume baseline/threshold, level definition, breakout/breakdown, opportunity/risk components and boundaries, evidence tiers, regime gate, liquidity/capacity thresholds, entry/stop/target/R/R, every pattern, scanner predicate/rank, Pulse components/focus threshold/top-five/diversification, and any claimed probability.

Mathematical bugs, chronology, data adjustment, invariants, provenance and cross-surface equality require correctness tests first, not backtesting as a substitute.

### 9. What would make the system professionally defensible?

- Corrected formulas and honest terminology.
- Point-in-time adjusted/provenanced data and exchange-session eligibility.
- Bangladesh-specific liquidity, suspension, category, free-float, circuit and non-trading safeguards.
- One versioned canonical decision identity across every surface.
- Explicit holder/non-holder actions, constraints and valid scenario plans.
- A smaller, decorrelated, directionally coherent evidence model.
- Comprehensive exact/invariant/chronology/consistency tests.
- Reproducible walk-forward evaluation with realistic execution/cost/capacity, frozen test, sensitivity and transparent negative results.
- Monitoring, audit metadata and updated documentation.

That would justify **Professionally defensible deterministic decision support** if the empirical results meet predeclared criteria. It would not make the system institutionally validated.

### 10. What remains before claiming predictive performance?

Adequate point-in-time history across multiple DSE/CSE regimes; corporate actions, delistings and suspensions; reliable cost/slippage/non-fill assumptions; held-out walk-forward improvement over simple baselines; parameter stability; sufficient sample by sector/liquidity/category; calibrated outcome-specific probabilities if used; independent review; and live paper/forward monitoring showing the historical relationship persists. Until then, predictive claims are unsupported.

## Appendix A — Documentation mismatches requiring correction after implementation

| Document claim | Actual implementation |
|---|---|
| stock_decision_support.md: top10 patterns | DECISION_PATTERN_RESPONSE_LIMIT returns top3 |
| stock_decision_support.md/signals.md: universe and workspace resolve corporate-action/regime context identically | Regime formula/input query is shared; only detail supplies known dividend ex-dates |
| signals.md: insufficient OHLCV means null trader decision | Empty history is null/404; nonempty sparse history produces WAIT bundle |
| market_universe.md: Watchlist consumes universe and does not run a parallel price-window loop | Frontend prefers universe, but watchlist backend computes a fallback from its own price windows |
| market_data.md: derived fields are computed on write | Per-stock historical stock-details backfill stores null previous close/change/change percent |
| market_pulse.md: focus sector max2 unless scores force inclusion | Current final-slot/fill logic can exceed2 without a defined score-force rule |
| Pulse detail copy: 30D average volume | Canonical TechnicalSnapshot average is prior20 sessions |
| stock decision docs: confidence is reliability | Formula is a directionally bullish alignment composite with partial penalties/caps |
| Market Pulse “opportunity history” is session aggregate history | Historical/current points use different formulas and populations |

## Appendix B — Files and areas inspected

Primary context and data documentation:

- .cursor/rules/project_context.md
- .cursor/rules/architecture.md
- backend/docs/market_data.md
- backend/docs/stock_details.md
- backend/docs/stock_decision_support.md
- backend/docs/signals.md
- backend/docs/market_pulse.md
- backend/docs/market_universe.md
- backend/docs/market_dashboard.md

Core engine and contracts:

- backend/app/core/constants/trading_constants.py
- backend/app/core/enums.py
- backend/app/models.py
- backend/app/modules/stock_details/decision/technical.py
- scoring.py, trade_plan.py, engine.py, market_regime.py, patterns.py, breakout.py, warnings.py, summary.py
- backend/app/modules/stock_details/stock_details_decision_service.py
- stock_details_service.py, stock_details_repository.py and decision/workspace schemas/services

Market-wide consumers and storage:

- backend/app/modules/market_universe/market_universe_compute.py, service.py, schemas.py
- backend/app/modules/market_pulse/pulse_score.py, market_pulse_service.py, market_pulse_briefing.py and schemas
- backend/app/modules/market_dashboard/market_dashboard_compute.py, market_snapshot.py and service paths
- backend/app/modules/watchlists/watchlists_service.py/repository/schemas
- backend/app/modules/signals/trader_decisions_service.py, signals service/repository/schemas/router and signal job
- backend/app/modules/market_data/market_data_service.py, repository.py, schemas/router and market_mover_rules.py
- relevant AmarStock/DSE ingestion mappings, including latest-price and per-stock historical persistence
- backend/app/modules/backtesting/README.md

Frontend consumers/duplicates:

- frontend/features/scanner/scanner-workspace-view.tsx and scanner-language.ts
- frontend/lib/market/trader-decision.ts, trader-decision-reason.ts
- market-intelligence.ts, universe-intelligence.ts, universe-row-mapper.ts
- chart-intelligence.ts, related-stocks.ts and trend-display.ts
- frontend/features/signals/signal-center-view.tsx
- frontend/features/watchlist view and view model
- relevant dashboard and stock-workspace view models/components/types.

Tests:

- backend/app/tests/test_stock_decision_support.py
- test_breakout_and_patterns.py
- test_market_universe_contract.py
- relevant market mover, watchlist, Pulse cache, sector and frontend locale/mapper/reason tests found through repository search.

## Appendix C — Limitations of this audit

- No production database snapshot or historical signal population was supplied, so “reachable” contradictions were established from code paths, not measured production incidence.
- No order book, bid/ask, intraday trade sequence or broker fill data was available. Slippage, spread, same-day stop/target order and circuit-lock execution cannot currently be verified.
- Adjusted-price factors and a complete point-in-time corporate-action/category/suspension history were not present in the inspected implementation.
- Turnover can be source-reported or estimated as close×volume without a persisted provenance field, so actual liquidity quality could not be quantified.
- No completed backtesting code or result artifact exists; no predictive performance, score calibration, target accuracy or optimal threshold could be verified.
- External references establish definitions, market rules and validation standards; they do not validate this strategy or transfer predictive findings from liquid global markets to Bangladesh.
- BSEC/CSE rules can change and must be re-read from primary effective-dated material during implementation. The audit deliberately does not freeze historical CSE/BSEC price-limit/category values as timeless constants.
