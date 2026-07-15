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
