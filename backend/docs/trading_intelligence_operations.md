# Trading Intelligence Audit and Monitoring Runbook

## What is protected

The operational controls protect both the internal compatibility action and the
Phase 3 public decision taxonomy without changing the UI layout:

1. Canonical results carry content-derived price-data, event, and complete-input
   revisions under `trading-input-v2`.
2. Universe, stock-workspace, dashboard, and Pulse Redis identities separate
   strategy/input releases from `decision_taxonomy_version`. Universe envelopes also bind the latest source
   synchronization timestamp and a deterministic row revision.
3. Successful universe rebuilds append missing results to
   `canonical_decision_snapshots`; no update path exists for prior identities.
4. Backtests emit reproducible manifests, while the universe monitor detects
   stale source generations, malformed lineage, cross-surface differences, and
   large like-for-like action/eligibility distribution shifts.

## Normal operation

`rebuild_market_read_cache` remains overview → sectors → movers → universe. The
universe step computes rows, appends immutable snapshots, validates the new
cache envelope, compares it with the prior same-version payload for drift, then
overwrites Redis. Snapshot or monitor logging does not change a decision.

Run the read-only current-state check from `backend/`:

```powershell
python -m app.scripts.check_trading_intelligence --exchange DSE
```

Exit codes: `0` means no error-severity issue, `1` means an identity/freshness
error was detected, and `2` means the cache/contract could not be inspected.
Warnings include distribution drift or a stored prior input revision; inspect
them, but do not alter strategy thresholds automatically.

The JSON output also includes `decision_funnel`. Its public action counts
(`potential_buy`, `wait`, `sell`, `unavailable`) reconcile exactly to
`total_universe`; the Python `.buy` accessor remains a temporary compatibility
alias for `potential_buy`.
Each row is assigned once to the prioritized blocker buckets for data,
liquidity, extension, entry plan, risk, or `other_or_unblocked`; `reconciles`
must be true. The same funnel is logged after a universe cache write.

## Incident response

| Code/failure | Check | Safe response |
|---|---|---|
| `STALE_SOURCE_REVISION` / `STALE_SESSION` | Compare `/market/freshness`, ingestion completion, and rebuild logs | Re-run the background cache rebuild; never relabel the stale payload as current |
| `PAYLOAD_REVISION_MISMATCH` | Inspect Redis serialization and row identity fields | Reject/delete only the affected versioned key, then rebuild |
| `CROSS_SURFACE_RESULT_MISMATCH` | Compare input hash, shared ID, action, and primary reason | Treat as a release blocker; detail/list must use the same canonical input |
| Decision taxonomy mismatch | Compare canonical/envelope `decision_taxonomy_version` and cache key | Reject the mixed or old key and rebuild; never infer a v2 display action from a v1 record |
| `ACTION_DISTRIBUTION_DRIFT` / `ELIGIBILITY_RATE_DRIFT` | Check source coverage, policy/version changes, and sector concentration | Record whether the change was approved; investigate unexplained shifts before claims |
| Snapshot persistence error | Check migration head and database permissions | Keep live cache behavior, apply/fix the migration, then rebuild to append missing identities |
| Replay manifest mismatch | Read the named mismatched hashes | Do not compare reports as the same experiment; archive the new manifest separately |

## Deployment

Apply Alembic revision `n1a2b3c4d5e6` (which follows `m0f1a2b3c4d5`) before
enabling completed-session canonical rebuilds. Existing summaries before the
migration date are backfilled finalized; same-day rows remain provisional until
the daily finalization path succeeds.
Versioned Redis keys make an approved release cold by design; run one background
rebuild after deployment. Older unversioned and strategy-only keys remain in the
invalidation cleanup list but are never accepted as current.

The Phase 3 public taxonomy adds no Alembic revision. Its additive fields are
stored in the existing immutable JSON payloads; v2 shared IDs and versioned
cache keys prevent prior snapshots from being overwritten or silently reused.

## Known limitations

Decision snapshots store the compact result and exact hashes, not a second copy
of every raw OHLCV/status row. Current category, suspension, circuit, free-float,
and some corporate-action histories are not fully effective-dated. Therefore a
snapshot can prove which observed input identity produced an output, while a
backtest manifest can verify the current dataset reproduces a run; neither can
recover source revisions that were never archived.


## Capture inventory and version activation

Use a read-only database connection (no API or scheduler) to inspect durable
captures without Redis or rebuilds:

```text
python -m app.scripts.check_trading_intelligence --exchange DSE --capture-inventory --all-members --start 2026-11-03 --end 2026-11-10 --output capture-inventory.json
```

The command additionally opens a read-only transaction. It reports the restore's
end date, actual observation times and lag after configured close, invalidations,
versions, missing session dates, unique listed/input/published/excluded ID sets,
action/blocker distributions, journal counts and matching-version parity for
input hash, shared ID, action, eligibility, readiness and levels. Without
`--all-members`, parity is explicitly limited to eligible and blocked examples.
Unsupported engines and missing inputs are exclusions, never parity successes.

The report's `first_version_publication_observed_at` and generation ID record
the first durable publication of the active strategy in the selected inventory.
A null value means this database has no observed activation receipt; source
implementation is not deployment. Record the deployed build/version freeze and
first eligible publication when activated. No production activation occurred as
part of local implementation. Historical captures contribute inputs only to v3
assessment; prospective evidence still requires the exact frozen version,
experiment and both arms' selections before the next opening.

The November 11 local backup inventory through November 10 verified all six v2
publications (426 members each): all 2,556 matching-version restorations matched
hash/identity/action/eligibility/readiness/levels. The Nov 3 capture is a later
recovery observed Nov 4, not timely prospective selection evidence. This result
does not establish event-feed completeness, adjustment history or future fills.


The reviewed capture inventory distinguishes **internal reconciliation/parity**
from **external listed-population coverage**. The six old v2 captures retain all
2,556 matching-version parity matches, but their output-derived membership does
not independently prove the listed set: `coverage_status=UNKNOWN` and the required
monitor window is unhealthy until that evidence exists. This is a coverage gap,
not a comparable-input parity failure. New captures include independently
observed membership, market counts and explicit exclusions. Missing required
session dates, empty captures and unavailable parity samples fail health.
Only a verified compatible capture can supply the first-version publication receipt.

## Capture replay and sealed forward comparison

The replay boundary is strictly before the next **verified exchange session's
configured open** in Asia/Dhaka, independently checking observation, calculation
and recorded selection instants. Feature/event knowledge cannot arrive after
selection even if it precedes the next opening. `captured` mode never fills gaps
by reconstruction. `capture_diagnostic` retains late/unknown-boundary vintages
only for explicit restoration; both expose exclusions. `--publication-id` selects
an archived correction without treating it as an extra independent session.
Use the commands and override format in `backtesting.md`.

Alembic `c6o7p8q9r0s1` adds immutable paired selection/outcome receipts. Apply it
only to the authorized application/QA database, never to a read-only diagnostic
restore. The normal durable publication path records compatible v3 selections
once per exchange/session/experiment/version, including empty slates. A retry
caches the durable winner and retains the original selection receipt. Outcome
maturation appends idempotent revisions separately; immutable triggers still
guard both tables. Publication remains usable if shadow receipt work is
unavailable, with failures logged for the progress check.

`python -m app.scripts.check_trading_shadow --exchange DSE` reports read-only
coverage and counts. Missing tables report `SCHEMA_UNAVAILABLE`; no implicit
migration occurs. `--mature` is an explicit write action that appends outcomes
using the sealed economics. Check actual deployed version/experiment and both
arms before claiming the forward clock started. The first 120 confirmed timely
dates form this frozen cohort, including empty sessions; weekly reporting is
coverage/maturity only, with one formal endpoint assessment. There is no
automatic promotion.

The measured local-only results and dated blocked gate table are in
`trading_decision_consistency_report_2026_11_11.md`. Its archive repeat is exact;
historical membership, event/rule/PIT coverage and live elapsed sessions remain
missing. One QA receipt has an unknown next-open boundary and contributes zero
eligible prospective dates. Production activation and the first live timely
dual-arm receipt are still unobserved.

After 120 exact-version/experiment timely dates, explicitly run
`python -m app.scripts.check_trading_shadow --exchange DSE --assess` on the
authorized migrated application database. It waits for primary label maturity
and seals one receipt-backed formal comparison; missing safeguards stay
unsupported, and no automatic promotion occurs. The immutable assessment is
stored as a separate outcome kind, so no further migration beyond c6 is needed.
Weekly progress counts accepted available portfolio fills, not independently
modeled candidate fills. Source/selection/outcome withdrawal excludes evidence;
historical versions cannot share the active clock. Configure verified exceptional
starts in `MARKET_SESSION_OPEN_OVERRIDES` before publication. A known observed
but unfinalized market date prevents skipping to a later finalized opening.

Assessment reuse additionally requires its exact original cohort to remain
confirmed in the latest outcome vintages. Calendar corrections yielding late or
unknown admission, or a displaced first-120 cohort, supersede that result without
another efficacy comparison. Later still-confirmed vintages can reuse it.
Unmeasured safeguard bypasses are sealed as unknown and block the guard; missing
evidence must never be reported as observed zero. Invalid or unknown execution
states also leave dependent portfolio acceptance unknown, while clean holdings
and budget rejections remain measured. Capture replay honors explicit publisher
exclusions before evaluating available bytes and preserves the publisher reason.

The background warm-cache rebuild now repairs a missing compatible forward
receipt after migration without recomputing the dated generation. It reloads the
exact durable winner, checks currentness/withdrawal and records the actual retry
instant. Repeated receipt IDs/times stay unchanged; a retry after next open stays
late. Optional shadow SQL failure rolls back that work while cache publication
uses the already copied durable serialized winner. No read handler writes receipts.

Forward weekly queries select latest outcome heads in SQL, including invalidated
heads, and project only the count/admission fields. Mature unchanged label history
is reused by scoped source/benchmark revision; only the cohort endpoint carries a
cumulative ledger snapshot. Missing histories and uncertain exits stay explicit
in per-order acceptance and formal coverage. Replay v4 scopes unknown raw-basis
coverage to price-return factors; supported reported monetary turnover/trades
diagnostics continue independently.
