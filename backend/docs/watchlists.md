# User Watchlist

## Purpose

Each authenticated user has exactly one implicit watchlist stored in `user_watchlist`. Rows track watched stocks with optional holding metadata and personal notes. This module is not a portfolio ledger, alert system, or multi-list organizer.

## Access control

All `/api/v1/watchlist/*` routes require a valid Bearer access token via `get_current_user`. Anonymous requests receive `401 Unauthorized`.

## Schema

Table: `user_watchlist`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID | FK → `users.id`, CASCADE |
| `stock_id` | UUID | FK → `stocks.id`, CASCADE |
| `stock_symbol` | string | Denormalized for fast UI |
| `is_holding` | boolean | Default `false` |
| `buy_price` | numeric | Optional, non-negative |
| `note` | text | Optional personal note |

Unique: `(user_id, stock_id)`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/watchlist/items` | List watchlist rows (`holding_only`, pagination) |
| GET | `/watchlist/summary` | Total watchlisted + holdings counts |
| POST | `/watchlist/items` | Add stock (idempotent) |
| PATCH | `/watchlist/items/{stock_id}` | Update holding, buy price, note |
| DELETE | `/watchlist/items/{stock_id}` | Remove stock |
| POST | `/watchlist/items/{stock_id}/toggle` | Star UX: add if missing, remove if present |

List ordering: holdings first, then newest `created_at`.

There is no `filter=watchlisted` query param; all list results are already watchlisted. Use `holding_only=true` to restrict to holdings.

## Computed read fields

| Field | Rule |
|-------|------|
| `unrealized_gain_percent` | `(latest_close - buy_price) / buy_price * 100` when both exist |
| `has_note` | Trimmed note is non-empty |
| `watching_days` | Days since `created_at` |
| `watching_label` | e.g. `Watching for 47 days` |
| `current_price` | Latest `daily_prices.close_price` |
| `trader_decision` | Same engine as `market/universe-rows` (shared snapshot + decision path) |
| `technical_snapshot` | Same `TechnicalSnapshotRead` contract as scored universe rows (RSI, trend, change %) |

Gain percentage is computed on the backend only.

## Holding and buy price rules

- `buy_price` may only be stored while `is_holding` is `true`.
- Setting `is_holding` to `false` (via PATCH or the holding toggle) clears `buy_price` to `null` on the server.
- PATCH requests that set `buy_price` without an active holding are ignored for `buy_price`.
- Buy price remains optional; there is no transaction history or portfolio ledger in this module.

## Action / signal consistency

User-facing **Action** badges use the shared trader decision engine (`BUY`, `HOLD`, `WAIT`, `SELL`). See `backend/docs/signals.md` and `backend/docs/stock_decision_support.md`. Legacy `trading_signals` rows are not the primary action source for watchlist UI.

## Frontend

- Star control calls `POST .../toggle` only.
- User-specific GETs use `cache: no-store`.
- Watchlist page filters are client-side: **Holding** toggle (inactive = all, active = holdings only), **Action** dropdown (All / BUY / HOLD / WAIT / SELL / NEW), **Trend** dropdown (All / Bullish / Bearish / Sideways).
- Action, RSI, and trend columns resolve through the shared frontend intelligence map built from `GET /market/universe-rows` plus legacy persisted signals for **NEW** badges (`frontend/lib/market/universe-intelligence.ts`, `frontend/lib/market/trader-decision.ts`). When a row is outside the universe payload, the API `technical_snapshot` + `trader_decision` fields provide the same fallback contract.
- Price column shows market price plus inline holding context (bought price, unrealized P/L, or “Set buy price”). Notes and buy-price edits use compact popovers/inline controls—no full-row expansion panels.

### NEW badge definition

**NEW** means the trader decision **changed during the latest trading session** compared to the last persisted strategy signal on record (e.g. HOLD → BUY, WAIT → SELL). It is a temporary highlight, not a permanent action type. The UI compares `resolveTraderDecision()` with the mapped legacy `trading_signals` row (`persistedSignal`) for the same or prior session date.

## Future extensions

Schema supports later AI watchlist analysis, smart alerts, portfolio modules, and RAG context without introducing multiple watchlists in this phase.
