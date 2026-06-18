# Smart Stock API Collection

## Health

### GET /api/v1/health

**Description**
Liveness probe. Returns OK without checking external dependencies.

**Response**

```json
{
  "success": true,
  "message": "API is healthy",
  "data": { "status": "ok" }
}
```

---

### GET /api/v1/health/ready

**Description**
Readiness probe. Executes `SELECT 1` against PostgreSQL. Use for Docker health checks and uptime monitoring.

**Response**

```json
{
  "success": true,
  "message": "API is ready",
  "data": { "status": "ready" }
}
```

**Notes**

* Returns HTTP 500 if the database is unreachable.

---

## System

### GET /api/v1/system

**Description**
Returns the deployed backend release metadata (version, git commit, build time). Public, no authentication required.

**Response**

```json
{
  "success": true,
  "message": "System version",
  "data": {
    "version": "2026.06.18.3",
    "git_sha": "7e2a9d1",
    "build_time": "2026-06-18T16:30:00Z"
  }
}
```

**Notes**

* Values are baked into the backend image at `docker compose build` via `APP_VERSION`, `GIT_SHA`, and `BUILD_TIME`.
* `git_sha` is always a 7-character short SHA in public responses (never the full commit hash).
* For the frontend build, use `GET https://stockwealthbd.com/build-info.json` (same JSON shape, no API wrapper).
* Deploy scripts set metadata automatically; see `deploy/README.md`.

---

## Stocks

### GET /api/v1/stocks

**Description**
List stock master records for dropdowns, dashboards, watchlists, and other stock lookup flows.
Supports pagination plus filtering by exchange, active status, and partial symbol/name search.

**Path Params**

None

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* exchange: optional enum, one of `DSE`, `CSE`
* is_active: optional boolean
* search: optional string, min 1, max 120, partial match on symbol or name

**Response**

```json
{
  "success": true,
  "message": "Stocks retrieved",
  "data": [
    {
      "symbol": "GP",
      "name": "Grameenphone Ltd.",
      "exchange": "DSE",
      "sector": "Telecommunication",
      "category": "A",
      "isin": "BD0001GP0001",
      "listing_date": "2009-11-16",
      "lot_size": 1,
      "paid_up_capital": "13503000000.0000",
      "market_cap": "385000000000.0000",
      "is_active": true,
      "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
      "created_at": "2026-05-01T00:00:00Z",
      "updated_at": "2026-05-01T00:00:00Z"
    }
  ]
}
```

**Notes**

* Results are ordered by exchange, symbol, and id for stable pagination.
* `search` is intended for lightweight lookup and autocomplete; use exact lookup when exchange and symbol are known.

---

### GET /api/v1/stocks/search

**Description**
Search stock master records by partial symbol or company name.
Useful for autocomplete and user-facing search fields.

**Path Params**

None

**Query Params**

* q: required string, min 1, max 120
* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* exchange: optional enum, one of `DSE`, `CSE`
* is_active: optional boolean

**Response**

```json
{
  "success": true,
  "message": "Stocks matched",
  "data": [
    {
      "symbol": "GP",
      "name": "Grameenphone Ltd.",
      "exchange": "DSE",
      "sector": "Telecommunication",
      "category": "A",
      "isin": "BD0001GP0001",
      "listing_date": "2009-11-16",
      "lot_size": 1,
      "paid_up_capital": "13503000000.0000",
      "market_cap": "385000000000.0000",
      "is_active": true,
      "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
      "created_at": "2026-05-01T00:00:00Z",
      "updated_at": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### GET /api/v1/stocks/lookup/{exchange}/{symbol}

**Description**
Fetch a stock by its natural market identifier: exchange plus symbol.
Use this when integrating market-data ingestion, signals, watchlists, or portfolio flows.

**Path Params**

* exchange: enum, one of `DSE`, `CSE`
* symbol: string, min 1, max 32

**Query Params**

None

**Response**

```json
{
  "success": true,
  "message": "Stock retrieved",
  "data": {
    "symbol": "GP",
    "name": "Grameenphone Ltd.",
    "exchange": "DSE",
    "sector": "Telecommunication",
    "category": "A",
    "isin": "BD0001GP0001",
    "listing_date": "2009-11-16",
    "lot_size": 1,
    "paid_up_capital": "13503000000.0000",
    "market_cap": "385000000000.0000",
    "is_active": true,
    "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:00:00Z"
  }
}
```

**Notes**

* Returns `404 NOT_FOUND` when no stock exists for the exchange and symbol.
* Symbol lookup is case-insensitive in the repository and creation normalizes symbols to uppercase.

---

### PATCH /api/v1/stocks/{stock_id}/details-fetch/toggle

**Description**
Toggle whether a stock is eligible for future stock-details ingestion. This is a
control-plane endpoint only; it does not run ingestion while the details source is
temporarily removed.

**Path Params**

* stock_id: UUID

**Response**

```json
{
  "success": true,
  "message": "Stock details sync enabled",
  "data": {
    "symbol": "EBL",
    "name": "Eastern Bank PLC",
    "exchange": "DSE",
    "is_active": true,
    "should_fetch_details": true,
    "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-03T00:00:00Z"
  }
}
```

---

### GET /api/v1/stocks/{stock_id}

**Description**
Fetch a stock master record by id.

**Path Params**

* stock_id: UUID

**Query Params**

None

**Response**

```json
{
  "success": true,
  "message": "Stock retrieved",
  "data": {
    "symbol": "GP",
    "name": "Grameenphone Ltd.",
    "exchange": "DSE",
    "sector": "Telecommunication",
    "category": "A",
    "isin": "BD0001GP0001",
    "listing_date": "2009-11-16",
    "lot_size": 1,
    "paid_up_capital": "13503000000.0000",
    "market_cap": "385000000000.0000",
    "is_active": true,
    "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:00:00Z"
  }
}
```

**Notes**

* Returns `404 NOT_FOUND` when the id does not exist.

---

### POST /api/v1/stocks

**Description**
Create a stock master record.
The service checks the natural key first and returns the existing stock when the same symbol and exchange already exist.

**Path Params**

None

**Query Params**

None

**Body**

```json
{
  "symbol": "gp",
  "name": "Grameenphone Ltd.",
  "exchange": "DSE",
  "sector": "Telecommunication",
  "category": "A",
  "isin": "bd0001gp0001",
  "listing_date": "2009-11-16",
  "lot_size": 1,
  "paid_up_capital": "13503000000.0000",
  "market_cap": "385000000000.0000",
  "is_active": true
}
```

**Response**

```json
{
  "success": true,
  "message": "Stock created",
  "data": {
    "symbol": "GP",
    "name": "Grameenphone Ltd.",
    "exchange": "DSE",
    "sector": "Telecommunication",
    "category": "A",
    "isin": "BD0001GP0001",
    "listing_date": "2009-11-16",
    "lot_size": 1,
    "paid_up_capital": "13503000000.0000",
    "market_cap": "385000000000.0000",
    "is_active": true,
    "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:00:00Z"
  }
}
```

**Notes**

* `symbol` and `isin` are normalized to uppercase.
* Empty optional text fields are stored as null.
* Duplicate symbol plus exchange returns the existing record with message `Stock already exists`.

---

### PATCH /api/v1/stocks/{stock_id}/active/toggle

**Description**
Toggle a stock between active and inactive without deleting the master record.
Inactive stocks can be hidden from dropdowns while preserving links to historical prices, indicators, and signals.

**Path Params**

* stock_id: UUID

**Query Params**

None

**Body**

None

**Response**

```json
{
  "success": true,
  "message": "Stock deactivated",
  "data": {
    "symbol": "GP",
    "name": "Grameenphone Ltd.",
    "exchange": "DSE",
    "sector": "Telecommunication",
    "category": "A",
    "isin": "BD0001GP0001",
    "listing_date": "2009-11-16",
    "lot_size": 1,
    "paid_up_capital": "13503000000.0000",
    "market_cap": "385000000000.0000",
    "is_active": false,
    "id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:05:00Z"
  }
}
```

**Notes**

* Returns `404 NOT_FOUND` when the id does not exist.
* The repository updates the boolean value atomically by setting it to the opposite of the current value.

---

## Market Data

### GET /api/v1/market/freshness

**Description**
Return snapshot timing and session metadata so the frontend can show last/next update, delay disclaimer, and market status without hardcoding Dhaka session bounds.

**Query Params**

* exchange: optional enum, one of `DSE`, `CSE` (default `DSE`)

**Response**

```json
{
  "success": true,
  "message": "Market freshness retrieved",
  "data": {
    "exchange": "DSE",
    "trade_date": "2026-06-11",
    "last_synced_at": "2026-06-11T14:45:00+06:00",
    "next_sync_at": "2026-06-11T15:00:00+06:00",
    "snapshot_interval_minutes": 15,
    "market_sync_interval_seconds": 900,
    "dashboard_cache_ttl_seconds": 600,
    "expected_delay_minutes": 15,
    "market_open_time": "10:00",
    "market_close_time": "15:00",
    "market_status": "OPEN",
    "freshness_label": "Snapshot prices; updates about every 15 minutes"
  }
}
```

**Notes**

* `last_synced_at` is `max(daily_prices.updated_at)` for the latest trade date with rows.
* `next_sync_at` is present only when `market_status` is `PRE_OPEN` or `OPEN`; otherwise `null`.
* `expected_delay_minutes` matches `snapshot_interval_minutes` by default (max staleness between scheduled snapshots).
* `market_sync_interval_seconds` is `snapshot_interval_minutes * 60`.
* `dashboard_cache_ttl_seconds` is `max(60, min(600, market_sync_interval_seconds))` — shared TTL for dashboard Redis cache and frontend TanStack Query `staleTime`.
* `market_status`: `PRE_OPEN` | `OPEN` | `POST_CLOSE` | `HOLIDAY`.
* No `is_live` field — prices are always snapshot-based.

---

## Market Dashboard

Trader `/dashboard` section endpoints. Optional Redis cache — see [market_dashboard.md](market_dashboard.md).

### GET /api/v1/dashboard/overview

**Description**
Return DSEX index snapshot, recent market summaries, listed stock count, and session trade date for the dashboard pulse header.

**Query Params**

* exchange: optional enum, one of `DSE`, `CSE` (default `DSE`)

**Response**

```json
{
  "success": true,
  "message": "Dashboard overview retrieved",
  "data": {
    "exchange": "DSE",
    "session_trade_date": "2026-06-17",
    "listed_stock_count": 398,
    "dsex_index": { "...": "DsexIndexSnapshotRead — same shape as GET /market/index/dsex" },
    "summaries": [{ "...": "DailyMarketSummaryRead[] — recent rows for turnover/volume context" }]
  }
}
```

**Notes**

* Cached in Redis when `REDIS_URL` is set; TTL matches `dashboard_cache_ttl_seconds`.
* Invalidated on successful `sync_market_snapshot`.

---

### GET /api/v1/dashboard/movers

**Description**
Return session-eligible gainers, losers, turnover leaders, and volume leaders from latest daily prices.

**Query Params**

* exchange: optional enum, one of `DSE`, `CSE` (default `DSE`)

**Response**

```json
{
  "success": true,
  "message": "Dashboard movers retrieved",
  "data": {
    "session_trade_date": "2026-06-17",
    "gainers": [],
    "losers": [],
    "turnover_leaders": [],
    "volume_leaders": []
  }
}
```

**Notes**

* Eligibility mirrors `market_mover_rules.is_eligible_session_mover`.
* Default limit per list: 5 (`DASHBOARD_MARKET_MOVERS_LIMIT`).

---

### GET /api/v1/dashboard/sectors

**Description**
Return session sector leaders and top gainer for the dashboard pulse leaders widget.

**Query Params**

* exchange: optional enum (default `DSE`)

**Response**

```json
{
  "success": true,
  "message": "Dashboard sectors retrieved",
  "data": {
    "session_trade_date": "2026-06-17",
    "sectors": [{ "name": "Bank", "change_percent": "1.25", "stock_count": 12 }],
    "top_gainer": { "symbol": "BRACBANK", "name": "BRAC Bank", "change_percent": "4.50" }
  }
}
```

---

### GET /api/v1/dashboard/market-alerts

**Description**
Return timeline-style market alerts (data quality, top decision highlight, scan summary).

---

### GET /api/v1/dashboard/stocks-in-focus

**Description**
Return ranked actionable signals from bounded price windows and the trader decision engine.

**Notes**

* Universe limit: 500 stocks × 90-day window.
* Feed limit: 8 (`DASHBOARD_SIGNAL_FEED_LIMIT`).

---

### GET /api/v1/dashboard/heatmap

**Description**
Return institutional heatmap tiles (latest daily prices, sorted by size/liquidity).

---

### GET /api/v1/dashboard/market-sentiment

**Description**
Return market mood, deterministic insight blocks, signal count, and turnover context.

---

### GET /api/v1/market/universe-rows

**Description**
Return the shared `ScoredUniverseRow` list for Explorer, Scanner, Signals, and Watchlist. Serves from Redis `universe:scored:{exchange}` on cache hit. This is the preferred list endpoint — do not use `GET /market/price-windows` on trader UI paths.

**Query Params**

* exchange: optional enum (default `DSE`)

**Response**

```json
{
  "success": true,
  "message": "Universe rows retrieved",
  "data": {
    "meta": {
      "exchange": "DSE",
      "listed_stock_count": 392,
      "session_trade_date": "2026-06-17"
    },
    "rows": []
  }
}
```

---

### GET /api/v1/market/pulse

**Description**
Return the curated Market Pulse briefing: hero attention summary, focus stocks, conditional insight, change timeline, and market alerts. Pulse Score, focus labels, triggers, and ranking are computed server-side from `market_universe_service` scored rows (presentation layer).

**Related tiered endpoints**

* `GET /api/v1/market/pulse/summary` — hero, focus stocks, alerts (cached in `pulse:summary:{exchange}`)
* `GET /api/v1/market/pulse/briefing` — narrative briefing blocks only

**Query Params**

* exchange: optional enum, one of `DSE`, `CSE` (default `DSE`)
* display_name: optional string, max 160 chars — used for greeting personalization
* previous_snapshot: optional URL-encoded JSON string — prior client snapshot for change detection

**Response**

```json
{
  "success": true,
  "message": "Market pulse retrieved",
  "data": {
    "hero": {
      "greeting": "Good morning, Junayed",
      "attention_headline": "5 stocks deserve attention today.",
      "attention_subline": "2 entered focus recently.",
      "last_updated_label": "10:35 AM",
      "relative_updated_label": "Updated 8 minutes ago",
      "session_label": "OPEN",
      "focus_count": 5,
      "recent_focus_count": 2
    },
    "since_last_visit": {
      "visible": true,
      "new_changes_count": 3,
      "new_focus_count": 2,
      "new_alerts_count": 1,
      "summary_label": "3 new changes · 2 new focus stocks · 1 new market alert"
    },
    "focus_stocks": [],
    "monitor_candidates": [],
    "today_insight": null,
    "changes": [],
    "alerts": [],
    "empty_state": "none",
    "empty_message": null,
    "data_quality_note": null
  }
}
```

**Notes**

* Focus labels: `New BUY Setup`, `Momentum Building`, `Volume Breakout`, `Watch Closely`, `Signal Upgrade`.
* See `backend/docs/market_pulse.md` for Pulse Score methodology and module architecture.

---

### GET /api/v1/market/latest-prices

**Description**
Return the latest available daily OHLCV row for each active stock, optionally filtered by exchange. This endpoint is intended for frontend dashboard, scanner, signal center, and stock explorer workflows so the UI does not need to fan out into one price request per stock.

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* exchange: optional enum, one of `DSE`, `CSE`

**Response**

```json
{
  "success": true,
  "message": "Latest market prices retrieved",
  "data": [
    {
      "stock": {
        "symbol": "RENATA",
        "name": "Renata PLC",
        "exchange": "DSE",
        "sector": "Pharmaceuticals",
        "category": "A",
        "isin": null,
        "listing_date": "1979-01-01",
        "lot_size": null,
        "paid_up_capital": "1146.9600",
        "market_cap": "14583.7620",
        "is_active": true,
        "should_fetch_details": false,
        "id": "d469bea4-3089-47ef-9d1e-9a32c4409e96",
        "created_at": "2026-05-03T11:50:53.916Z",
        "updated_at": "2026-05-04T19:46:27.143Z"
      },
      "price": {
        "stock_id": "d469bea4-3089-47ef-9d1e-9a32c4409e96",
        "trade_date": "2026-05-10",
        "open_price": "22.8000",
        "high_price": "24.3000",
        "low_price": "22.8000",
        "close_price": "24.2000",
        "adjusted_close_price": null,
        "previous_close_price": "22.8000",
        "price_change": "1.4000",
        "price_change_percent": "6.1404",
        "day_range": "1.5000",
        "day_range_percent": "6.5789",
        "vwap": "23.5400",
        "volume": 368700,
        "trade_count": 0,
        "turnover": "8679180.0000",
        "source": "AMARSTOCK_API",
        "data_quality_flag": "OK",
        "id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
        "created_at": "2026-05-10T15:00:00Z",
        "updated_at": "2026-05-10T15:00:00Z"
      }
    }
  ]
}
```

**Notes**

* Only active stocks with at least one `daily_prices` row are returned.
* Results are ordered by exchange, symbol, and id for stable pagination.
* Use `GET /api/v1/stocks/{stock_id}/prices` for full historical chart windows.

---

### GET /api/v1/market/price-windows

**Description**
Return each active stock with a recent daily OHLCV window, optionally filtered by exchange. This supports market-wide scanners, signals, and dashboard analytics that need RSI, moving averages, volume averages, and trend context without issuing one historical price request per stock.

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* exchange: optional enum, one of `DSE`, `CSE`
* price_window_limit: number, default 90, min 1, max 260

**Response**

```json
{
  "success": true,
  "message": "Market price windows retrieved",
  "data": [
    {
      "stock": {
        "symbol": "RENATA",
        "name": "Renata PLC",
        "exchange": "DSE",
        "sector": "Pharmaceuticals",
        "category": "A",
        "isin": null,
        "listing_date": "1979-01-01",
        "lot_size": null,
        "paid_up_capital": "1146.9600",
        "market_cap": "14583.7620",
        "is_active": true,
        "should_fetch_details": false,
        "id": "d469bea4-3089-47ef-9d1e-9a32c4409e96",
        "created_at": "2026-05-03T11:50:53.916Z",
        "updated_at": "2026-05-04T19:46:27.143Z"
      },
      "prices": [
        {
          "stock_id": "d469bea4-3089-47ef-9d1e-9a32c4409e96",
          "trade_date": "2026-05-10",
          "open_price": "22.8000",
          "high_price": "24.3000",
          "low_price": "22.8000",
          "close_price": "24.2000",
          "adjusted_close_price": null,
          "previous_close_price": "22.8000",
          "price_change": "1.4000",
          "price_change_percent": "6.1404",
          "day_range": "1.5000",
          "day_range_percent": "6.5789",
          "vwap": "23.5400",
          "volume": 368700,
          "trade_count": 0,
          "turnover": "8679180.0000",
          "source": "AMARSTOCK_API",
          "data_quality_flag": "OK",
          "id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
          "created_at": "2026-05-10T15:00:00Z",
          "updated_at": "2026-05-10T15:00:00Z"
        }
      ],
      "trader_decision": {
        "recommendation": "BUY",
        "confidence": 71,
        "reason": "Uptrend with favorable opportunity and acceptable reward potential.",
        "opportunity_score": 68,
        "risk_label": "LOW"
      }
    }
  ]
}
```

**Notes**

* Only active stocks with available `daily_prices` rows are returned.
* Prices inside each stock window are newest first.
* `trader_decision` is computed live from the shared decision engine using the same lookback as stock workspace recommendations.
* The frontend can sort ascending before chart or indicator derivation.

---

### GET /api/v1/stocks/{stock_id}/prices

**Description**
List daily OHLCV rows for a stock. Supports pagination plus optional filters for trade-date range, source, and data quality.

**Path Params**

* stock_id: UUID

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* start_date: optional date, `YYYY-MM-DD`
* end_date: optional date, `YYYY-MM-DD`
* data_quality_flag: optional enum, one of `OK`, `PARTIAL`, `SUSPICIOUS`
* source: optional string, min 1, max 80

**Response**

```json
{
  "success": true,
  "message": "Daily prices retrieved",
  "data": [
    {
      "stock_id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
      "trade_date": "2026-04-30",
      "open_price": "285.0000",
      "high_price": "292.0000",
      "low_price": "283.5000",
      "close_price": "290.0000",
      "adjusted_close_price": null,
      "previous_close_price": "284.0000",
      "price_change": "6.0000",
      "price_change_percent": "2.1127",
      "day_range": "8.5000",
      "day_range_percent": "2.9982",
      "vwap": "289.5000",
      "volume": 125000,
      "trade_count": 745,
      "turnover": "36187500.0000",
      "source": "DSE",
      "data_quality_flag": "OK",
      "id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
      "created_at": "2026-05-01T00:00:00Z",
      "updated_at": "2026-05-01T00:00:00Z"
    }
  ]
}
```

**Notes**

* Returns `404 NOT_FOUND` when the stock id does not exist.
* Results are ordered by newest trade date first, then id for stable pagination.

---

### POST /api/v1/stocks/{stock_id}/prices

**Description**
Create one daily OHLCV row for a stock. The service computes price change, percentage change, day range, turnover fallback, and VWAP before persistence.

**Path Params**

* stock_id: UUID

**Query Params**

None

**Body**

```json
{
  "stock_id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
  "trade_date": "2026-04-30",
  "open_price": "285.0000",
  "high_price": "292.0000",
  "low_price": "283.5000",
  "close_price": "290.0000",
  "adjusted_close_price": null,
  "previous_close_price": "284.0000",
  "volume": 125000,
  "trade_count": 745,
  "turnover": "36187500.0000",
  "source": "DSE",
  "data_quality_flag": "OK"
}
```

**Response**

```json
{
  "success": true,
  "message": "Daily price created",
  "data": {
    "stock_id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "trade_date": "2026-04-30",
    "open_price": "285.0000",
    "high_price": "292.0000",
    "low_price": "283.5000",
    "close_price": "290.0000",
    "adjusted_close_price": null,
    "previous_close_price": "284.0000",
    "price_change": "6.0000",
    "price_change_percent": "2.1127",
    "day_range": "8.5000",
    "day_range_percent": "2.9982",
    "vwap": "289.5000",
    "volume": 125000,
    "trade_count": 745,
    "turnover": "36187500.0000",
    "source": "DSE",
    "data_quality_flag": "OK",
    "id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:00:00Z"
  }
}
```

**Notes**

* Duplicate `stock_id + trade_date` returns the existing row with message `Daily price already exists`.
* Missing previous close is allowed, but the stored row is marked `PARTIAL` when no earlier close can be found.

---

### POST /api/v1/market-data/ingestion/daily-prices

**Description**
Run daily price ingestion for a trade date using the **DSE day-end archive** source (`DseMarketDataSource`). Suitable for historical backfill when `trade_date` is a past session day. For live intraday snapshots use the `sync_market_data` CLI or scheduler instead. Does not run news or LatestPrice enrichment.

**Path Params**

None

**Query Params**

* trade_date: required date, `YYYY-MM-DD`
* exchange: optional enum, one of `DSE`, `CSE`, default `DSE`

**Body**

None

**CLI equivalent**

* `python -m app.jobs.backfill_daily_prices --date YYYY-MM-DD` (insert-only by default)
* `python -m app.jobs.backfill_daily_prices --from YYYY-MM-DD --to YYYY-MM-DD`

**Response**

```json
{
  "success": true,
  "message": "Daily prices ingested",
  "data": {
    "exchange": "DSE",
    "trade_date": "2026-04-30",
    "source": "AMARSTOCK",
    "fetched_count": 392,
    "created_count": 388,
    "skipped_existing_count": 0,
    "skipped_unknown_symbol_count": 2,
    "suspicious_count": 0,
    "post_news_upserted": 120,
    "post_news_skipped": 3,
    "post_latest_price_trade_fields_patched": 350,
    "post_latest_price_trade_rows_missing": 10,
    "post_news_error": null,
    "post_latest_price_patch_error": null
  }
}
```

**Notes**

* Requires authenticated user context.
* `suspicious_count` reflects validation-source close mismatches when validation runs.
* `post_*` fields summarize additive AmarStock News and LatestPrice trade-stat steps; error fields are set when the subsection fails after primary ingestion already committed.
* Advanced retry, logging policy, and anomaly detection are intentionally not included yet.

---

### GET /api/v1/market/summaries

**Description**
List daily exchange or index-level market summaries for dashboard overview screens.

**Path Params**

None

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* exchange: optional enum, one of `DSE`, `CSE`

**Response**

```json
{
  "success": true,
  "message": "Daily market summaries retrieved",
  "data": [
    {
      "exchange": "DSE",
      "trade_date": "2026-04-30",
      "index_name": "DSEX",
      "index_close": "5430.2500",
      "index_change": "22.1500",
      "index_change_percent": "0.4096",
      "total_volume": 125000000,
      "total_turnover": "4850000000.0000",
      "total_trades": 158000,
      "advancing_issues": 172,
      "declining_issues": 121,
      "unchanged_issues": 79,
      "market_cap": "7100000000000.0000",
      "source": "DSE",
      "data_quality_flag": "OK",
      "id": "89d580f2-b703-4f7c-a2af-7d3d48c76b0f",
      "created_at": "2026-05-01T00:00:00Z",
      "updated_at": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### POST /api/v1/market/summaries

**Description**
Create one daily market summary row. Duplicate exchange, trade date, and index name returns the existing summary.

**Path Params**

None

**Query Params**

None

**Body**

```json
{
  "exchange": "DSE",
  "trade_date": "2026-04-30",
  "index_name": "DSEX",
  "index_close": "5430.2500",
  "index_change": "22.1500",
  "index_change_percent": "0.4096",
  "total_volume": 125000000,
  "total_turnover": "4850000000.0000",
  "total_trades": 158000,
  "advancing_issues": 172,
  "declining_issues": 121,
  "unchanged_issues": 79,
  "market_cap": "7100000000000.0000",
  "source": "DSE",
  "data_quality_flag": "OK"
}
```

**Response**

```json
{
  "success": true,
  "message": "Daily market summary created",
  "data": {
    "exchange": "DSE",
    "trade_date": "2026-04-30",
    "index_name": "DSEX",
    "index_close": "5430.2500",
    "index_change": "22.1500",
    "index_change_percent": "0.4096",
    "total_volume": 125000000,
    "total_turnover": "4850000000.0000",
    "total_trades": 158000,
    "advancing_issues": 172,
    "declining_issues": 121,
    "unchanged_issues": 79,
    "market_cap": "7100000000000.0000",
    "source": "DSE",
    "data_quality_flag": "OK",
    "id": "89d580f2-b703-4f7c-a2af-7d3d48c76b0f",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:00:00Z"
  }
}
```

---

### POST /api/v1/stock-details/sync

**Description**
Run API-only AmarStock stock details ingestion for eligible active stocks. The workflow uses snapshot, historical price, and company financial APIs, tracks each selected stock in `stock_details_sync_jobs`, and when enabled performs one bulk LatestPrice fetch per batch. Request body **`scope`** defaults to `full` (persist prices, fundamentals, snapshots, events, and stock profile from snapshot). Use `stocks` to only fill empty columns on `stocks` from the snapshot mapper plus LatestPrice profile merge, skipping `daily_prices` and other tables; **`stocks` ignores the per-stock cadence cutoff** for who is selected (see `backend/docs/stock_details.md`).

**Body**

```json
{
  "exchange": "DSE",
  "symbols": ["EBL"],
  "limit": 20,
  "offset": 0,
  "historical_window_days": 180,
  "force": false,
  "trigger_type": "MANUAL",
  "scope": "full"
}
```

**Response**

```json
{
  "success": true,
  "message": "Stock details synced",
  "data": {
    "exchange": "DSE",
    "scope": "full",
    "source": "AMARSTOCK_API",
    "requested_count": 1,
    "selected_count": 1,
    "synced_count": 1,
    "partial_count": 0,
    "failed_count": 0,
    "skipped_count": 0,
    "stock_profile_count": 1,
    "daily_price_count": 90,
    "metric_count": 25,
    "valuation_count": 1,
    "shareholding_count": 1,
    "event_count": 2,
    "latest_price_profile_fill_count": 1,
    "latest_price_shareholding_count": 1,
    "latest_price_valuation_count": 1
  }
}
```

---

### GET /api/v1/stock-details/{exchange}/{symbol}/workspace

**Description**
Consolidated stock workspace payload: `StockRead`, OHLCV window (260 bars), and full decision-support in one response. Cached in Redis with versioned key `stock-workspace:core:{exchange}:{symbol}:{latest_trade_date}`. TTL follows `market_dashboard_cache_ttl_seconds` as a same-day safety net. **Not** invalidated on exchange-wide sync — eventually consistent by design.

**Lazy section endpoints**

* `GET .../workspace/patterns` — patterns + breakout (`stock-workspace:patterns:...`)
* `GET .../workspace/events` — ownership, valuation, timeline (`stock-workspace:events:...`)

**Path Params**

* exchange: `DSE` or `CSE`
* symbol: stock ticker, for example `ACMEPL`

**Response**

```json
{
  "success": true,
  "message": "Stock workspace retrieved",
  "data": {
    "stock": {},
    "prices": [],
    "latest_trade_date": "2026-06-17",
    "decision_support": {}
  }
}
```

---

### GET /api/v1/stock-details/{exchange}/{symbol}/decision-support

**Description**
Return deterministic trader decision-support for one stock symbol. The response combines stored OHLCV, stock profile data, and optional ownership, valuation, and event snapshots into a single explainable contract suitable for the stock workspace UI.

No AI/LLM is used. All scores, recommendations, warnings, pattern detections, and trade-plan levels are formula-based.

**Path Params**

* exchange: `DSE` or `CSE`
* symbol: stock ticker, for example `ACMEPL`

**Response**

```json
{
  "success": true,
  "message": "Stock decision support retrieved",
  "data": {
    "stock_id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
    "symbol": "ACMEPL",
    "exchange": "DSE",
    "decision": {
      "recommendation": "WAIT",
      "confidence": 68,
      "reasoning": [
        "Trend context: uptrend.",
        "Opportunity score: 58/100.",
        "Risk level: LOW (25/100)."
      ]
    },
    "opportunity": {
      "score": 58,
      "components": [
        {
          "key": "trend",
          "label": "Trend",
          "score": 82,
          "weight": 0.28,
          "explanation": "Price is in an uptrend above moving averages."
        }
      ]
    },
    "risk": {
      "score": 25,
      "label": "LOW",
      "components": []
    },
    "price_position": {
      "current_price": 26.1,
      "distance_to_support_percent": 15.5,
      "distance_to_resistance_percent": 1.5,
      "above_sma20_percent": 8.8,
      "above_ema20_percent": 8.2
    },
    "trade_plan": {
      "entry_zone_low": 25.84,
      "entry_zone_high": 26.23,
      "stop_loss": 22.41,
      "target_low": 25.71,
      "target_high": 26.5,
      "risk_reward_ratio": 1.15,
      "explanation": "Entry near current/support context with stop below support and target at resistance."
    },
    "liquidity": {
      "label": "STRONG",
      "average_volume": 4600000,
      "latest_volume_ratio": 1.8,
      "volume_consistency_score": 85,
      "average_turnover": 120000000,
      "explanation": "Volume and turnover support active participation."
    },
    "warnings": [
      {
        "code": "near_resistance",
        "title": "Near resistance",
        "message": "Price is close to recent resistance; upside may need a breakout.",
        "severity": "WARNING"
      }
    ],
    "data_freshness": {
      "latest_trade_date": "2026-06-02",
      "ohlcv_row_count": 112,
      "is_stale": false,
      "is_sparse": false,
      "missing_fields": [],
      "data_quality": "OK",
      "source_summary": "Computed from stored daily_prices and stock master profile."
    },
    "support": 22.6,
    "resistance": 26.5,
    "trend": "UPTREND",
    "patterns": [],
    "primary_pattern": null,
    "breakout": {
      "probability": 43,
      "factors": [],
      "breakout_level": 26.5,
      "confirmation_level": 26.77,
      "projected_target": 27.83,
      "explanation": "Breakout probability combines volume, trend, resistance proximity, and active pattern context."
    },
    "ownership": null,
    "valuation": null,
    "events": []
  }
}
```

**Notes**

* Returns `404` when the stock is not found or when no OHLCV rows exist for deterministic evaluation.
* Frontend consumers should treat this endpoint as optional enrichment. If it fails, the existing chart, technical summary, fundamentals, and insight sidebar should continue to render from stock lookup and daily prices.
* Formula weights and thresholds are documented in `backend/docs/stock_decision_support.md`.

---

### GET /api/v1/stock-details/sync-jobs/{job_id}

**Description**
Return one stock details sync job with status, attempts, error, source URL, and parser/API diagnostics stored in metadata.

---

## Signals

### GET /api/v1/signals/decisions/latest

**Description**
Return the latest shared trader decision per active stock. This is the preferred list endpoint for signal center, scanner, and dashboard action feeds. It uses the same engine as `trader_decision` on price windows and the stock workspace decision rail.

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0
* exchange: optional enum, one of `DSE`, `CSE`
* price_window_limit: number, default 90, min 1, max 260

**Response**

```json
{
  "success": true,
  "message": "Latest trader decisions retrieved",
  "data": [
    {
      "stock": {
        "symbol": "RENATA",
        "name": "Renata PLC",
        "exchange": "DSE",
        "id": "d469bea4-3089-47ef-9d1e-9a32c4409e96"
      },
      "decision": {
        "recommendation": "BUY",
        "confidence": 71,
        "reason": "Uptrend with favorable opportunity and acceptable reward potential.",
        "opportunity_score": 68,
        "risk_label": "LOW"
      },
      "latest_trade_date": "2026-05-10"
    }
  ]
}
```

**Notes**

* Recommendations use `BUY`, `HOLD`, `WAIT`, or `SELL`.
* Confidence is returned on a `0..100` integer scale.
* See `backend/docs/signals.md` and `backend/docs/stock_decision_support.md`.

---

### GET /api/v1/signals/latest

**Description**
Return the latest active **legacy persisted** trading signal per stock from the `trading_signals` table. Terminal UI no longer uses this endpoint for action badges; prefer `GET /signals/decisions/latest` or `trader_decision` on price windows.

**Query Params**

* limit: number, default 50, min 1, max 500
* offset: number, default 0, min 0

**Response**

```json
{
  "success": true,
  "message": "Latest active signals retrieved",
  "data": [
    {
      "stock_id": "8f8e3b52-2a27-4df8-8e76-c9eb6f61c123",
      "trade_date": "2026-05-10",
      "signal_type": "BUY",
      "confidence": "0.7200",
      "momentum_score": "0.6800",
      "trend_score": "0.7000",
      "volume_score": "0.8200",
      "risk_score": "0.2500",
      "reason": "Volume confirms positive trend continuation.",
      "strategy_name": "deterministic-v1",
      "components": {},
      "metadata": {},
      "is_active": true,
      "id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
      "created_at": "2026-05-10T15:00:00Z",
      "updated_at": "2026-05-10T15:00:00Z"
    }
  ]
}
```

**Notes**

* Only active signal rows are considered.
* At most one signal is returned per stock.
* Ordering is stable by newest trade date, stock id, strategy name, and signal id.
* Frontend consumers must treat persisted rows as legacy strategy history, not as the primary action source.

---

## Watchlist

All watchlist routes require authentication (`get_current_user`). One implicit watchlist per user; table `user_watchlist`.

### GET /api/v1/watchlist/items

**Description**
List the authenticated user's watchlist rows with optional market enrichment.

**Query Params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `holding_only` | boolean | `false` | When `true`, only rows with `is_holding = true` |
| `limit` | int | `50` | Page size (1–500) |
| `offset` | int | `0` | Page offset |

**Response**

```json
{
  "success": true,
  "message": "Watchlist items retrieved",
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "f1e2d3c4-b5a6-9780-1234-567890abcdef",
      "stock_id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
      "stock_symbol": "GP",
      "is_holding": true,
      "buy_price": "250.0000",
      "note": "Waiting for breakout.",
      "created_at": "2026-01-18T10:00:00Z",
      "updated_at": "2026-06-04T10:00:00Z",
      "unrealized_gain_percent": "4.80",
      "has_note": true,
      "watching_days": 47,
      "watching_label": "Watching for 47 days",
      "current_price": "262.0000",
      "trader_decision": {
        "recommendation": "BUY",
        "confidence": 72,
        "reason": "Momentum and trend align with acceptable risk.",
        "opportunity_score": 68,
        "risk_label": "MEDIUM"
      }
    }
  ]
}
```

**Notes**

* Ordering: `is_holding DESC`, then `created_at DESC`.
* `unrealized_gain_percent` is computed server-side from latest close and `buy_price`.

### GET /api/v1/watchlist/summary

**Description**
Return total watchlisted count and total holdings count.

**Response**

```json
{
  "success": true,
  "message": "Watchlist summary retrieved",
  "data": {
    "total_watchlisted": 12,
    "total_holdings": 3
  }
}
```

### POST /api/v1/watchlist/items

**Description**
Add a stock to the watchlist. Returns the existing row if already present.

**Body**

```json
{
  "stock_id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91"
}
```

### PATCH /api/v1/watchlist/items/{stock_id}

**Description**
Update holding flag, buy price, and/or personal note.

**Body**

```json
{
  "is_holding": true,
  "buy_price": 250,
  "note": "Accumulate below 245."
}
```

### DELETE /api/v1/watchlist/items/{stock_id}

**Description**
Remove a stock from the watchlist.

### POST /api/v1/watchlist/items/{stock_id}/toggle

**Description**
Primary star-toggle endpoint. Removes the row if it exists; otherwise adds it. No client-side state check required.

**Response**

```json
{
  "success": true,
  "message": "Stock added to watchlist",
  "data": {
    "added": true,
    "is_watchlisted": true,
    "item": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "stock_id": "30e7d280-0b42-44c2-8f42-a8c9b0ff5c91",
      "stock_symbol": "GP",
      "is_holding": false,
      "has_note": false,
      "watching_label": "Added today"
    }
  }
}
```

When removed, `item` is `null` and `added` is `false`.

---

## Authentication

Authentication routes live under `/api/v1/auth`. Middleware parses Bearer JWTs into `request.state.user`; only routes that depend on `get_current_user` require authentication (including all `/api/v1/watchlist/*` routes).

### POST /api/v1/auth/register

**Description**
Create an unverified password account and send an email verification link.

**Body**

```json
{
  "email": "trader@example.com",
  "password": "strong-password",
  "display_name": "Trader",
  "mobile_number": "+15551234567",
  "gender": "prefer_not_to_say",
  "address": "123 Market Street",
  "profile_pic_url": "https://example.com/avatar.png"
}
```

Optional profile fields: `mobile_number`, `gender` (`male` | `female` | `other` | `prefer_not_to_say`), `address`, `profile_pic_url`.

**Response**

```json
{
  "success": true,
  "message": "Registration created",
  "data": {
    "detail": "Registration created. Please verify your email before logging in."
  }
}
```

### POST /api/v1/auth/verify-email

**Description**
Consume an email verification token and set `email_verified_at`.

**Body**

```json
{ "token": "verification-token" }
```

### POST /api/v1/auth/resend-verification

**Description**
Request another verification email. The response is generic to avoid account enumeration.

**Body**

```json
{ "email": "trader@example.com" }
```

### POST /api/v1/auth/login

**Description**
Authenticate a verified password account.

**Body**

```json
{
  "email": "trader@example.com",
  "password": "strong-password"
}
```

**Response**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "access_token": "jwt",
    "refresh_token": "opaque-refresh-token",
    "token_type": "bearer",
    "expires_in": 900
  }
}
```

### POST /api/v1/auth/refresh

**Description**
Rotate a refresh token and issue a new access token.

**Body**

```json
{ "refresh_token": "opaque-refresh-token" }
```

### POST /api/v1/auth/logout

**Description**
Revoke the supplied refresh token. No access token is required.

**Body**

```json
{ "refresh_token": "opaque-refresh-token" }
```

### GET /api/v1/auth/me

**Description**
Return the current authenticated user. Requires `Authorization: Bearer <access_token>`.

**Response**

```json
{
  "success": true,
  "message": "Current user retrieved",
  "data": {
    "id": "4a2e2f2a-89b2-48d3-a7cf-87df113c41b6",
    "email": "trader@example.com",
    "display_name": "Trader",
    "mobile_number": "+15551234567",
    "gender": "prefer_not_to_say",
    "address": "123 Market Street",
    "profile_pic_url": "https://example.com/avatar.png",
    "is_active": true,
    "has_password": true,
    "email_verified_at": "2026-06-04T12:00:00Z",
    "created_at": "2026-06-04T12:00:00Z",
    "updated_at": "2026-06-04T12:00:00Z"
  }
}
```

### PATCH /api/v1/auth/me

**Description**
Update optional profile fields for the authenticated user. Requires `Authorization: Bearer <access_token>`.

**Body**

```json
{
  "display_name": "Trader Pro",
  "mobile_number": "+15551234567",
  "gender": "other",
  "address": "456 Exchange Avenue",
  "profile_pic_url": "https://example.com/new-avatar.png"
}
```

All fields are optional. Send only the fields you want to change.

### PATCH /api/v1/auth/change-password

**Description**
Change the authenticated user's password and revoke existing refresh tokens. Requires an existing password (`has_password: true` on `/auth/me`).

**Body**

```json
{
  "current_password": "old-password",
  "new_password": "new-strong-password"
}
```

### PATCH /api/v1/auth/set-password

**Description**
Set a password for OAuth-only accounts that do not yet have one (`has_password: false` on `/auth/me`). Revokes existing refresh tokens. After success, the user can sign in with email/password or their linked social provider.

**Body**

```json
{
  "new_password": "new-strong-password"
}
```

### POST /api/v1/auth/google

**Description**
Verify a Google ID token with `google-auth`, create or link the user, mark email verified, and return the standard token pair.

**Body**

```json
{ "id_token": "google-id-token" }
```

### POST /api/v1/auth/facebook

**Description**
Optional provider endpoint. When Facebook app settings are configured, validates a Meta access token and returns the standard token pair.

**Body**

```json
{ "access_token": "facebook-access-token" }
```

---

## Admin Panel

All admin routes require `ADMIN` or `SUPER_ADMIN`. High-impact routes require `SUPER_ADMIN`.

### GET /api/v1/admin/dashboard

Operational overview: user counts, scheduler flags, data health, email campaign health, recent `system_job_executions`.

### GET /api/v1/admin/users

List/search users. Query params: `search`, `is_active`, `role`, `include_deleted`, `limit`, `offset`.

### GET /api/v1/admin/users/{user_id}

Get one user.

### GET /api/v1/admin/users/{user_id}/sessions

List `user_sessions` login/session history for a user.

### PATCH /api/v1/admin/users/{user_id}/active

Activate/deactivate a user.

### PATCH /api/v1/admin/users/{user_id}/role

Update role (`SUPER_ADMIN` only).

### DELETE /api/v1/admin/users/{user_id}

Soft delete user (`deleted_at`, `deleted_by_user_id`) (`SUPER_ADMIN` only).

### POST /api/v1/admin/users/{user_id}/revoke-sessions

Revoke refresh tokens and mark user sessions revoked.

### GET /api/v1/admin/configuration

List safe runtime operational settings with environment/database source metadata.

### PUT /api/v1/admin/configuration/{setting_key}

Update one safe runtime setting (`SUPER_ADMIN` only).

### GET /api/v1/admin/jobs/executions

List `system_job_executions`.

### GET /api/v1/admin/jobs/executions/{execution_id}

Get one execution record.

### POST /api/v1/admin/jobs/trigger

Manually trigger market sync, snapshot, stock details sync, indicators, or signals (`SUPER_ADMIN` only).

### GET /api/v1/admin/email-campaigns

List email campaigns.

### POST /api/v1/admin/email-campaigns

Create a draft campaign.

### POST /api/v1/admin/email-campaigns/{campaign_id}/queue

Snapshot recipients into `email_campaign_recipients` and mark campaign `QUEUED`.

### GET /api/v1/admin/email-campaigns/{campaign_id}/recipients

List snapshotted campaign recipients and delivery status.

---

## Wealth Workspace

### POST /api/v1/wealth/tools/{tool_slug}/calculate

**Description**
Public educational scenario calculation for wealth tools. No persistence.

**Path Params**

* tool_slug: one of `fdr`, `dps`, `sanchayapatra`, `compound-growth`, `emi`, `cagr`, `zakat`, `retirement`, `savings-goal`

**Body**

```json
{
  "inputs": {
    "principal": 500000,
    "years": 3,
    "profit_distribution_type": "maturity",
    "account_identifier": "optional-reference"
  },
  "assumptions": {
    "country_code": "BD",
    "inflation_rate": 8
  }
}
```

For `sanchayapatra`, `inputs` supports:

```json
{
  "inputs": {
    "certificate_type": "family-savings",
    "principal": 1000000,
    "purchase_date": "2026-06-08",
    "annual_rate": 11.52,
    "profit_distribution_type": "configured",
    "account_identifier": "optional-certificate-number",
    "notes": "Family certificate"
  },
  "assumptions": {
    "country_code": "BD",
    "inflation_rate": 8
  }
}
```

### POST /api/v1/wealth/tax-planner/calculate

**Description**
Public stateless Bangladesh Tax Planner estimate. This is for planning only and does not persist scenarios, prepare returns, generate NBR forms, or model full minimum-tax filing edge cases.

**Body**

```json
{
  "mode": "QUICK",
  "fiscal_year": "2025-2026",
  "profile": {
    "resident_individual": true,
    "gender": "PREFER_NOT_TO_SAY",
    "age": null,
    "senior_citizen": false,
    "person_with_disability": false,
    "freedom_fighter": false
  },
  "income": {
    "annual_salary": 1200000,
    "other_yearly_income": 100000
  },
  "investments": {
    "tax_saving_investments": 150000,
    "simulation_additional_investment": 0
  }
}
```

**Response Data**

Returns raw values for frontend presentation:

```json
{
  "fiscal_year": "2025-2026",
  "mode": "QUICK",
  "total_income": 1300000,
  "tax_free_allowance": 375000,
  "taxable_income": 925000,
  "gross_tax": 135000,
  "rebate": 22500,
  "final_tax": 112500,
  "current_eligible_investment": 150000,
  "maximum_eligible_investment": 260000,
  "remaining_eligible_investment": 110000,
  "potential_additional_tax_saving": 16500,
  "slab_breakdown": [],
  "insights": [],
  "assumptions_used": {},
  "disclaimer": "Estimated for planning purposes only. This tool is not a substitute for professional tax advice or official NBR tax filing."
}
```

### POST /api/v1/wealth/comparisons/{comparison_slug}/evaluate

**Description**
Public comparison evaluation between two financial scenarios.

**Path Params**

* comparison_slug: one of `dps-vs-fdr`, `fdr-vs-stocks`, `save-vs-spend`, `loan-prepayment-vs-investing`, `inflation-impact`

### GET /api/v1/wealth/seasonal-context

**Description**
Public lightweight seasonal context for the wealth workspace landing page.

### GET /api/v1/wealth/snapshot

**Description**
Protected endpoint returning the authenticated user's Money Snapshot.

### PATCH /api/v1/wealth/snapshot

**Description**
Protected partial update for gradual Money Snapshot collection.
Asset and liability items may include optional `metadata` for projection context such as rates, dates, certificate type, payout style, account/certificate identifier, periodic profit, and notes. `SANCHAYAPATRA` is a supported asset category and remains separate from `DEPOSIT`; DPS and FDR can both be represented as `DEPOSIT` with `metadata.deposit_type`.

### GET /api/v1/wealth/dashboard

**Description**
Protected dashboard summary with net worth, clarity score, insights, goals, and saved scenarios.

### POST /api/v1/wealth/scenarios

**Description**
Protected endpoint for saving calculator or comparison scenarios.
