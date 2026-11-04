# Corrected replay and shadow research

The existing read-only `app.scripts.run_trading_backtest` runs the unchanged shared
Phase 1 decision engine. Phase 2 changes research execution and measurement; it
neither changes production ranking nor relaxes live safeguards. The earlier
replay is available in Git history for diagnostics, not as a valid comparator.

## Running and freezing

From `backend/`, a database-backed run (read-only, separately authorized) is:

```powershell
python -m app.scripts.run_trading_backtest --start 2026-01-01 --end 2026-10-31 `
  --output .artifacts/replay.json --manifest-output .artifacts/replay.manifest.json `
  --dataset-output .artifacts/replay.inputs.json
```

An archived run requires no database connection:

```powershell
python -m app.scripts.run_trading_backtest --start 2026-01-01 --end 2026-10-31 `
  --dataset-input .artifacts/replay.inputs.json --verify-manifest .artifacts/replay.manifest.json `
  --output .artifacts/reproduced.json
```

Keep the raw archive, full report and manifest together. The manifest hashes
configuration, raw prices/trade counts and observed timestamps, market summaries,
captures, rules/actions, observations, selections, execution lifecycles, outcomes,
research protocol/results, and owning decision/replay source. A mismatch exits 2.
Changing replay source invalidates the frozen baseline; a matching manifest does
not establish historical point-in-time completeness.

The database loader reads finalized exchange dates, including warmup dates and
missing stock bars. It currently supplies retrospective snapshots, not a complete
historical PIT archive. It deliberately declares rule/event/instrument/PIT
coverage unverified. Historical effective dates without known-at timestamps do
not become earlier event knowledge. Unknown action terms exclude affected returns.

## Execution and accounting

Each strategy has a declared policy. Corrected-engine top five uses the backend
Phase 1 shortlist key and canonical plan. SMA20, SMA50, RSI and Pulse diagnostics
have their own next-session policies, not inherited conditional-plan fills.
The no-trade comparator retains initial cash. Every selected row is persisted,
including canonical WAIT, expired/invalidated plans and unavailable outcomes.

`SELECTED`, `ACTIVATED`, `ORDER_ATTEMPT`, `FILLED`, ambiguity, invalidation,
expiry, blocked sessions/exits and final exit are recorded separately. Fills
record OPEN, INTRADAY or CLOSE from the actual order path. A pullback resting
order opening inside its zone fills at the open; an intraday zone touch does
not establish that the session high followed entry. It receives no favorable
same-bar target. A trigger/zone and invalidation with unknown ordering remains
ambiguous and unfilled. A completed breakout can enter only a later executable
session within expiry. An already-open position touching stop and target exits
at the stop; gap-through stops use the worse open. A close entry cannot use
that day's earlier high/low. Missing, invalid and zero-volume bars cannot
activate an exit; a pending or horizon exit stays pending across these bars
and blocked sessions and uses the next executable open.

Effective-dated `ExecutionRule` evidence includes known-at time, source revision,
tick, lot, settlement and optional absolute price limits. Entry rechecks gap,
rounded plan levels, capacity from prior decision turnover and cash debit.
Unknown rules exclude execution by default. Two explicit unverified sensitivities
bound tick/lot/settlement assumptions (0.1/1/T2 and 1/100/T3); these are not DSE
rule claims. Known suspensions/circuit locks/no-trade bars block execution.
A modeled exit that breaches a verified limit after slippage and tick rounding
remains pending; the ledger credits no proceeds on that session.
Unknown historical status/lock completeness continues to block promotion.

`CorporateActionTerms` specifies share multiplier, cash per old share and pay date.
Positions and stop/target units change with shares. Dividend entitlement is an
equity receivable; it is spendable cash only at payment. A carried mark is
rebased for the share multiplier and cash entitlement before valuing a missing
or no-trade action-day bar. An unsupported carried action mark cannot establish
verified drawdown. Adjusted-close presence
alone never substitutes for share/cash terms. Unknown payment timing or unresolved
positions makes completed portfolio results unsupported. Stale marks are counted.

Defaults are BDT50k orders, BDT1m starting cash, no leverage and one position per
symbol. Order sizes 25k/100k/250k, costs 25/50/75 bps each way and doubled liquidity
slippage are rerun as sensitivities. The standard 50 bps cost is an assumption,
not broker evidence. Drawdown is peak-to-trough marked portfolio equity, including
cash, fees and corporate actions. Trade close-based MAE is reported separately.

## Labels, partitions and denominators

Selection quality always uses common signal-close to horizon-close total-return
markouts, with the same modeled two-way costs and matching benchmark closes.
Primary horizon is ten completed exchange sessions; 3/5/20 are diagnostic.
These labels do not depend on activation or fills. Missing/invalid/immature
outcomes remain missing and retain the selection denominator. Daily top-five
precision/lift uses that day's eligible matched universe; rank IC is calculated
within each day and averaged across days. Available-case metrics disclose counts.

Open and intraday fills cannot use a same-day benchmark close as the entry
benchmark. Matched policy excess requires an actual close fill and matched exit
close. Fill-conditional
outcomes and cash-inclusive portfolio performance are separate from markouts.

Uncaptured replay builds each canonical decision from the production lookback
for prices and the last 90 exchange sessions through the signal date. Missing
and observed no-trade stock sessions still count in the exchange denominator.
Replay restores archived canonical inputs as captured and retains the full
dataset calendar for future execution, outcome maturity and folds.

All observations, including the immature tail, appear in `all_descriptive`.
Chronological folds and a default 60-date frozen test are formed from dates with
enough future sessions for expiry plus the longest holding label. Training and
pre-test validation rows are additionally purged on actual outcome end, including
delayed fills and blocked exits. Unresolved labels cannot enter training. Every
partition reports its own decisions, selection, execution, cohorts and capital
ledger; sensitivities and challengers use the same discipline. No transformation
is fitted or selected using holdout outcomes. Counts reconcile attempted
instrument-sessions into warmup, missing bars, missing engine results and results,
then eligibility, selection and execution. Audit rows preserve exclusions.

## Frozen challengers and gates

`backtesting_challengers.py:EXPERIMENT` declares four families: market/sector
relative strength, five-session breadth persistence interacting with leadership,
robust turnover/trade-count participation, and three-session follow-through with
a predeclared exhaustion penalty. Four singletons, their equal-weight combination
and four leave-one-out ablations are frozen before evaluation. Same-date
percentile transformations require no fitting. A missing family value preserves
the whole date's baseline ordering, keeps all names and blocks promotion for that
variant. Corporate-action-affected raw feature windows require clean warmup.

The replay archive labels its market summaries as retrospective snapshots and
sector classifications as current metadata. These inputs do not establish
what was known on an earlier signal date. Relative strength and breadth
persistence stay unsupported until independent point-in-time inputs exist.
Historical sector remains unknown in replay observations; ranking coverage
and sector concentration cannot pass on the strength of canonical capture parity.
The separate entry gate continues to evaluate its own rule, history and parity evidence.

One separately versioned entry experiment tightens the gap bound to 2.5%; it keeps
ranking, selections and canonical safeguards fixed. No regime relaxation is
implemented. A regularized model, pattern increment and event-alpha experiment
are explicitly NOT_FIT/unsupported until suitable PIT features and a new frozen
training protocol exist. No winning model is claimed.

Ranking and entry promotion gates are independent. Ranking requires 60 mature
dates, 200 evaluable selections, at least 0.25 percentage points net excess gain,
at least 10% relative precision improvement and positive paired uncertainty.
Liquidity, concentration, coverage and turnover safeguards are predeclared.
Entry requires 60 mature dates and 200 actual portfolio-accepted filled outcomes,
positive cash-inclusive paired gain, no greater portfolio drawdown, and no
sufficiently sampled regime/liquidity cohort losing over 0.5 percentage points or
five fill-rate points. All unfilled attempts remain in denominators; WAIT is
reported by controlling reason. Sparse cohorts are inconclusive.

Uncertainty is a deterministic paired bootstrap of nonoverlapping 20-date block
means (2,000 replicates, fixed seed); fewer than three complete blocks is
unsupported. Both gates require verified PIT/events/rules/instrument coverage,
zero observed same-input parity failures with actual reference comparisons, no
safeguard bypass and prospective shadow confirmation. `UNSUPPORTED`, `REJECTED`,
`SHADOW` and `PROMOTION_ELIGIBLE` are separate results; `promoted` is always false.
Prospective shadow evidence is never fabricated by this offline runner. It does
not expose calibrated probabilities or change any production release.

## Local implementation acceptance

Meaningful independent fixtures cover ordering ambiguity, next executable entry,
policy-specific baselines, tick/lot/capacity/gap checks, settlement and locks,
splits/cash dividends, benchmark alignment, independent selection denominators,
portfolio drawdown, actual-end purging, captured-input replay and frozen gates.
See `trading_intelligence_phase2.md` for local evidence and remaining acceptance.
No production database, provider, migration, browser, deployment or prospective
shadow action was performed as part of local Phase 2 implementation.
