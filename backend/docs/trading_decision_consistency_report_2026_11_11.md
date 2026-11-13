# Reconstructed DSE diagnostic — ineligible for promotion

Measured on 11 November 2026, with the combined-review replay-v4 corrections,
against the local restore through **10 November
2026**, with no provider calls or writes to that restore. The unchanged published
v2 policy was restored and compared before interpreting reconstruction. Run 1's
v3 policy, historical reconstruction, as-published replay and actual prospective
selections are separate evidence populations. No strategy change or promotion is
recommended by this report.

## Six-publication restoration

The capture diagnostic restores publication membership before price warmup. All
426 members per publication reproduced input hash, shared decision ID, action,
eligibility, readiness and levels under `trading-intelligence-v2`: **2,556 matches,
zero comparable-input failures**. Old membership was derived from output, so all
six still have external listed-population coverage `UNKNOWN`. Parity verifies
the observed calculation; it does not certify the external feed.

The configured opening is 10:00 Asia/Dhaka. The boundary uses the next *verified
finalized exchange date*, not the next weekday. No exceptional opening override
was supplied. These are classifications under that configuration, not verified
historical exchange opening notices.

| Reference session | Actual observation, Dhaka | Next verified open | Classification | Members / matches | POTENTIAL_BUY |
|---|---|---|---|---:|---:|
| 3 Nov | 4 Nov 12:11:53 | 4 Nov 10:00 | LATE_CAPTURED | 426 / 426 | 0 |
| 4 Nov | 4 Nov 15:15:21 | 5 Nov 10:00 | TIMELY_CAPTURED | 426 / 426 | 7 |
| 5 Nov | 5 Nov 15:15:14 | 8 Nov 10:00 | TIMELY_CAPTURED | 426 / 426 | 10 |
| 8 Nov | 8 Nov 15:15:13 | 9 Nov 10:00 | TIMELY_CAPTURED | 426 / 426 | 0 |
| 9 Nov | 9 Nov 15:15:21 | 10 Nov 10:00 | TIMELY_CAPTURED | 426 / 426 | 0 |
| 10 Nov | 10 Nov 15:15:15 | Unavailable in restore | UNAVAILABLE | 426 / 426 | 8 |

Explicit `capture_diagnostic` retains all six for restoration. Strict `captured`
retains 1,704 members on four timely dates and excludes 852 late/unknown-boundary
members without reconstruction. None has a mature ten-session outcome. Neither
mode establishes that challenger selections were recorded prospectively.
The repaired coverage denominator is 2,556 publication members = 1,704 results
(880 eligible / 824 other) + 426 late exclusions + 426 unknown-next-open
exclusions, with zero missing-publication dates in this six-date window. Mutable
bar absence/warmup is not substituted for capture availability. Captured source
observation timestamps also pass the independent knowledge check on these data.

## Frozen data and configuration

The loader retained 41,484 price rows on **99 finalized DSEX sessions**, 14 June–
10 November, across 426 stocks. It did not substitute all 220 stored price dates.
The decision interval starts 30 August, the 50th finalized session: **50 dates**,
21,300 attempted instrument-sessions, 690 warmup exclusions and **20,610 results**.
Eligibility is 13,453 ELIGIBLE, 601 INELIGIBLE, 6,549 LIMITED and 7 REVIEW_ONLY.
Actions are 76 POTENTIAL_BUY, 7,408 SELL and 13,126 WAIT. Internal HOLD contributes
63 of the WAIT results. Published captures and reconstructed action counts are
not interchangeable.

The primary run pins `horizons=(10,)`, strategy `trading-intelligence-v2`, replay
`capture-aware-replay-v4`, input schema `trading-input-v3`, threshold version
`trading-thresholds-v3` and taxonomy `v2`. Reconstruction uses the configured
15:00 Dhaka close as a diagnostic selection instant. It cannot recover historical
source knowledge that was never captured.

Economics remain at defaults: BDT50,000 order, BDT1,000,000 initial cash, 1% prior
turnover capacity, 50 bps cost each way, liquidity slippage tiers 10/25/50/100 bps,
and canonical 5% maximum gap. Unknown execution rules are excluded. Current-category
proxy is **false**; category is excluded and historical sector is unknown. No
bounded assumption sensitivity was run. Costs/slippage are model assumptions,
not verified broker charges. Stored prices have no adjusted close. Historical
membership, revisions, instruments, suspensions/locks, rule and event completeness
remain unverified; known action windows fail closed.

Primary partitions are `all_descriptive` and a **39-date frozen test**, 30 August–
26 October. There are **zero training/validation folds**: the frozen partition
consumes this short mature interval. The split reserves expiry plus the longest
configured horizon. Only **12 dates / 60 selected names** have fully observed
paired ranking populations; 27 partial frozen dates are explicitly excluded from
the gate. Available-case descriptive results below retain the immature tail.

## Ten-session ranking, independent of fills

`Available / selected` includes every selection in the denominator; missing labels
are not zero returns. Net is modeled cost/slippage-adjusted signal-close to
horizon-close return. Excess subtracts matched DSEX return. Pooled precision is
the fraction of available names with positive excess. Equal-date metrics weight
each date equally and therefore can differ substantially from pooled metrics.

| Population | Available / selected | Pooled net % | Pooled excess pp | Pooled precision | Equal-date excess pp | Equal-date lift vs eligible pp |
|---|---:|---:|---:|---:|---:|---:|
| Eligible universe | 10,975 / 13,453 | -3.092 | -2.161 | 29.63% | — | — |
| Canonical top five | 193 / 250 | -0.810 | +0.100 | 37.82% | -0.042 | +2.129 |
| Price > SMA20 | 2,845 / 3,879 | -4.204 | -2.901 | 28.12% | -1.910 | +0.261 |
| Price > SMA20 > SMA50 | 991 / 1,336 | -3.168 | -2.026 | 35.92% | -1.762 | +0.409 |
| RSI oversold | 977 / 1,125 | +0.939 | +0.901 | 41.15% | -0.480 | +1.691 |
| Pulse top five | 200 / 250 | -3.631 | -2.714 | 33.50% | -2.714 | -0.543 |
| No trade | 0 / 0 | — | — | — | — | — |

Canonical missing labels comprise 50 insufficient-horizon and seven zero-volume
horizon rows. Eligible-universe missing labels comprise 2,438 insufficient-horizon
and 40 zero-volume horizon rows. Canonical equal-date precision is 37.92%; mean
within-date rank IC is 0.0603. RSI's positive pooled return and negative equal-date
excess are different denominators, not a resolved superiority claim. No-trade
retains cash; its 0% modeled cash return is separate from selection markouts.

All **50 dates** need a tie breaker at ranks five/six. Readiness and opportunity
are tied on 47; liquidity tier is also tied on 38. The deciding field is median
turnover on 38 dates, liquidity tier on nine, readiness on three, and symbol on
zero. Top-five behavior is therefore heavily driven by existing liquidity ties.

| Canonical stratum | Available / selected | Pooled net % | Pooled excess pp | Positive excess |
|---|---:|---:|---:|---:|
| Bearish regime | 134 / 170 | -0.597 | +0.029 | 36.57% |
| Neutral regime | 59 / 80 | -1.294 | +0.260 | 40.68% |
| Strong liquidity | 159 / 199 | -1.052 | -0.138 | 35.22% |
| Normal liquidity | 34 / 51 | +0.321 | +1.212 | 50.00% |

There are no bullish or thin-liquidity top-five selections in this diagnostic.
Actual position exposure is zero in every cohort because there are no supported
fills. Sector concentration is unknown for all 250 selections; current sector
metadata is not substituted for historical classification.

## Frozen factors and ablations

The predeclared experiment is `phase2-shadow-factors-v3`, ID
`ff9471e8883b4e69a4bb19614763b464b6fcdb5353e63606b7aada916628e1d7`.
Features are tested on the 13,453 eligible observations. A date with any required
missing family value keeps the whole baseline ordering.

| Variant | Complete feature rows / eligible | Fallback dates / 50 | Equal-date excess pp | Equal-date lift pp |
|---|---:|---:|---:|---:|
| Relative strength | 0 / 13,453 | 50 | -0.042 | +2.129 |
| Breadth persistence | 0 / 13,453 | 50 | -0.042 | +2.129 |
| Turnover/trades | 12,778 / 13,453 | 49 | +0.058 | +2.229 |
| Follow-through/exhaustion | 0 / 13,453 | 50 | -0.042 | +2.129 |
| All four families | 0 / 13,453 | 50 | -0.042 | +2.129 |
| Without relative strength | 0 / 13,453 | 50 | -0.042 | +2.129 |
| Without breadth | 0 / 13,453 | 50 | -0.042 | +2.129 |
| Without turnover/trades | 0 / 13,453 | 50 | -0.042 | +2.129 |
| Without follow-through | 0 / 13,453 | 50 | -0.042 | +2.129 |

Relative strength/breadth lack independently versioned market/classification
knowledge. Follow-through/exhaustion also lacks verified comparable raw-price
basis coverage. Known splits, unknown event vintages and unverified raw-basis
coverage make price-return features unavailable. Events learned after selection
cannot alter an earlier feature. The previous 12,823-row follow-through coverage
claim is withdrawn. Monetary turnover/trade-count participation retains its
independent reported-field provenance and complete/timely/traded-window checks:
missing price-unit evidence does not disable its 12,778 supported feature rows.
Its remaining 675 rows are unavailable; it reranks just one descriptive date.
Other identical returns represent fallback, not evidence of no factor effect. On
the common fully observed frozen population every variant's measured gain and
relative precision improvement are zero. There are no complete 20-date blocks,
so the paired uncertainty bound is unsupported. Baseline median turnover is
BDT84,682,500 and mean daily replacement 0.5455 on this population; missing sector
coverage still prevents the concentration safeguard from passing.

## Entry attrition and the 2.5% gap arm

Both arms select the same 250 names. Canonical permission rejects **187** before
entry; **57** require unavailable execution rules, five have no next session and
one retains unresolved earlier execution knowledge. There are **zero verified
activations, attempts, fills or available execution outcomes**. Outcome
classification keeps **63 unverified execution cases separate from 187 known
unfilled cases**. ENVOYTEX on 7 October has nine unknown-rule opportunities
followed by a zero-volume bar; that later bar cannot rule out an earlier fill.
The repaired simulator preserves uncertainty across blocked/apparent-fill bars
and a truncated still-open entry window. Tightening the gap to
2.5% preserves this same funnel; no supported fill reaches the gap comparison.

Bearish selections are 170 known non-permitted entries. Neutral selections have
17 known non-fills and 63 unverified execution cases. Strong liquidity has 175
known non-fills / 24 unverified; normal liquidity has 12 / 39. Thus neither
liquidity cohort supplies an executable policy-performance comparison. All
modeled cash ledgers stay at BDT1m with no modeled position exposure. The 63
unknown execution opportunities leave portfolio acceptance unverified: portfolio
status, cash-inclusive return and verified drawdown are **unsupported/null**,
with zero verified accepted fills. Modeled unchanged cash/marked drawdown is
retained only as diagnostic bookkeeping, not trading performance.

Ranking shows descriptive relative lift but negative modeled absolute returns.
For the selected names the next measured bottlenecks are permission and missing
rule evidence. This archive cannot determine whether entry confirmation, gap,
capacity or exit policy would improve filled trades. No stop/target/horizon
optimization is justified without supported matched fills.

## Separate diagnostic horizons

The independent `horizons=(3,5,20)` run uses the same archived observations.
Its frozen test is 29 dates, 30 August–7 October, with zero folds. It does not
replace the primary ten-session denominator.

| Horizon | Available / 250 | Insufficient / zero-volume | Pooled net % | Pooled excess pp | Equal-date lift pp | Fully observed dates |
|---|---:|---:|---:|---:|---:|---:|
| 3 | 232 | 15 / 3 | -0.564 | -0.343 | +1.428 | 23 |
| 5 | 221 | 25 / 4 | -0.786 | -0.320 | +1.552 | 21 |
| 20 | 145 | 100 / 5 | -0.599 | +1.200 | +4.495 | 1 |

## Forward clock and blocked disposition, 11 November

The sealed forward cohort is the **first 120 confirmed timely selection dates**,
including empty eligible slates, for this exact experiment and strategy. It was
declared before recording. Weekly checks expose coverage/maturity/counts only;
the formal comparison is once at that endpoint. Gate thresholds and factor
weights are unchanged and no code automatically promotes a policy.

Progress counts exact-version/experiment unique valid dates. Withdrawal of a
source, selection or latest outcome excludes that evidence. Cumulative ledger
acceptance is separate from modeled fills: overlapping holdings/cash rejections
cannot advance filled-outcome or distinct fill-date gates. An explicit `--assess`
waits for 120 timely dates and primary maturity, then seals one formal result
from immutable selection hashes and exact outcome vintages using the existing
ranking and entry gates. Missing safeguards remain unsupported. Weekly reports
do not repeatedly test efficacy. Synthetic temporary-schema tests also exercised
a nonempty 120-date/240-selection comparison, once-only reuse, and withdrawal;
those results are engineering evidence only.

| Gate | Historical usable evidence | Live forward evidence | Missing requirement / next checkpoint |
|---|---|---|---|
| Matching-version parity | 2,556 / 2,556; no mismatch | No live v3 receipt | First independently covered v3 publication |
| Ranking | 12 complete paired dates / 60 selections | 0 confirmed dates | 60 mature dates, 200 selections, effect/precision/bound and all safeguards; formal assessment at frozen 120-date endpoint |
| Entry | 0 supported filled outcomes in either arm | 0 filled outcomes / 0 fill-bearing dates | 60 distinct accepted-filled challenger dates, 200 available accepted fills per arm, paired gain/drawdown/cohort safeguards |
| Calendar | Backup ends 10 Nov | First timely live selection unknown | Verified next session/open, then ten subsequent sessions; entry near expiry matures later |

No finite entry-readiness date can be estimated from zero supported fills. No
calendar completion date is claimed before actual activation and a verified
future calendar. The first live receipt is unavailable in this local-only task.

An **isolated QA engineering receipt**, reference 10 November and recorded
11 November at 12:03:50 UTC, exercised the actual publication hook. It sealed
five names in each ranking/entry arm; retry preserved ID/hash/selection time.
Its next-open boundary is unknown, so it contributes **zero eligible cohort
dates**. A separate database regression sealed an explicit empty paired date,
verified immutable triggers and appended outcomes idempotently. These are
engineering checks, not live prospective observations.

## Reproduction and artifact identity

Original pre-repair artifacts remain preserved under their original names for
review audit. Corrected final-source primary/repeat use `run2-repair1-final-`;
the completed same-pass diagnostics/capture inventory use `run2-repair1-`.
Large raw artifacts are outside the repository under the task evidence directory
`C:/Users/asus/.codex/visualizations/2026/11/11/01a1c98e-71c3-7a52-a88b-26f7d7122bcd/trading-workflow/`.
`run2_repair1_final_diagnostic.py` and `run2_repair1_diagnostic.py` record exact CLI arguments in the matching `.log` files;
`summarize_run2.py` asserts full report equality and derives the stratum tables.
The 249,021,071-byte `run2-repair1-final-dse-input.json` is the immutable raw export. Primary
and offline repeat are byte-identical, including all audit/results, after
`--verify-manifest`; no database is consulted for the repeat.

| Identity | SHA-256 / manifest value |
|---|---|
| Raw archive bytes | `b94d8068988182b85cbf430d8cb31a480f5bc6ecc74323dab420faf6b82cf81f` |
| Dataset revision | `300390214ed2ad743e68cce615255d4d16f014063e0458d854510c36e991e226` |
| Primary manifest ID | `4b3808fe453bbb6b51f749b0a36ad9498f15e5e048ebc69afa8b74aa8a9b551b` |
| Primary config hash | `f07a4b6952e28fd762a3bc5f90a196fa0a1bfe479efb64642cd0cc6ab4e85fb9` |
| Final owning engine/replay source | `57473f4dc31bdd65febd6d04ebf240aebccd6241d6ac2a7fc1787d4f8b94873f` |
| Primary and repeat report bytes | `445d778da2fd3f3297f056d875450bd683181d0b4b847c5cfa521cfa75b7565a` |
| 3/5/20 manifest ID | `05f8923fe3abe8c540ab9ad6ce6b9fbd1c74370b48429196b195aedd6ec010bc` |

`run2-repair1-final-dse-primary-manifest.json` pins all observation/selection/outcome/research
revisions. `run2-repair1-capture_diagnostic-report.json` and `run2-repair1-captured-report.json`
retain per-member classifications, timestamps, parity and exclusions. Historical
schema stayed at `b5n6o7p8q9r0`; only the isolated QA clone received
`c6o7p8q9r0s1` for immutable shadow receipts. All promotion results remain
`UNSUPPORTED`, `promoted=false`; current production policy remains in service.

The corrected 3/5/20 and capture runs were completed on owning source
`533caf87d4c20b2234c2ce6d6865c136eb7808453eb554dc0c70f98749cbc039`.
The only subsequent source change projects confirmed forward-receipt availability
during formal assessment. Final primary and the earlier corrected primary have
identical audit/results/research in every field outside the source manifest.
The final-source primary/repeat is freshly verified; the earlier diagnostic
manifest retains its actual source hash rather than claiming a third rerun.

## Earlier repaired evidence guards

Run 2 repair 2 requires the original assessment cohort to retain latest confirmed
admission. A later nonwithdrawn late/unknown calendar vintage or a displaced
first-120 cohort supersedes that result without a second efficacy test; a later
still-confirmed vintage may reuse it. Invalid prices, retained uncertainty
reasons and unrecognized execution states cannot establish known portfolio cash
rejections or verified acceptance of dependent later fills. Real selection jobs
seal safeguard bypass evidence as **unmeasured/unknown**, rather than a literal
empty list; formal gates distinguish absent evidence, an explicitly observed
zero and actual bypasses. Publisher exclusions also precede restoration even
when captured bytes exist, retaining `NO_CAPTURED_INPUT`/`NO_PUBLISHED_RESULT`
separately from an undeclared input gap.

The SHA table above retains its actual completed repair-1 provenance. Current
factor coverage and unsupported cash-return qualifications above use the combined
v4 corrections. The supplied six captures have no affected publisher
exclusions, and the documented strict unknown executions already include the
invalid-price uncertainty guard. Earlier repair-2 primary/repeat artifacts
are preserved separately as `run2-repair2-dse-primary-report.json`,
`run2-repair2-dse-repeat-report.json` and `run2-repair2-dse-primary-manifest.json`
in the same external evidence directory. Exact check results, byte equality,
then-current source/manifest hashes and comparison against the earlier tables are recorded
in `run2-repair2.md` there. The earlier 3/5/20/capture artifacts keep their actual
source identity; they are not represented as a further current-source rerun.

## Combined current evidence and operating corrections

The earlier SHA table identifies completed reference artifacts without relabeling
their source. Current combined v4 primary, manifest, archive and exact repeat are
`combined-final-dse-*.json`; fresh 3/5/20 diagnostics for the corrected families
are `combined-final-dse-diagnostic-*.json` in the same evidence directory. Source
is `cc1c952d5f7c7800aaa19b38873b7b472361dee1d05bc0db8364d0687559dd0c`;
the raw archive remains SHA256
`b94d8068988182b85cbf430d8cb31a480f5bc6ecc74323dab420faf6b82cf81f`.
Exact current manifest/report hashes, full checks and comparisons are recorded
in external `combined-repair1.md`. The pre-freeze dependency-scoped research
measurement is in `combined-scoped-research-preview.json`; superseded all-family
basis preview files remain development evidence and are not current results.

A LIVE-only previous-session close cannot confirm a completed breakout; reliable
provisional lows still contribute to stop invalidation, and wall-clock session
end still controls expiry. Optional shadow SQL failure cannot corrupt the copied
durable cache winner. Background warm-cache migration retries record missing
receipts from that exact winner at the actual retry time, remaining late after
the deadline. Dashboard breadth counts changes only on the analysis date and
retains stale names as unknown. Missing selected and unselected histories remain
explicit denominators and return unsupported formal evidence without exceptions.

Per-order portfolio evidence preserves a known fill before an uncertain exit,
while subsequent dependent acceptance stays unknown. Routine progress queries
select one latest SQL head per receipt, including withdrawals, and omit the
sealed universe/full ledger. Mature unchanged source/benchmark revisions reuse
their labels and IDs; only one cohort endpoint stores the cumulative snapshot.
Corrections append revisions while original formal references remain readable.

## Final receipt-date provenance correction

The remaining forward-only metadata edge is corrected: a mature receipt's
`through_date` covers the latest actual exit used by its outcomes and input
revision, including a blocked exit completing after the nominal window, without
exceeding the evaluated session end. Actual temporary-schema regressions cover a
Jan15 nominal horizon, blocked exit through Jan18 and Jan19 completion, bounded
pending evaluation, appended legacy metadata correction, SQL latest/history
reads and unchanged mature reuse. No historical simulator, factor, threshold or
weight changes in this bounded correction.

The latest final primary/repeat artifacts are
`combined-repair2-final-dse-{primary-report,repeat-report,primary-manifest}.json`;
exact source/manifest/report hashes and all-field equality against the completed
combined-v4 report are recorded in external `combined-repair2.md`. The completed
3/5/20 diagnostic retains its actual `cc1c952d...` source identity above: it uses
the same unaffected historical numerical logic, and is not relabeled as another
rerun after this forward-only receipt-date correction.

## Approved final closure extension

Two further bounded corrections preserve the existing strategy and thresholds.
Portfolio exit uncertainty attaches to accepted or plausibly accepted positions;
a known never-held overlap rejection no longer makes a later independent fill
unknown. Public maturation/progress and persisted receipt regressions compare
available versus unverified hypothetical rejected exits and retain both accepted
fills. The common portfolio-bearing receipt, including a timely empty selection,
dates all incorporated exit/equity facts and records contributing selection/source
revisions. Multi-selection tests cover Jan19 completion, Jan18 evaluation limits,
append-only legacy correction, SQL history/head selection and unchanged reuse.

The latest primary/repeat artifacts are now
`extension1-final-dse-{primary-report,repeat-report,primary-manifest}.json`;
external `extension1-repair.md` records current source/hash verification and the
comparison of every non-manifest field against the preceding combined report.
Earlier artifacts remain preserved. The completed 3/5/20 diagnostic keeps its
actual `cc1c952d...` identity above. The snapshot correction affects forward
metadata, and the historical strict primary has zero supported filled paths
affected by the rejected-exit correction. No new live prospective evidence,
strategy promotion, activation or deployment is implied.


## Final end-to-end review after browser fixes

Reviewed the combined dirty implementation against base `24a3edb`, including new files: publication/session locks and durable winner selection, immutable capture coverage, quote/path applicability, shared account marks, volume and risk facts, Dashboard/Pulse provenance, capture restoration and next-open boundaries, execution uncertainty, mature paired evaluation, append-only forward receipts and the frontend mappings. This was an owning-context code review and verification, not a new independent reviewer or a new historical strategy experiment.

One remaining API-contract gap was repaired: applicability reason codes were unrestricted strings despite a fixed set of evaluator outcomes. The backend schema now declares all 17 existing values, the frontend DTO matches them, and a schema/validation regression rejects an undeclared code. No trading threshold, rank, canonical result, publication vintage or strategy version changed in this repair.

Centralization check: live canonical generation and historical replay call the shared decision engine. Current applicability remains a read-time projection with one evaluator; displayed account marks use the common mark resolver; volume baselines come from shared facts. UI additions format supplied applicability, trading risk and breadth rather than decide permission. Historical execution simulation remains a separate policy model with explicit rule availability, costs and uncertain bar ordering; it is not asserted to be an observed live fill.

Final verification on the existing isolated November 10 QA clone:

- Backend: **804 passed, 13 skipped**. Publication, capture/replay, current-surface and shadow-receipt PostgreSQL regressions ran using the pre-existing isolated schema fixtures. The 13 skips are the separately configured Tax Planner persistence tests.
- Affected frontend: **95 passed** across 13 files; TypeScript and whitespace checks passed.
- Full frontend: **366 passed, 35 failed**. All failures were in unchanged `features/wealth/tax-v2/workspaces.test.tsx`. A clean export of HEAD reproduced the representative missing `Allowance, dependents and minimum Tax · edit` summary failure (1 failed, 41 deliberately filtered tests). This verifies that representative failure predates the trading diff; the remaining Tax Planner failures were not individually baseline-replayed or repaired in this scope. The full frontend suite is therefore not reported green.
- The first unconfigured backend invocation was stopped without a result; an isolated targeted invocation from the wrong working directory also failed two tests on configuration parsing. The correctly configured full QA runs supersede neither historical errors nor their record: they passed 803 tests before the new contract test and 804 afterward.

The prior browser retest remains the UI evidence for the rendered fixes; this final contract-only repair changes no rendered values. Authenticated portfolio/watchlist arithmetic, fresh intraday applicability transitions, exceptional live timings, and prospective outcome maturity remain unavailable in that browser snapshot. New summary counterargument fallback is covered by tests, not by rewriting an old immutable publication. The historical primary/repeat artifacts cited above were not rerun or relabeled for this schema-only change. No policy promotion or deployment was performed.


## Evaluation correction following the November 12 review

The frozen experiment is now `phase2-shadow-factors-v4`. Its uncertainty method
is a paired circular moving date-block bootstrap using the existing 20-session
block length, 2,000 replicates and seed 271828. Every replicate has the original
number of paired dates, including trailing dates. Reports include `sample_size`,
`block_sessions`, `block_count` (complete-block equivalents) and `method`.
The minimum remains three complete-block equivalents. This changes the
experiment identity and requires a new prospective experiment cohort. Previous
captures remain usable inputs for retrospective diagnosis and parity. Previously
recorded selections and formal assessments retain their original experiment
identity and cannot be relabeled as prospective evidence for v4. The historical
numerical results above describe their original runs and have not been rerun.
The live strategy version, ranking factors and entry thresholds are unchanged.

Ranking safeguards retain unavailable turnover as null and report measured and
missing counts. Any missing required turnover prevents the liquidity safeguard
from passing. Measured zero remains zero.

Modeled outcome corrections append `supersedes_revision` to changed receipts.
A per-selection row lock serializes adoption, and insertion time uses the actual
clock after that lock. An exact A→B→A reversion has a new revision pointing to B,
while A→A reuses the current receipt. Latest reads continue to prefer the greatest evaluated date, so an earlier
partial evaluation cannot supersede later facts. The existing immutable rows,
latest/history reads and once-only
formal assessment policy are retained.


Verification of the November 12 correction used the isolated local QA clone.
The final backend suite passed **963 tests, with 13 skipped** (unconfigured Tax
Planner persistence). Affected frontend suites passed **359 tests** across 32
files, and TypeScript and whitespace checks passed. Astra's final closure found
no remaining material code issue in this scope. Direct local API output retained
399 measured returns from 426 stocks; 27 missing prices and turnovers were null.
The attempted Chrome visual retest was stopped by the computer-use tool because
it could not confidently verify the active browser URL. Current visual browser
acceptance remains incomplete. Fresh intraday applicability and mature v4
prospective results remain unavailable in the November 10 backup.


## November 12 Chrome retest closure

A fresh tab in the same Chrome profile resolved the stale-tab control failure.
The local November 10 QA environment was checked in English and Bangla across
Dashboard, Signals, Scanner, Market Pulse, FARCHEM Stock Details and the
fixture account's Portfolio/Watchlist views. The heatmap exposed measured sector
coverage and RNSPIN's unavailable price and turnover. FARCHEM retained the dated
buy thesis, unverified entry and 1.75 planned reward/risk. Pulse retained its
219-stock cohort and measured positive sector leader in both languages.
Portfolio reconciled to BDT2,665 value, BDT96.2 gain and BDT52.5 daily movement.
Its three saved stocks contain two holdings and one watchlist-only stock.
Mobile Portfolio and Scanner and a dark Scanner view were also inspected.

The retest corrected the shared hero's missing search locale, localized its
search placeholders and accessible name, translated Scanner discovery reasons
and Portfolio group labels, corrected the singular saved-stock count, and
smoothed the Bangla dated-price sentence. The subsequent 148 affected frontend
tests passed across 13 files, including the shared search locale regression.
TypeScript and whitespace checks passed. This UI-only follow-up leaves the
963-test backend result applicable. QA ended signed out with Bangla, light mode
and the normal viewport restored. Screenshots are retained outside the repo.

These checks supersede the earlier Chrome access blocker for the available
local cases. Fresh intraday applicability, a missing-sector Pulse session and
mature prospective v4 outcomes were unavailable in this backup. Their browser
transitions remain unverified, with deterministic edge cases covered by tests.
This retest did not perform a full screen-reader or measured-contrast audit.
