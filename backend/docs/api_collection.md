# Smart Stock API Collection

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
* price_window_limit: number, default 60, min 1, max 260

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
      ]
    }
  ]
}
```

**Notes**

* Only active stocks with available `daily_prices` rows are returned.
* Prices inside each stock window are newest first.
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
Run daily price ingestion for a trade date. The current source implementation fetches DSE day-end archive data, normalizes OHLCV rows, maps symbols to existing stock master records, skips duplicates, and stores valid rows.

**Path Params**

None

**Query Params**

* trade_date: required date, `YYYY-MM-DD`
* exchange: optional enum, one of `DSE`, `CSE`, default `DSE`

**Body**

None

**Response**

```json
{
  "success": true,
  "message": "Daily prices ingested",
  "data": {
    "exchange": "DSE",
    "trade_date": "2026-04-30",
    "source": "DSE",
    "fetched_count": 392,
    "created_count": 388,
    "skipped_existing_count": 2,
    "skipped_unknown_symbol_count": 2
  }
}
```

**Notes**

* Requires authenticated user context.
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
Run API-only AmarStock stock details ingestion for eligible active stocks. The workflow uses snapshot, historical price, and company financial APIs, and tracks each selected stock in `stock_details_sync_jobs`.

**Body**

```json
{
  "exchange": "DSE",
  "symbols": ["EBL"],
  "limit": 20,
  "offset": 0,
  "historical_window_days": 180,
  "force": false,
  "trigger_type": "MANUAL"
}
```

**Response**

```json
{
  "success": true,
  "message": "Stock details synced",
  "data": {
    "exchange": "DSE",
    "source": "AMARSTOCK_API",
    "requested_count": 1,
    "selected_count": 1,
    "synced_count": 1,
    "partial_count": 0,
    "failed_count": 0,
    "skipped_count": 0,
    "daily_price_count": 90,
    "metric_count": 25,
    "valuation_count": 1,
    "shareholding_count": 1,
    "event_count": 2
  }
}
```

---

### GET /api/v1/stock-details/sync-jobs/{job_id}

**Description**
Return one stock details sync job with status, attempts, error, source URL, and parser/API diagnostics stored in metadata.
