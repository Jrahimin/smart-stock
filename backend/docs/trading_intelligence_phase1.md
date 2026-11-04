# Trading intelligence Phase 1

Implemented locally on November 4, 2026. The shared canonical engine still owns decisions. Existing routes and layouts are retained. Phase 2 replay, research models, threshold changes, and regime relaxation are outside this change.

## Release 1A: finalized inputs and publication

`resolve_finalized_decision_generation` resolves only FINALIZED sessions. Its identity includes the source generation, bounded source revision, and policy versions. Each canonical row additionally hashes its symbol, exchange, finality, dates, prices (including trade counts), calendar, known events, adjustment status, and strategy inputs. Current quote identity is separate. Provisional rows cannot enter the canonical input builder.

The declared finalized exchange calendar covers the 90-session input window. Expected sessions, observed rows, valid OHLC, traded sessions, zero-volume sessions, and missing sessions remain separate. Participation uses the calendar denominator. Unknown calendar/event/adjustment coverage remains explicit. An unresolved corporate action guards every supplied feature window containing the event. Full verified source adjustment or a clean post-event window is required to restore supported features; price gaps never imply adjustment factors.

`build_quote_projection` publishes price, price change, date, observation date, and status as a unit. Universe and Details use the same bulk read for the latest observation and latest valid OHLC at the quote boundary. A no-trade placeholder uses the last valid quote and its change, even when that quote is newer than the published decision. An absent session observation remains distinct from observed no trade. Details SSR and the hydrated header use the same projection. Explorer, Scanner, Watchlist and Smart Signals show the date and publication status of the data they render.

Completed generations are captured transactionally in `decision_generation_captures`: all membership/input payloads and all result rows are committed together before Redis publication. Redis is an accelerator; a durable complete generation remains readable if Redis publication fails. An unfinished generation exposes the prior validated generation with its original identity/date and `UPDATING`. An invalidated head is unavailable, and a cold cache without a validated publication is unavailable. Request completion fences reject a changed decision or quote identity.

Freshness reports the published decision identity, original decision date, and CURRENT/UPDATING/UNAVAILABLE status separately from the quote generation. The browser token includes both identities and decision status. Redis validates complete payload hashes and policy versions. IndexedDB schema 4 discards older incompatible records. Workspace server reads use no-store; Pulse summary and briefing are independently validated before SSR hydration and browser fallback. Previous-finalized comparisons select a strictly earlier session; same-session corrections are not fresh session upgrades.

### Prospective capture and its limits

Additive Alembic revision `z3l4m5n6o7p8` creates `decision_generation_captures` and `trading_source_observations`. PostgreSQL triggers append each INSERT/UPDATE/DELETE of daily prices, market summaries, corporate actions, dividend events, and instrument metadata in the same source transaction. Records include the database observation time, source row identity, operation, session/finality, new payload and previous payload. Event source creation/update times are retained as supplied knowledge/revision metadata. Captured strategy inputs retain declared coverage gaps and can be restored independently with `restore_strategy_input`.

Database guards prohibit capture deletion and payload mutation; a decision generation may be invalidated once but not reactivated. Idempotent publication cannot overwrite history. Journal observations also contribute to the bounded decision revision, so reused/backdated source update timestamps cannot hide a newly observed correction.

Event availability uses UTC instants, treating legacy naive timestamps as UTC. The current event projection uses the journal observation time where available. An earlier as-of input uses an earlier revision if it was supplied; if only a later correction to an already-known event is available, it records `REVISION_UNAVAILABLE` and blocks fresh action without importing the correction. Details patterns only use valid post-action candles if a corporate action cuts across their longer window. Sufficient clean candles restore patterns independently of the 90-session decision; an updating prior publication does not receive patterns computed from newly corrected rows.

There is **no historical PIT backfill claim**. Existing source rows are first captured with their actual publication observation time, not their historical trading dates. Pre-capture revisions, complete event-feed coverage, effective-dated exchange/instrument rules, verified adjustment coverage, and mature forward outcomes remain gaps. Raw journal data starts only after the migration is applied. Current input captures support deterministic reproduction, not retrospective predictive validation.

Operational inspection: `python -m app.scripts.check_trading_intelligence --exchange DSE --inspect-only`. Inspection is the default and calls the universe with `allow_rebuild=False`; it does not schedule rebuilds or write snapshots. It reports the selected finalized identity/status and previous finalized comparison. This command was not run against the configured database during implementation.

## Release 1B: ordering and presentation

Backend shortlist policy `entry-shortlist-v1` orders eligibility, READY/CONDITIONAL/NOT_READY, STRONG/CONSTRUCTIVE/WEAK, liquidity tier, median turnover, then stable symbol/ID. Independent holder-exit, risk, and volume ranks retain explicit user choices. No legacy evidence or Pulse score bonus participates in the default entry rank. Searchable noneligible rows remain below eligible setups.

Legacy numeric confidence fields remain compatible API fields, but current cards render UNAVAILABLE, MIXED, BULLISH, or BEARISH evidence semantics without a probability percentage. Client fallbacks do not fabricate evidence. The backend owns the controlling WAIT reason and secondary blockers. English and Bangla presentation identify regime vetoes explicitly. SELL holder guidance is distinct from avoiding a new long entry as a non-holder.

Pulse attention remains attention. Existing focus cards show finalized action/readiness/date and the controlling reason. Watch levels are observations; only a permitted canonical POTENTIAL_BUY plan supplies an actionable entry condition. Conditional plans remain conditional. Canonical trading risk is distinct from reliability and liquidity. Pattern targets are labelled hypotheses, while actionable objectives belong to the canonical plan.

Leadership uses eligible market constituents rather than diversified focus cards. Eligible-stock breadth/participation is labelled explicitly. A cautious/defensive state cannot also conclude selective risk-on. Sector-rotation alert averages are labelled as winner-only (+0.4% subset), in both locales.

## Validation and operational gates

The local 1A checkpoint passed 28 focused checks before 1B began. Regression fixtures independently specify 60 traded / 90 expected sessions = 66.7%, distinguish 10 missing from 20 observed no-trade sessions, preserve unresolved action guards, reject provisional input, reproduce captured original/corrected decisions, and reject invalidated/cold fallback. Synthetic named-symbol fixtures check the shared field intersection across universe, latest decisions and Details; they are not new live observations of those symbols.

The ranking fixture expects ENVOYTEX, SPCL, SQURPHARMA, BRACBANK, APSCLBOND from explicitly assigned eligibility/readiness/quality/tradability and stable ties, regardless of legacy evidence values or input order. SPCL's synthetic 58.50 watch level cannot authorize a regime-blocked plan. Frontend tests cover bilingual evidence labels, generation mismatch rejection, independent Pulse SSR validation, and backend rank consumption.

Remaining operational acceptance: independently review this checkout; execute the additive migration against an approved isolated PostgreSQL database and verify triggers/immutability transactionally; then perform an authorized staged rollout and current-data/browser acceptance. Apply persistence before enabling the new readers/writers. No migration, deployment, configured-database write, external provider call, or promotion was performed here. Full suite outputs and remaining pre-existing failures are recorded in the external implementation report.
