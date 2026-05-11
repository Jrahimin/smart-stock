# Market Terminal Intelligence Upgrade

## Purpose

This upgrade keeps the existing deterministic OHLCV workflow stable while allowing
the frontend terminal to consume persisted trading signals as optional enrichment.
The platform should continue to answer core trader questions even when persisted
signal rows are absent, stale, or disabled by feature flag.

## Signal Enrichment

`GET /api/v1/signals/latest` returns the latest active trading signal per stock.
Frontend consumers use this endpoint only when backend signal enrichment is
enabled. The deterministic signal generated from recent OHLCV remains the default
fallback and is still used when:

* no persisted signal exists for a stock,
* a persisted signal is older than the latest loaded OHLCV trade date,
* the enrichment feature flag is disabled,
* the signal endpoint fails while price data is still available.

Backend signal confidence and component scores are stored as `0..1` decimals and
are normalized to percentages in frontend market-intelligence code, not inside UI
components.

## Feature Flags

Advanced chart overlays, advanced scanner groups, and backend signal enrichment
are controlled from frontend configuration. Defaults are conservative so current
dashboard, stock explorer, scanner, signal center, and stock detail flows remain
usable without additional backend signal coverage.

## Data Quality And Freshness

`PARTIAL` and `SUSPICIOUS` prices are treated as cautionary context rather than
hard failures. The UI should surface this state in risk, freshness, and session
labels while continuing to render available deterministic intelligence.

The workspace still uses daily synced data, not live streaming. Polling should be
driven by the market session model and used conservatively. Manual refresh remains
the primary way to invalidate cached market data after an ingestion sync or data
correction.
