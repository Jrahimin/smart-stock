# Trading intelligence Phase 2 — local implementation

Release 2A corrected replay was implemented and its focused checkpoint passed
before Release 2B was added. The production Phase 1 decision engine and UI were
preserved; only backtesting modules, its CLI, focused fixtures and documentation
changed. User-owned DSEX files were not edited.

- [x] Per-strategy policies and auditable selection/activation/attempt/fill/exit.
- [x] Conservative conditional ambiguity and adverse open-position ordering.
- [x] Effective rule evidence/exclusions, rounded entries, gap/capacity checks,
      settlement/locks/blocked exits, share/cash actions and capital ledger.
- [x] Independent common markouts, date-matched lift/IC, full denominators,
      chronological partitions, actual-end purge and raw archive reproduction.
- [x] Frozen factor/ablation comparisons, separate entry experiment and separate
      hard ranking/entry promotion gates with explicit unsupported/shadow results.
- [x] Default BDT50k orders / BDT1m cash / costs and size/slippage sensitivities.
- [ ] Verified real PIT/event/rule/instrument coverage and sufficient held-out data.
- [ ] Prospective shadow confirmation and separately authorized promotion.

Local replay defaults to excluding unknown execution rules. Historical DB
snapshots remain unverified PIT inputs, and raw action effective dates without
knowledge timestamps do not become past event knowledge. Immutable supplied
captures can reproduce past decisions and corrections; capture-declared gaps
remain promotion blockers. No actual-data predictive conclusion, fitted model,
production promotion, migration, configured DB write or provider call is claimed.

The 2A checkpoint was 33 passing local regression tests (including 11 new replay
fixtures). Subsequent local evidence and frozen synthetic baseline files are
recorded in the external `stockwealth-workflow` handoff. A synthetic frozen
baseline proves mechanics/reproduction only; it cannot establish profitable
performance. The external workflow evidence records review and verification for
each frozen source version.

The local replay repairs record actual fill timing, preserve pending exits through
invalid bars and out-of-limit rounded fills, rebase carried portfolio marks for
share and cash actions, and leave market/sector challenger inputs explicitly
unsupported without independent point-in-time observations. Canonical parity is
reported separately. Uncaptured decisions use the production lookback for
prices and the last 90 exchange sessions for eligibility. Missing and no-trade
sessions still count, and replay uses the full calendar for execution and folds.
The external workflow evidence includes the reproduced synthetic CLI reports.
