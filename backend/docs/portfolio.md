# Current-Position Portfolio Workspace

## Purpose

`GET /api/v1/portfolio/workspace` answers one question for the authenticated user: **what are my current holdings worth, what is happening with them now, and what deserves attention?** It is a read aggregate over the existing watchlist, current published market data, canonical scored-universe intelligence, stock metadata, and relevant current events.

It is not a portfolio accounting system. There are no transactions, lots, partial sales, realized P/L, cash, dividend-adjusted returns, snapshots, historical portfolio values, benchmarks, notifications, background portfolio jobs, or multiple portfolios.

## Architecture

- Router: authentication, `exchange` validation, response envelope, and `Cache-Control: private, no-store`.
- Repository: set-based user watchlist/stock query, one latest-positive-price fallback query, and set-based relevant event queries.
- Service: joins rows to the already-published scored universe; it never invokes the decision engine. All calculations use `Decimal`, apply completeness rules, choose deterministic guidance codes, and rank attention/watchlist candidates.
- Frontend: localizes semantic guidance codes in English and Bangla. Personalized responses use a user-and-exchange TanStack key and are not persisted to Redis or IndexedDB.

## Current-position calculations

For a row with the required inputs:

```text
invested_amount = quantity × average_buy_price
current_value = quantity × current_price
unrealized_gain_amount = current_value − invested_amount
unrealized_gain_percent = unrealized_gain_amount ÷ invested_amount × 100
portfolio_weight = current_value ÷ known_current_value × 100
estimated_daily_change_amount = quantity × (current_price − previous_close)
estimated_daily_contribution_percent = estimated_daily_change_amount ÷ known_previous_value × 100
```

Money and percentages are rounded with `ROUND_HALF_UP`; quantities and prices retain four decimals. API Decimal fields serialize as strings.

## Completeness and data quality

- Missing quantity excludes a holding from every quantity-based amount.
- Missing average price still permits current value and position weight, but not investment or unrealized P/L.
- Missing/zero price excludes value-dependent calculations.
- A stale positive last-known price can show a visibly stale current value but cannot produce daily movement. This fallback also applies when the published universe contains a current-session zero-price placeholder.
- Suspicious prices do not produce strong guidance or ranking claims.
- Positive zero-volume rows remain visible as `NON_TRADED` and may use the published price; daily movement is still based on the published row's price change.
- Position concentration is emitted only when every holding has reliable current-value coverage.
- When canonical universe intelligence is unavailable, the response remains useful with fallback prices and semantic decision fields set to unavailable/neutral. The request never recomputes decisions.

## Guidance and attention

Each holding receives exactly one `what_next_code`, selected by deterministic priority. The frontend owns educational copy for that code. Attention items group affected holdings and are ordered by current materiality: support break, holder SELL/REDUCE, price quality, elevated risk, incomplete information, concentration, resistance/volume, and current event.

The workspace also returns `watchlist_items`: every current watchlist row with
an explicit `is_holding` flag. This supports one holdings-first table without
creating another portfolio record or treating watchlist-only stocks as positions.

No score, guaranteed recommendation, or historical-change claim is generated.

## Cache and privacy

- Response header: `Cache-Control: private, no-store`.
- No personalized aggregate is stored in Redis or IndexedDB.
- Market publication invalidation includes the `portfolio` TanStack root.
- Holding status, quantity, average-price, and note mutations invalidate the watchlist and portfolio query roots.
- Logs must not include portfolio payloads, quantities, values, or notes.

## Add holding (current position)

The portfolio page adds or completes one consolidated position through the existing watchlist mutation path:

1. `POST /watchlist/items` when the stock is not yet watched.
2. `PATCH /watchlist/items/{stock_id}` with `is_holding=true`, `quantity`, `buy_price`, and optional `note`.

There is still no transaction ledger, purchase lot history, realized P/L, or partial-sale tracking. Stock autocomplete uses lean `GET /stocks/search` (no per-keystroke quote join); after selection, preview loads the latest close via `GET /stocks/{stock_id}/prices?limit=1`. Incomplete holdings continue to use inline quantity / average-price edits in the table.


### Shared account valuation mark

Position value, unrealized P&L, weights, totals and dependent suggestions use the
resolved display quote and its matching previous close/change/date/source/quality,
rather than the finalized analysis close. Quantity and cost basis are unchanged.
A dated last-known positive mark can value holdings while new entry is unverified.
Missing marks retain incomplete-total flags; stale marks retain daily-change suppression.

The public Portfolio workspace uses the bound quote session/state for price
status, valuation completeness and daily contribution, separately from the
immutable `decision_session_date`. Metadata exposes `quote_generation_id` and
`decision_generation_id`. A null-price display quote triggers the same dated
positive fallback search as an absent stock, bounded to the quote session.
A genuinely absent mark remains unavailable and makes totals incomplete.

### Account observations and holder guidance (Order 4)

The active `/watchlist` route redirects to `/portfolio`. The unified workspace renders both holdings and watch-only rows; it does not mount the legacy `WatchlistView`.

`PortfolioHoldingRead.display_quote` is the same resolved observation used for price, daily movement, value and since-cost gain. It carries source/observation time, price and observation dates/status; row `price_status` still controls whether daily movement is usable. `decision_session_date`, `decision_taxonomy_version` and `primary_reason_code` describe the dated canonical result independently of that mark. Holdings preserve the exact `holder_action` (including REDUCE and REVIEW); the older collapsed `action` stays compatible. `public_comparison` and `holder_comparison` use the same verified preceding-session/publication/version gate but compare their own audiences. Missing lineage is UNCOMPARABLE, and changing saved holding membership creates no transition.

The unified `watchlist_items` reuse completed holding projections, including attention flags and weights. Attention drilldowns follow the server stock IDs without a second Review inference. Desktop and mobile use the same mark/action components and completeness flags. Average buy cost retains meaningful precision up to four decimal places.

Portfolio and active saved-item queries remain no-store and user-scoped; quote/decision/status changes and manual refresh revalidate them. Edits retain the last complete server money until server revalidation completes. Mutations refresh only the account that started them, including after auth switches; no client P/L computation or cross-account optimistic snapshot rollback is used. The optional aggregate change summary is omitted because legacy publications can lack comparable lineage.

Account switching also fences API request/retry and token-refresh completion against external token install/clear boundaries. Automatic same-session refresh rotates tokens within its existing boundary. An obsolete request fails with `AUTH_SESSION_CHANGED`; it cannot replay a mutation using the next account's credentials or install/clear the next account's tokens. Authentication bootstrap and current-user completion preserve newer installed sessions. Deterministic deferred-fetch controls cover this dependency; this is not evidence of a live account incident.

### Final account clarity repair

The compatible legacy `shape.action_groups` enum/projection is retained. New `shape.holder_action_groups` counts precise HOLD/REVIEW/REDUCE/SELL instructions and an unavailable (`null`) group. New clients use these groups and the same localized labels as row filters. Generic `HOLDER_REVIEW` attention is carried in the additive `holder_review_attention` field and merged into the existing panel by the new client; the legacy attention array keeps its existing code set. `REVIEW_HOLDER_GUIDANCE` and that holder-specific attention distinguish an actual holder Review instruction from elevated entry risk or incomplete account cost, preserving more specific price/support/risk alerts. Existing enum meanings are unchanged; clients need the additive code labels before rendering these new results.

The lowest daily-contributor tile is labeled as percentage-point contribution to the portfolio's daily return over the comparable previous-value holdings. Missing daily comparisons omit it rather than substituting since-cost return. Mobile renders supplied current value independently of known cost/P&L, with valued/holding coverage. Suggestions carry the resolved account `display_quote` and `price_status`, never an overwritten unusable raw universe quote; legacy unattributable daily change is omitted.

Account query functions retain an expected session at their owning key. Mutation intent binds session and form input before TanStack can pause it; reads/writes recheck the binding at invocation, including both addholding legs and preference saves. Settlements invalidate old-owner keys without refetching foreign inactive data. Normal guest bootstrap does not advance an empty session boundary, and explicit same-account refresh keeps the authenticated user while current-user data loads. A small stored identity marker changes on external session install/clear and stays stable through same-session token rotation. Requests reject a different-tab identity marker before reading its refresh credentials; storage events clear this tab's old audience without deleting the newer tab's stored tokens. Deterministic shared-storage controls cover the sequence; real multi-tab browser/refresh races are not certified by these tests.
### Compact account summary disclosures

The active unified `/portfolio` workspace (also reached by `/watchlist`) keeps marked value, since-cost P/L, daily movement, partial warning and valued/holding coverage visible. Value-coverage disclosure contains denominator/method/setup details. The attention preview shows two items ordered by existing severity, then expands all existing server-selected drilldowns. Email timing/method details are disclosed without repeating status labels. Holding/watchlist removal uses the shared app confirmation with explicit effects, Cancel focus and no mutation before confirmation; settlement and account-session behavior are unchanged.

An in-flight refresh completion also checks that storage still contains the refresh token that initiated it. A newer same-account rotation wins without an older success overwriting it or an older failure clearing credentials/redirecting. Bootstrap, explicit refresh and `auth/me` failure settlement retain the same ownership check. Ordinary same-session rotation remains valid; a superseded request is discarded and can be retried through the normal current-session path.
