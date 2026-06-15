# Market Pulse Module

## Purpose

Market Pulse is the platform's curated daily trader briefing. It answers which stocks deserve attention today, what changed since the last refresh, and which unusual market events matter now.

Unlike the Dashboard or Scanner, Market Pulse is editorial and attention-focused — not a broad market overview or filterable screener.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/market/pulse` | Full Market Pulse briefing payload |

### Query parameters

| Param | Type | Notes |
|-------|------|-------|
| `exchange` | `DSE` / `CSE` | Default `DSE` |
| `display_name` | string | Optional greeting personalization |
| `previous_snapshot` | URL-encoded JSON | Optional prior snapshot for change detection |

### Previous snapshot shape

```json
{
  "last_synced_at": "2026-06-15T10:35:00+06:00",
  "focus_stock_ids": ["uuid", "uuid"],
  "scores": { "uuid": 82 },
  "recommendations": { "uuid": "BUY" },
  "alert_ids": ["alert-volume-uuid"]
}
```

When provided, the backend computes:

- Since your last visit summary
- What's Changed timeline entries
- New focus / alert counts

## Architecture

```text
market_pulse_router
  -> market_pulse_service
      -> market_data_repository.list_market_price_windows
      -> market_data_service.get_market_freshness
      -> build_technical_snapshot
      -> compute_trader_decision_summary_for_stock
      -> pulse_score.compute_pulse_score
```

### Module files

| File | Responsibility |
|------|----------------|
| `backend/app/modules/market_pulse/market_pulse_router.py` | HTTP route |
| `backend/app/modules/market_pulse/market_pulse_service.py` | Briefing orchestration |
| `backend/app/modules/market_pulse/market_pulse_schemas.py` | API contracts |
| `backend/app/modules/market_pulse/pulse_score.py` | Pulse Score + focus labels |

Registered in `backend/app/api/v1/v1_router.py`.

## Pulse Score

Pulse Score is an attention score (0–100), not a BUY score.

### Core components

| Component | Max points |
|-----------|------------|
| Trend | 35 |
| Momentum | 30 |
| Volume | 25 |

### Modifiers

| Modifier | Range |
|----------|-------|
| Signal Boost | up to +10 |
| Risk Penalty | up to -20 |

Constants live in `backend/app/core/constants/trading_constants.py`.

### Focus labels

Each focus stock receives one editorial label:

- `New BUY Setup`
- `Momentum Building`
- `Volume Breakout`
- `Watch Closely`
- `Signal Upgrade`

### Focus selection

- Threshold: `PULSE_SCORE_FOCUS_THRESHOLD` (60)
- Maximum focus stocks: 5
- Sector diversification: max 2 stocks per sector unless scores force inclusion

## Data sources

Uses existing platform capabilities only:

- `daily_prices` price windows (90-day lookback, up to 500 stocks)
- Trader decision engine (`stock_details/decision`)
- Technical snapshot (RSI, SMA20, EMA20, trend, volume ratio)
- Market freshness metadata

No AI is required for V1.

## Frontend

- Route: `/market-pulse`
- Feature module: `frontend/features/market-pulse/`
- API client: `frontend/lib/api/market-pulse-api.ts`
- Local storage retains the previous snapshot for change detection between visits

## Future evolution

- Persist pulse snapshots per refresh cycle server-side
- Reuse Pulse Score in Scanner, Watchlist, and Stock Details from the same backend module
- Watchlist-aware personalization
- AI-generated narrative summaries on top of deterministic evidence

## Related

- Market data: `backend/docs/market_data.md`
- Decision support: `backend/docs/stock_decision_support.md`
- API reference: `backend/docs/api_collection.md`
