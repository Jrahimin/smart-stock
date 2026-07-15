# Trading Intelligence Audit and Monitoring Runbook

## What is protected

Phase 7 adds four operational controls without changing the UI layout or the
compatibility recommendation fields:

1. Canonical results carry content-derived price-data, event, and complete-input
   revisions under `trading-input-v1`.
2. Universe and stock-workspace Redis identities separate strategy, threshold,
   and input-schema releases. Universe envelopes also bind the latest source
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

## Incident response

| Code/failure | Check | Safe response |
|---|---|---|
| `STALE_SOURCE_REVISION` / `STALE_SESSION` | Compare `/market/freshness`, ingestion completion, and rebuild logs | Re-run the background cache rebuild; never relabel the stale payload as current |
| `PAYLOAD_REVISION_MISMATCH` | Inspect Redis serialization and row identity fields | Reject/delete only the affected versioned key, then rebuild |
| `CROSS_SURFACE_RESULT_MISMATCH` | Compare input hash, shared ID, action, and primary reason | Treat as a release blocker; detail/list must use the same canonical input |
| `ACTION_DISTRIBUTION_DRIFT` / `ELIGIBILITY_RATE_DRIFT` | Check source coverage, policy/version changes, and sector concentration | Record whether the change was approved; investigate unexplained shifts before claims |
| Snapshot persistence error | Check migration head and database permissions | Keep live cache behavior, apply/fix the migration, then rebuild to append missing identities |
| Replay manifest mismatch | Read the named mismatched hashes | Do not compare reports as the same experiment; archive the new manifest separately |

## Deployment

Apply Alembic revision `m0f1a2b3c4d5` before enabling Phase 7 snapshot writes.
Versioned Redis keys make an approved release cold by design; run one background
rebuild after deployment. Older unversioned and strategy-only keys remain in the
invalidation cleanup list but are never accepted as current.

## Known limitations

Decision snapshots store the compact result and exact hashes, not a second copy
of every raw OHLCV/status row. Current category, suspension, circuit, free-float,
and some corporate-action histories are not fully effective-dated. Therefore a
snapshot can prove which observed input identity produced an output, while a
backtest manifest can verify the current dataset reproduces a run; neither can
recover source revisions that were never archived.
