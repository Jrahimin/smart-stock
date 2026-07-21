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
- A stale positive last-known price can show a visibly stale current value but cannot produce daily movement.
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
