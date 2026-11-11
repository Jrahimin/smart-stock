# Market Universe Module

## Invariant

For one published market generation there is one canonical current trading
decision per stock. Signals, Scanner, Stock Explorer, Stock Details, Watchlist,
Portfolio and Market Pulse consume that reusable result. Consumer services may
add presentation or domain-specific context, but they do not calculate a second
current action.

```text
market_data_generations.sync_id
        ↓
one exchange-wide canonical universe calculation
        ↓
generation-specific Redis payload
        ↓
all trader-facing consumers
```

`MarketUniverseService.resolve_generation_context()` resolves an immutable
`PublishedMarketGeneration` containing `trade_date`, `sync_id`, source timestamp
and current presentation state. The same object is used for input loading,
calculation and cache publication.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/universe-rows` | Canonical rows plus exchange, generation, state and lineage metadata |

The endpoint is Redis-only on the normal HTTP path. A missing current-generation
payload starts a coalesced background rebuild and returns HTTP 503 with an
updating message. It never performs an uncontrolled full-exchange calculation
inside the request.

## Canonical row

`ScoredUniverseRow` contains:

| Field | Contents |
|-------|----------|
| `stock` | Compact stock identity |
| `session` | Published-session price, trade date, volume, turnover and quality |
| `technical_snapshot` | Shared indicators and price structure |
| `eligibility` | Session participation, OHLCV quality, liquidity and corporate-action gate |
| `decision` | Canonical summary, action, constraints, versions, `shared_decision_id` and `input_hash` |
| `analysis` | Reusable opportunity, risk, directional evidence, reliability, trade plan, liquidity and price position |
| `scanner` | Versioned scanner matches and deterministic ranks |

The payload deliberately excludes OHLCV arrays, chart models, patterns, swing
points, ownership, valuation, events and page-specific briefing objects.

Stocks with no trade in the published session retain correct last-traded price
semantics. Eligibility records the missed-session state and prevents a stale
last trade from becoming a fake current signal.

## Cache identity and retention

```text
universe:scored:{exchange}:{market_sync_id}:{strategy_version}:{threshold_version}:{input_schema_version}:{decision_taxonomy_version}
```

Live generations expire after 24 hours; finalized generations use a 30-day
safety horizon. This retains a small operational window without storing every
snapshot in PostgreSQL. Older live keys cannot overwrite the current key and
expire naturally.

Cache acceptance validates the generation id, session, source revision, engine
versions, scanner version, row identities and aggregate payload revision.
`data_state` is intentionally not part of calculation identity:

```text
G124 LIVE → G124 STALE → G124 FINALIZATION_PENDING → G124 FINALIZED
```

These state changes reuse G124. A new `sync_id` is required only when canonical
inputs change.

## Rebuild fencing and overlap control

`market_cache_rebuild.py` uses the existing per-exchange Redis lock. Local
background spawns coalesce repeated requests into at most one follow-up run.
The rebuild resolves a generation once, calculates from that context, and checks
the current generation both before and after the Redis write. If G124 publishes
while G123 is calculating, the G123 result is discarded and the loop builds the
latest generation. Lock release uses an owner token so an expired/replaced lock
cannot be deleted by an older worker.

Redis unavailability or a cold current-generation cache degrades explicitly.
HTTP consumers do not fall back to a database-wide universe calculation.

## Consumer rules

| Consumer | Use |
|----------|-----|
| Signals / Explorer / Scanner | Read canonical rows directly |
| Stock Details | Select the symbol row from one canonical snapshot; add patterns, ownership, valuation and events only |
| Watchlist / Portfolio | Project canonical decisions; use `null`/updating when unavailable, never fabricate `WAIT` |
| Market Pulse | Rank canonical rows and persist finalized aggregates from the same cached generation |
| Dashboard | Uses its lightweight market snapshot, fenced to the published generation; it is not a decision consumer |

Consumer modules must not call `list_market_price_windows` and run the decision
engine independently. Backtesting remains a separate historical use case and is
not a current trader-facing surface.

## Decision-input corrections

Historical OHLCV corrections, relevant stock-detail event inputs, manual daily
prices and market summaries publish a new compact generation manifest after the
write succeeds. That new id invalidates server and browser analysis identity.
Profile-only presentation metadata does not advance the generation.

## Main files

| File | Responsibility |
|------|----------------|
| `market_universe_service.py` | Generation resolution, cache read/write, fencing and canonical snapshots |
| `market_universe_compute.py` | One exchange-wide decision and scanner calculation |
| `market_universe_schemas.py` | Canonical row and envelope contracts |
| `market_universe_cache.py` | Generation/version-aware Redis keys |
| `market_universe_lineage.py` | Deterministic payload revision |
| `../../jobs/market_cache_rebuild.py` | Locked latest-generation rebuild |
| `../trading_intelligence/decision_snapshot_repository.py` | Finalized audit snapshots from canonical rows |


## Current entry applicability (Release A, November 2026)

`rows[].entry_applicability` and `rows[].decision.entry_applicability` are optional
read-time additions. Signals returns the same projection in `decision`; stock
decision support returns it both at the top level and in `decision`. They never
replace the finalized action, holder action, reference prices, or shared ID.
The workspace's cached plan and Pulse's cached response receive a fresh projection
on every read. Request handlers never rebuild the universe inline.

The object contains `status`, `reason_code`, `controlling_blocker`, `assessed_at`,
`quote_session_date`, `source_observed_at`, and `publication_observed_at`.
Precedence is withdrawal (`INVALIDATED/PUBLICATION_INVALIDATED`) first, then:

| Status | Ordered reasons |
|---|---|
| NOT_APPLICABLE | ACTION_NOT_PERMITTED, ELIGIBILITY_BLOCKED, NO_ENTRY_PLAN |
| INVALIDATED | STOP_BREACHED, PRICE_BASIS_CHANGED |
| EXPIRED | PLAN_EXPIRED |
| UNVERIFIED | COVERAGE_UNKNOWN, QUOTE_UNUSABLE, PATH_INCOMPLETE, TERMS_UNKNOWN |
| OUTSIDE_ZONE | TARGET_REACHED, BELOW_ENTRY_ZONE, ABOVE_ENTRY_ZONE |
| AWAITING_CONFIRMATION | COMPLETED_BREAKOUT_REQUIRED, ENTRY_SESSION_PENDING |
| APPLICABLE | ENTRY_TERMS_MET |

Entry zones are inclusive. Fixed targets are checked before zone bounds;
targetless plans skip that check. Expiry counts verified exchange sessions
strictly after the reference session, including the final session until it ends.
A completed breakout activates entry on a later permitted session, never the
confirmation close itself. Weekend/holiday weekdays are not synthesized into
the verified calendar.

A traded, valid, non-suspicious running low at or below the published stop ends
a fresh-entry plan. Observed daily-price revisions and their previous payloads
retain overwritten lows after recovery. Lows on or before the publication's
observed local date cannot prove a post-publication breach. Missing intervening
bars, journal continuity, or ordering leave the path unverified. Future actions
or lows after plan expiry do not invalidate an earlier entry window.

`display_quote` adds `previous_close`, `source`, `data_quality`, `ingested_at`,
`source_observed_at`, and `max_age_seconds` (default 1800). Its price/change/date
are one observation. `ingested_at` is database ingestion time. Existing stored
DailyPrice rows have **no upstream observation timestamp**; their
`source_observed_at` is explicitly null and cannot affirm current entry.
No-trade, stale, suspicious, non-positive, or undated quotes cannot renew entry
permission. A dated last-known positive mark can still value an existing holding.

## Publication and policy identity (Release B)

Finalization and publication use short PostgreSQL transaction advisory locks
keyed by exchange and session. Checks and writes remain inside the same lock
until commit. Duplicate decision publishers read the exact durable winner and
cache that payload, including after Redis failure or eviction.

Fallback finalization without a LIVE manifest requires a finalized DSEX summary
and same-session distinct active-symbol coverage meeting the normal configured
source minimum and coverage percentage. It records verified accepted/fetched
counts; zero-accepted or partial fallback publication is refused.

Canonical strategy `trading-intelligence-v3` excludes the current bar from its
positive prior-volume median even for singleton history. Volume facts supply
prior sample count, median baseline, current volume, ratio and classification
consistently. Completed-close confirmation at 1x and expanded participation at
1.8x retain separate meanings. Unknown prior volume never confirms a breakout.
The strategy, threshold, input schema, taxonomy, shortlist and scanner versions
participate in generation identity; scanner version also appears in Redis keys.
Explicit v2 replay retains the original singleton baseline and risk metadata.
Historical v2 captures remain inputs only for assessment of the new policy.

Signals' `risk_label` now uses canonical trading risk for v3; the legacy
composite label remains in `legacy_composite_risk_label` for Pulse attention-score
compatibility. `measured_support` and `opposing_constraint` complement the
controlling reason; ties retain stable component/constraint order.


### Run 1 review corrections

Withdrawn durable heads remain readable as their exact dated identity with
`INVALIDATED/PUBLICATION_INVALIDATED`; neither a warmed Redis value nor an older
generation can restore entry permission. A missing durable winner stays distinct
from a withdrawn one. Currentness means the selected head is still the selected
head, including an explicitly withdrawn head.

Observed trading-session membership comes from positive published manifests
and finalized DSEX dates independently of quote freshness. A manifest becoming
STALE cannot remove its traded lows or journal evidence. A verified observed
session ends at the configured exchange close even while finalization is pending.
Price-basis events are typed: split, bonus, rights, merger and approved/paid
ex-dividend events can change units; meetings and trading resumptions do not.
Post-action raw lows are never compared to old-unit stops. A genuine comparable
stop before the action retains STOP_BREACHED precedence.

New captures record the independently queried active listed set at calculation,
its observation time and verified market counts, plus explicit excluded-member
IDs/reasons. Legacy captures whose membership was derived from output rows have
UNKNOWN external population coverage even if their internal sets and same-input
parity reconcile. `decision-capture-v2` advances generation identity without
changing strategy inputs or old v2 hashes. Empty publications, missing required
dates and zero-accepted finalized manifests cannot be certified healthy.

The read-time overlay uses metadata-only publication queries and groups path
observations once. Its quote generation and selected observation are bound to
the returned snapshot. Universe metadata adds `quote_session_date`,
`quote_data_state` and `quote_is_live_session`. Workspace cache hits refresh both
applicability and displayed price/change/valuation metrics from that observation,
including same-ID raw quote revisions; a different generation at return is rejected.


An older durable thesis may be displayed with `decision_status=UPDATING` while
the required finalized generation has no winner. Its prior membership coverage
does not renew current entry: the projection requires the exact required winner
and returns `UNVERIFIED/COVERAGE_UNKNOWN` otherwise. Required generation identity
is checked again at the projection boundary. Pulse's actionable trigger stays false.
Basis events are bounded by the permitted **date interval**, including holidays
and weekends between bars; an event after the final permitted session is ignored.
# Combined review clarification

Completed breakout confirmation requires a finalized exchange-session close and
volume observation. A prior LIVE-only bar can retain a reliable traded low for
stop-breach evidence, but cannot confirm a completed breakout. Wall-clock end of
the final permitted traded session still expires the plan if finalization is
missing; confirmation completeness and expiry are separate facts.

Optional forward-receipt failure cannot replace or expire the serialized durable
winner used for cache publication. Background warm-cache retries may repair only
a missing compatible receipt using the exact winner and real retry time;
canonical decisions are not recomputed and public reads remain read-only.
