# Market Scanner Conditions

## Purpose

The Market Scanner remains a frontend view over `GET /api/v1/market/universe-rows`. Its business predicates are server-owned and versioned as `scanner-conditions-v1`; the page does not start a second market query or compute trading thresholds in TypeScript.

Each `ScoredUniverseRow.scanner` object contains a version and zero or more matches. A match contains `condition_id`, machine-readable `reason_code`, factual `reason`, `rank_score`, `capacity_score`, and the authoritative per-condition `rank`.

## Eligibility and ordering

Every condition first requires canonical `EligibilityStatus.ELIGIBLE`. LIMITED, REVIEW_ONLY, INELIGIBLE, stale, unresolved corporate-action, and otherwise unsafe rows receive no scanner matches.

Ranks are deterministic within each condition:

1. condition-specific `rank_score` descending;
2. robust turnover `capacity_score` descending;
3. symbol ascending;
4. stock id ascending.

The frontend may remove rows for search/watchlist filters, but preserves the remaining server order.

## Conditions

| Condition id | Exact current meaning |
|---|---|
| `PRICE_VOLUME_BREAKOUT` | Canonical breakout flag, prior close at/below canonical resistance, current close above it, and known relative volume at or above the shared expansion threshold. Missing volume baseline fails. |
| `SUPPORT_REBOUND` | Prior close at/below support, current close above support and within 4%, positive session move, and RSI at or below 45. A close below support fails. This is a reclaim event, not a generic positive close. |
| `MOMENTUM_CONTINUATION` | Canonical uptrend plus positive five-session analytical return. |
| `BREAKDOWN` | Prior close at/above canonical support and current close below it with a negative session move. SELL or high risk alone does not qualify. |
| `HIGH_RISK_WATCH` | Canonical risk label is HIGH or SPECULATIVE. This is separate from breakdown and compression. |
| `LOW_VOLATILITY_COMPRESSION` | Known non-negative analytical volatility below the versioned compression threshold. High risk is not part of this predicate. |

These remain deterministic screening heuristics. They are not validated predictions and must be evaluated in the historical-validation phase before stronger outcome claims.

## Frontend projection

The current scanner cards keep their existing layout and feature-flag grouping:

- `volume_breakouts` → `PRICE_VOLUME_BREAKOUT`
- `support_rebound` / compatibility `oversold_rebound` → `SUPPORT_REBOUND`
- `momentum_continuation` → `MOMENTUM_CONTINUATION`
- `breakdown_risk` → `BREAKDOWN`
- `risk_compression` → `LOW_VOLATILITY_COMPRESSION`

High-risk watch remains a distinct server condition and can be exposed later without redefining another label.
