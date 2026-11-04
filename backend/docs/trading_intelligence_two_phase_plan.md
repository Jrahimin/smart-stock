# StockWealth BD — two-phase implementation plan

Phases 1 and 2 are implemented locally, including the replay calendar fix from
the whole-plan review. The external workflow evidence records independent
verification. See `trading_intelligence_phase1.md` and
`trading_intelligence_phase2.md` for the implementation and the remaining
database, deployment, real-data and prospective shadow gates.

## Scope and evidence

Preserve the existing UI layout, routes, workflows, filters, and shared decision engine. Improve input validity, consistency, default shortlisting, explanations, and research measurement through existing components and additive API contracts. Retain legacy fields for compatibility, but stop using them as current ranking or probability signals.

Verified findings from the November 3, 2026 finalized generation:

- All 413 universe/latest-decision dictionaries matched. The principal reproduced problems were semantics and presentation, not divergent core decisions.
- SPCL: Pulse attention 86 and watch level 58.50; canonical WAIT with a regime-blocked plan. The distinction is valid but inadequately explained.
- APSCLBOND: unavailable/ineligible decision with evidence 100; second under Signal Center's evidence sort. Its server accessibility summary also combined a valid last price with an invalid raw return.
- Corporate-action protection can expire while affected prices remain in lookbacks; filtering invalid no-trade rows can inflate coverage.
- The live-generation path can feed supposedly completed-session decisions. Pulse briefing lacks independent generation validation.
- Replay conflates triggers with fills and adverse excursion with drawdown, reuses canonical execution for baselines, and does not apply its partitions to most reported metrics.

Research hypotheses—not verified improvements—include smoother attention scores, relative strength, persistent breadth/leadership, trade participation, breakout exhaustion, pattern value, and selective relaxation of regime blocks. None belongs in the correctness releases.

## Phase 1 — trustworthy decisions, then useful presentation

### Release 1A: finalized inputs, cross-page consistency, and research capture

**Scope**

- Separate live quote/attention generation from finalized decision identity. Decision identity includes exchange, symbol, finalized session, price/event/input revisions, strategy, thresholds, schema, and taxonomy. Canonical inputs must reject provisional sessions. Live price touches and partial-session volume remain explicitly provisional observations.
- Count expected exchange sessions, observed rows, valid prices, and traded sessions separately. Calculate coverage against the declared calendar denominator; do not erase missing/no-trade sessions when filtering OHLC. Carry the calendar through the longest required lookback.
- Guard every affected feature window against unresolved corporate actions. Use verified adjustment coverage or a sufficient clean post-event warmup; never infer adjustment factors from price moves. Preserve event availability timestamps and distinguish unknown coverage from no events.
- Publish backend display price, change, date, and observation status together. Both SSR and hydrated views consume this projection.
- Stamp universe, latest decisions, workspace, decision-support, and Pulse responses with relevant identities. Validate Redis envelopes, SSR hydration, TanStack keys, IndexedDB entries, and client fallbacks. Quote identity and decision identity may intentionally differ; their meanings must remain explicit.
- Publish completed decision generations atomically. During a rebuild, show the previous validated finalized decision with its original date and an updating label; continue showing separately dated quotes. Never relabel old results as current. If no validated prior result exists, show decision unavailable and no actionable trigger or fabricated evidence. An explicitly invalidated prior result is unavailable, not an actionable fallback. Replace the decision atomically when the new generation is ready.
- Start append-only point-in-time capture here: source observations/revisions, observed-at time, session/finality, event knowledge time, adjustment coverage, instrument/status metadata, universe membership, quote/decision identities, and generated results. Capture trade counts and all inputs that enter feature hashes. Record gaps; do not invent historical point-in-time coverage from current snapshots.
- Add a non-rebuilding operational inspection mode. Wire previous-finalized comparisons explicitly; source corrections must not masquerade as new-session signals.

**Backend ownership and parity contract**

| Shared meaning | Backend owner |
|---|---|
| Analytical series, RSI, trend, returns, relative volume, structural levels | `decision/technical.py` |
| Calendar coverage, adjustment validity, instrument eligibility | `decision/data_eligibility.py` |
| Directional evidence and reliability | `decision/evidence.py` |
| Trading risk | `decision/risk.py` |
| Action, controlling reason, contextual holder/non-holder actions | `decision/recommendation.py` |
| Executable condition, invalidation, objectives, expiry, readiness | `decision/trade_plan.py` |
| Input identity and revisions | `decision/canonical.py` and `lineage.py` |
| Attention and diversified focus selection | Pulse backend |
| Shortlist ordering | Backend universe projection, consuming canonical fields |
| Scanner conditions | Scanner backend |

Use `/market/universe-rows`, `/signals/decisions/latest`, `/stock-details/{exchange}/{symbol}/workspace`, and `/decision-support` as the comparison surfaces. Compare action, reason, blockers, eligibility, risk, evidence semantics, setup quality, readiness, and conditions only where exposed by each contract. Compare technical values only where the API exposes those fields; do not manufacture technical projections for a comparison. Test rendered fields against their owning DTO. Pulse attention, live quotes, exchange-wide breadth, and eligible-stock breadth are intentionally distinct metrics.

**Dependencies**

Existing generation/finality services, scored universe, canonical input builder, snapshot repository, cache coordinator, and typed DTOs. Add only the persistence needed for immutable research inputs and explicit generation publication. Preserve existing local DSEX changes.

**Acceptance checks**

- Yesterday FINALIZED plus today LIVE: quote updates do not alter finalized action, indicators, plan, or shared decision ID.
- Same-session price/event correction: input revision and decision ID change; old payloads cannot be accepted under the new identity; publication remains atomic across concurrent reads.
- Ninety expected sessions with thirty no-trade placeholders produce 66.7% participation, not 100%; missing data and observed no-trade remain distinguishable.
- A known unadjusted split remains guarded throughout every affected lookback; resolved factors and clean warmup restore only supported features. Late-known events do not leak into earlier replay inputs.
- SPCL, ENVOYTEX, BRACBANK, SQURPHARMA, and APSCLBOND pass the field-intersection parity contract. APSCLBOND's SSR/client price-change projection agrees.
- Cold cache, failed rebuild, invalid prior generation, stale browser cache, and parallel Pulse summary/briefing publication obey the defined fallback states.
- Captured inputs reproduce a finalized decision and a same-session correction independently. Operational inspection performs no rebuild or persistent write.

### Release 1B: shortlist ranking and decision explanations

**Scope**

- Remove heuristic confidence/evidence from default sorting and percentage displays. Keep legacy numeric fields only for compatibility. Data-blocked evidence displays unavailable; usable but balanced evidence displays mixed; directional evidence retains its explicit heuristic meaning.
- Expose one controlling WAIT reason, with secondary blockers retained: data unavailable, tradability, risk/extension, regime, incomplete confirmation/plan, or no directional edge. Use actual precedence; do not describe a regime veto as generic liquidity risk.
- Rank Signal Center's default long-entry shortlist by canonical eligibility, readiness, setup quality, and tradability, with stable symbol/ID tie-breaks. Order readiness READY, CONDITIONAL, NOT_READY; quality STRONG, CONSTRUCTIVE, WEAK; use canonical liquidity tier then median turnover for tradability. Keep noneligible rows below eligible rows. Maintain a separate holder-exit priority; retain explicit user sorts and all searchable instruments.
- Keep Pulse attention and sector diversification separate from entry ranking. Its existing cards show finalized action/readiness and controlling blocker beside attention. Watch levels are observations; actionable triggers come only from a permitted canonical plan. Preserve valid POTENTIAL_BUY + CONDITIONAL semantics.
- Show canonical trading risk separately from reliability/tradability. Label secondary pattern targets as hypotheses; the trade plan owns actionable objectives.
- Correct contradictory Pulse conclusions and population labels. Broad leadership must come from market constituents, not the diversified focus list. Explain weak breadth alongside isolated strength; label winner-only sector averages as such.
- Use backend holder/non-holder context: SELL means avoid a new long entry for non-holders, while holder guidance addresses the holding. Remove fabricated client fallback evidence and independent client trading-rank formulas. Keep legacy signals limited to compatible historical context.
- Update English and Bangla copy within existing components.

**Dependencies**

Release 1A correctness checks precede Release 1B implementation. The local 1A checkpoint passed before presentation work began. Deployment remains a separate, unauthorized operational step; this checkout contains both logical releases with additive presentation/rank fields and a versioned ranking policy, without predictive threshold or regime relaxation.

**Acceptance checks**

- Blocked APSCLBOND cannot outrank eligible setups because of 100 evidence; neutral BRACBANK does not appear as a high-conviction setup solely because it is liquid.
- SPCL explains its regime-blocked WAIT in Pulse and Details; 58.50 is not described as sufficient entry permission.
- Identical canonical rows produce stable shortlist ordering; readiness/quality/tradability determine ordering without legacy evidence or Pulse score bonuses.
- No heuristic percentages or fabricated evidence appear in Dashboard, Explorer, Signals, Scanner, Details, or Watchlist fallbacks.
- Pulse cannot simultaneously conclude cautious positioning and risk-on from the same state. Different breadth/participation populations are labelled rather than forced to match.
- Existing routes, layout, filters, explicit sorts, conditional plans, and holder workflows remain functional. Field-intersection parity continues to pass.

## Phase 2 — valid replay, challenger evaluation, and separate promotion gates

### Release 2A: corrected replay and frozen baseline

**Scope**

- Reuse `app.scripts.run_trading_backtest`, its service, and manifests. Freeze the corrected Phase 1 engine as the production baseline; retain the old engine only for diagnostic comparison.
- Give every strategy its own execution policy. Persist selection, activation, order attempt, fill, invalidation, expiry, and exit separately. Revalidate gaps, rounded levels, capacity, and plan validity at executable entry.
- If a daily bar touches both trigger and invalidation and ordering is unknown, do not award a successful entry: classify ambiguous pre-entry/invalidation and no fill. For an already open position with both stop and target touched, use the adverse ordering. Same-close signals cannot fill at that close; confirmed breakouts enter no earlier than the following executable session.
- Model tick/lot rules, settlement availability, suspensions, price limits, no-trade sessions, blocked exits, gap-through stops, fees, and slippage using effective-dated evidence. Unknown execution constraints remain disclosed exclusions or bounded sensitivities.
- Correct corporate-action share/cash accounting and benchmark timing. Calculate drawdown from a capital ledger; distinguish it from close-based adverse excursion.
- Apply chronological folds to every metric, with training-only transformations and actual outcome-end purging, including delayed conditional entries. Reserve enough future data for mature held-out labels.
- Evaluate shortlist quality across all selections, independently of whether the entry policy filled. Use a common forward-markout definition for comparable valid selections; disclose invalid/missing outcomes and coverage. Report cash-inclusive policy results, fills, non-fills, and fill-conditional outcomes separately. Never count missing outcomes as zero or hide them by filtering to fills.
- Calculate daily matched-universe top-five lift and rank IC, then aggregate by date. Reconcile all attempted instrument-sessions through warmup, missingness, eligibility, selection, and execution.

**Dependencies**

Phase 1 input fixes, point-in-time capture, versioned rank policy, and verified exchange-rule coverage. Inadequate historical coverage blocks predictive conclusions, not replay correctness work.

**Acceptance checks**

- Independent fixtures prove ambiguous-bar handling, next-session entry, baseline-specific execution, corporate actions, tick rounding, gap rejection, blocked exits, trigger/fill denominators, and portfolio drawdown.
- No training label overlaps validation/test information; no parameter is chosen from held-out results.
- Every selection appears in the report denominator, including non-fills and unavailable outcomes. Rank metrics do not change merely because an entry policy changes its fill filter.
- Manifests reproduce configuration, raw revisions, observations, selections, and outcomes. Insufficient sample/coverage returns an explicit unsupported result, not a winning strategy.

### Release 2B: frozen challengers and shadow promotion

**Scope: research hypotheses only**

Test a small predeclared set against the corrected engine: market/sector-relative strength, persistent breadth/leadership, robust turnover/trade participation, and breakout follow-through versus exhaustion. Use factor-family ablations. Test patterns only for incremental value; use events only with known-at timestamps. Consider one regularized ranking model only if independent chronological coverage supports fair fitting and held-out evaluation. Regime relaxation is an entry-policy experiment, never a ranking side effect.

Defaults: BDT50,000 orders, sensitivities at 25k/100k/250k; primary horizon ten completed sessions, diagnostics at 3/5/20. Use 50 bps each-way research costs plus liquidity slippage, with 25/50/75 bps and doubled-slippage sensitivities. These are assumptions pending verified fee data. Preserve a BDT1m no-leverage reference portfolio, one position per symbol, cash constraints, and prior-information capacity limits.

**Dependencies**

Release 2A accepted; sufficient point-in-time history and mature outcomes; experiment definitions, candidate variants, folds, costs, and gates frozen before opening the holdout. The prior 25-date selected-case pilot is feasibility evidence only and cannot support promotion.

**Ranking promotion gate**

- Hold entry policy, eligible universe, costs, and comparison dates fixed.
- Evaluate all selected names with common markouts; report missingness, daily top-five precision/lift, concentration, turnover, and executable-policy outcomes separately.
- Require at least 60 mature distinct evaluation dates and 200 evaluable selections, reporting missing selections as well; use date-block uncertainty for overlapping horizons.
- Predeclared practical target: at least 0.25 percentage points higher ten-session mean net excess markout and 10% relative top-five precision improvement versus the corrected engine, with paired uncertainty supporting positive improvement. No eligible cohort may be silently removed to pass.
- No safeguard bypass, worse data coverage, or material liquidity/concentration deterioration. Ranking promotion changes ordering only.

**Entry-policy promotion gate**

- Hold ranking and candidate selections fixed. Compare trigger-to-attempt, attempt-to-fill, expiry/invalidation, false breakouts, missed executable opportunities, and cash-inclusive portfolio results; fill-conditional returns are secondary.
- Require at least 60 mature distinct evaluation dates and 200 filled outcomes, plus all unfilled attempts in denominators. Evaluate WAIT by controlling abstention reason.
- Require positive paired improvement in cash-inclusive net return after costs, with date-block uncertainty supporting the gain, no increase in maximum portfolio drawdown, and no unapproved data/risk/tradability bypass.
- Reject or retain in shadow if a sufficiently sampled regime/liquidity cohort loses more than 0.5 percentage points in mean net outcome or five percentage points in fill rate without a predeclared compensating tradeoff. Report sparse cohorts as inconclusive.
- Unknown rule/event coverage or insufficient counts keeps the policy in shadow. Do not expose probability language without a separate out-of-sample calibration assessment.

Both promotions require zero same-input parity failures and prospective shadow confirmation. Ranking and entry-policy changes receive separate version IDs and release decisions; neither gate can substitute for the other.

## First implementation slice

Implement the finalized-decision boundary in Release 1A: separate quote and decision generation resolution, enforce finalized-only canonical inputs, publish the two identities through universe/workspace/Pulse metadata, define validated-prior/unavailable rebuild responses, and append the associated point-in-time input bundle. Add the yesterday-finalized/today-live and same-session-correction integration fixtures first. Complete cache/publication acceptance for this slice before changing ranking, labels, thresholds, or entry policy.
