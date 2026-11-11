# Corrected replay and shadow research

The read-only `app.scripts.run_trading_backtest` runs the shared decision engine
with an explicit supported policy version. Research execution and measurement
do not change production ranking or relax live safeguards. The matching v2 path
remains supported after the v3 volume-facts correction.

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

### Capture-aware modes and exchange deadline

`--replay-mode reconstructed` (default) explicitly reconstructs from historical
tables; it never silently consumes captured inputs. `captured` iterates original
publication membership before stock-bar warmup, including stale/missing-bar names,
and excludes absent, withdrawn, late, unsafe-knowledge or mismatching inputs.
`capture_diagnostic` additionally restores late and unknown-next-open publications
for parity; it still rejects knowledge introduced after selection. The first
publication vintage supplies each date's primary comparison. Later corrections
remain archived and excluded unless explicitly selected with repeatable
`--publication-id GENERATION_ID`. They do not become extra independent dates.

For each member the audit records publication observation, input calculation,
selection and next-open instants, engine version, expected/actual parity and
classification `TIMELY_CAPTURED`, `LATE_CAPTURED`, `RECONSTRUCTED` or `UNAVAILABLE`.
The deadline is strictly before the next verified exchange session opens, in
Asia/Dhaka; exactly at open fails. Observation/calculation must precede that
deadline and input/feature/event knowledge must already exist at selection.
No verified next session produces `NEXT_OPEN_UNVERIFIED`, not an invented weekday.
Accepted market-generation dates are preserved separately from finalized index
dates. An intervening observed but unfinalized date makes the next opening
unverified; it cannot extend the deadline to a later finalized session. Captured
bar `source_observations` must also be known by calculation/selection. Missing
source timestamps allow explicit diagnostic parity only and cannot establish
timely selection or factor knowledge. Capture coverage reconciles publication
members/results/exclusion reasons without mutable-price warmup denominators.
`--session-open-overrides openings.json` accepts a JSON date-to-HH:MM mapping;
defaults are 10:00 open and 15:00 close. Supply verified exceptional openings.
PIT listed membership and feature/event completeness are separate from parity.

The November 11 backup diagnostic can be reproduced from `backend/` with a
read-only connection to that restore (do not start the normal API/scheduler):

```text
python -m app.scripts.run_trading_backtest --exchange DSE --start 2026-08-30 --end 2026-11-10 --strategy-version trading-intelligence-v2 --replay-mode reconstructed --horizons 10 --no-sensitivities --omit-dataset-in-report --dataset-output dse-input.json --manifest-output dse-manifest.json --output dse-report.json
python -m app.scripts.run_trading_backtest --exchange DSE --start 2026-08-30 --end 2026-11-10 --strategy-version trading-intelligence-v2 --replay-mode reconstructed --horizons 10 --no-sensitivities --omit-dataset-in-report --dataset-input dse-input.json --verify-manifest dse-manifest.json --output dse-repeat.json
python -m app.scripts.run_trading_backtest --exchange DSE --start 2026-08-30 --end 2026-11-10 --strategy-version trading-intelligence-v2 --replay-mode reconstructed --horizons 3,5,20 --no-sensitivities --omit-dataset-in-report --dataset-input dse-input.json --output dse-diagnostics.json
python -m app.scripts.run_trading_backtest --exchange DSE --start 2026-11-03 --end 2026-11-10 --strategy-version trading-intelligence-v2 --replay-mode capture_diagnostic --horizons 10 --no-sensitivities --omit-dataset-in-report --dataset-input dse-input.json --output capture-parity.json
```

Repeat the last command with `--replay-mode captured` to inspect strict exclusions.
`--no-sensitivities` skips optional assumption runs without changing default
economics. `--omit-dataset-in-report` avoids duplicating a separately exported
large archive. The database branch explicitly starts a read-only transaction;
the archive branch does not query a database. Loading historical archives does
not require the new forward-receipt tables. See
`trading_decision_consistency_report_2026_11_11.md` for actual measured results,
empty folds, sample counts and archive identities.

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
An unknown rule/no next session/missing activation bar is
`EXECUTION_UNVERIFIED`, distinct from an observed genuine `UNFILLED` outcome.
Uncertainty persists across later blocked bars or apparent fills. A still-open
entry window at the archive boundary is unverified, rather than expired. A later
zero-volume bar cannot resolve an earlier opportunity with unknown rules.
Execution rule knowledge is checked strictly before that session's configured
exchange opening, and coverage scans activation/actual holding windows rather
than unrelated distant future dates.

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

## November 11 forward receipt implementation

The existing durable universe publication path now records a compatible,
independently covered, non-withdrawn v3 winner into append-only
`trading_shadow_selections` (Alembic `c6o7p8q9r0s1`). Each first-winner receipt seals
the experiment/config, generation, actual selected/DB-recorded instants, ranks,
both ranking arms, both entry arms and explicit empty slates. Repeated publication
preserves that receipt. Modeled outcomes append separate idempotent revisions to
`trading_shadow_outcomes`; selection history is never rewritten by maturation.
The original historical schema is tolerated: missing receipt tables report
`SCHEMA_UNAVAILABLE` and do not require historical migration.

The predeclared `phase2-shadow-factors-v3` forward cohort is cumulative **120
confirmed timely dates**, including empty dates. Primary outcomes use ten
exchange sessions and the sealed economics. Future observed exchange dates
establish the next-open deadline; until then a sealed receipt remains
`NEXT_OPEN_UNVERIFIED`. Both actual selected-at and DB-recorded-at must precede
that deadline. Late backfills do not advance the eligible clock. Weekly progress
is coverage/count/maturity reporting; formal comparison is once at the frozen
endpoint with unchanged gates. No policy is automatically promoted.

```text
python -m app.scripts.check_trading_shadow --exchange DSE
python -m app.scripts.check_trading_shadow --exchange DSE --mature
python -m app.scripts.check_trading_shadow --exchange DSE --assess
```

The first command is read-only. The second explicitly appends modeled outcome
vintages on an authorized migrated application database; do not use it on the
historical read-only restore. Progress distinguishes raw receipts from eligible
timely cohort dates and reports per-arm selections, available/filled outcomes,
distinct fill-bearing dates, empty dates, late receipts and unknown boundaries.
The local QA receipt and empty-slate trigger test prove engineering behavior,
not live prospective selection or mature strategy evidence.

Forward counts are isolated by exact strategy version and experiment and count
unique valid selection dates. Withdrawn sources/selections and invalidated latest
outcomes remain in the audit but cannot advance the clock. Entry modeling runs
the existing cumulative portfolio ledger, so overlapping positions and cash
rejections do not count as accepted fills. Progress reports modeled fills,
accepted available fills and unknown acceptance separately; only accepted
available fills advance distinct fill-bearing dates. An earlier unverified
opportunity leaves later portfolio acceptance unknown.

`--assess` explicitly matures then evaluates the first 120 timely dates only when
their primary ranking and entry windows have matured. Before that it returns
`AWAITING_FROZEN_ENDPOINT` or `AWAITING_PRIMARY_MATURITY` without efficacy results.
The once-only formal record is an immutable `FORMAL_ASSESSMENT` outcome vintage,
referencing the sealed selection hashes and exact outcome IDs/revisions. It uses
the existing ranking and accepted-fill entry gates and reports missing
coverage/safeguards as unsupported. Repeated assessment reuses that record;
withdrawal of referenced evidence invalidates its read-time disposition. Weekly
progress does not run the assessment. `promoted` remains false.

The original frozen cohort must also remain the first 120 confirmed valid dates.
A later nonwithdrawn outcome that becomes late/unknown, or an earlier newly
admitted date that displaces that cohort, supersedes the assessment without
running a second comparison. An ordinary later through-date vintage that still
confirms every original admission may reuse it.

Execution certainty is shared by outcomes, cohort cash comparisons and forward
acceptance. Invalid prices, retained uncertainty reasons and unrecognized future
states fail closed. Dependent later candidate fills have unknown acceptance;
modeled ledger keys remain diagnostic while verified accepted keys/counts are
unavailable. Clean known holding/budget rejections remain known rejections.

The real recording job has no measured bypass audit and seals
`safeguard_bypasses=null`, `safeguard_evidence_status=UNMEASURED`. Absent evidence
also stays unknown through formal gates. An empty list with `MEASURED` evidence is
distinct from an actual recorded bypass; neither is inferred from missing data.
Publisher `excluded_members` reasons precede captured-input restoration, even
when bytes exist for `NO_PUBLISHED_RESULT`. Audit and coverage preserve declared
reasons separately from an undeclared `MEMBER_INPUT_UNAVAILABLE` gap.

## Combined review: replay v4 and bounded forward maturation

`capture-aware-replay-v4` retains the same canonical strategy, factor weights and
gate thresholds. Raw price-return families require complete known-at event/basis
coverage and a clean comparable window. Known split/action dates, date-only
unknown vintages and unverified basis make follow-through/exhaustion unavailable;
events learned after selection cannot affect an earlier feature. The normal
loader and captured adapter retain the actual known-at facts. Monetary
turnover/trade-count participation has independent requirements: complete timely
traded windows, positive turnover/trade counts and reported monetary turnover
provenance. Missing price-basis evidence does not disable this monetary family.

Missing selected or nonselected instrument history remains in all frozen
denominators with an explicit `NO_STOCK_HISTORY` outcome and unsupported coverage.
Formal comparison does not silently drop it or relabel it as untimely. Portfolio
acceptance is tracked per order: a known fill preceding an uncertain exit stays
known, while later dependent holding/cash decisions stay unknown. Known overlap
and budget rejections remain distinct. Exit uncertainty attaches only to an
accepted or plausibly accepted position. A never-held rejected order's
hypothetical exit cannot change later independent acceptance. Unknown acceptance makes portfolio return
and drawdown unsupported; modeled cash/marks are retained as diagnostics.

Outcome heads are selected in SQL by selection, through-date, recorded-at and ID,
including an invalidated head. Routine progress reads only arm/count/admission
fields, excluding full sealed universes, markout archives and ledgers. Mature
labels and executions reuse unchanged scoped input/benchmark revisions. Only one
cohort receipt stores the cumulative portfolio snapshot; mature unchanged
history does not append a new body merely because another session elapsed.
Corrections append revisions, withdrawals remain authoritative, and the original
formal assessment references stay readable. Maturation stops extending the
frozen first-120 cohort after its endpoint.

A mature receipt's `through_date` includes the latest actual delayed exit used
by its outcomes/input revision, capped at the evaluated exchange-session end.
The one cumulative portfolio carrier also covers every included ledger event
and daily equity row, even when that selection is empty. Its
`portfolio_source_through_date` and `portfolio_sources` bind the snapshot cutoff
to the contributing sealed selection hashes and scoped entry-source revisions.
Re-evaluating an earlier cutoff does not reuse later facts or replace a newer
SQL head.
Legacy mature metadata is corrected by an appended revision; the original audit
IDs remain readable and unchanged mature content still reuses its current ID.

The CLI uses worker `MARKET_SESSION_OPEN_OVERRIDES` by default; an explicit
`--session-open-overrides` file replaces that map and is stored in effective
configuration. The normal background warm-cache job can repair a missing shadow
receipt after migration from the exact durable winner, using the actual retry
time. It does not recompute cached decisions or backdate a late retry. Request
handlers do not record or mature receipts.

Set `MARKET_SESSION_OPEN_OVERRIDES` to a JSON date-to-HH:MM mapping on the
application worker for verified exceptional openings. Publication seals these
actual settings into the receipt; maturation uses its frozen configuration.
