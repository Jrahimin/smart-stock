# Market Dashboard

Trader `/dashboard` section endpoints with optional Redis caching. Admin dashboard is out of scope.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `market_dashboard_router.py` | HTTP only — optional `X-Market-Compute-Ms` header in local/dev |
| `market_dashboard_service.py` | Compute-on-miss, Redis get/set, lightweight snapshot orchestration |
| `market_snapshot.py` | Load latest prices + summaries (no trader decision engine) |
| `market_dashboard_compute.py` | Pure snapshot helpers (movers, mood, heatmap, sectors, alerts) |
| `dsex_metrics.py` | DB-first DSEX 1M/6M/1Y; AmarStock fallback only when local depth insufficient |
| `market_dashboard_cache.py` | Canonical cache keys |

**Policies:**

- Dashboard **never** calls `get_scored_universe()` or `compute_trader_decision_from_prices`.
- After sync, background `rebuild_market_read_cache()` warms overview, sectors, and movers before universe (see [market_caching.md](market_caching.md)).
- Redis optional — unset `REDIS_URL` and the API computes on every request.
- TTL: session-aware via `dashboard_cache_ttl_seconds` on `GET /market/freshness`.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /dashboard/overview` | DSEX snapshot (DB-first metrics), summaries, listed stock count — **pulse core** |
| `GET /dashboard/movers` | Gainers, losers, turnover/volume leaders |
| `GET /dashboard/sectors` | Sector participation + top gainer — **leaders widget** (loads independently of overview) |
| `GET /dashboard/market-alerts` | Timeline from lightweight snapshot + summary |
| `GET /dashboard/stocks-in-focus` | Legacy stub (empty); terminal UI uses `GET /signals/decisions/latest` |
| `GET /dashboard/heatmap` | Heatmap tiles from latest daily prices |
| `GET /dashboard/market-sentiment` | Mood + insights from snapshot breadth (no inline decision engine) |

## Cache keys

```
dashboard:overview:{exchange}
dashboard:movers:{exchange}
dashboard:sectors:{exchange}
dashboard:market-alerts:{exchange}
dashboard:stocks-in-focus:{exchange}
dashboard:heatmap:{exchange}
dashboard:market-sentiment:{exchange}
```

## Request flow

```
GET /dashboard/overview
  → Redis GET dashboard:overview:DSE
  → miss: load_dashboard_market_snapshot()
         + build_dsex_performance_snapshot() (no AmarStock on read when depth sufficient)
  → SET EX ttl → return
```

## Computation notes

| Section | Data source |
|---------|-------------|
| Overview / sentiment DSEX | `list_daily_market_summaries` + `dsex_metrics` |
| Movers / heatmap | `list_latest_daily_prices` + `build_technical_snapshot` |
| Sectors / alerts / sentiment breadth | `load_dashboard_market_snapshot` |
| Stocks in focus (UI) | `GET /signals/decisions/latest` (universe Redis cache; not dashboard compute) |

Mover eligibility mirrors `market_mover_rules.is_eligible_session_mover`.

## Frontend load tiers

| Tier | Hooks | Notes |
|------|-------|-------|
| Pulse core | `useDashboardOverview` | DSEX, turnover, volume, breadth render when overview returns |
| Leaders (non-blocking) | `useDashboardSectors` | Own skeleton in pulse strip |
| Secondary | movers, stocks-in-focus, market-alerts | Core workspace columns |
| Deferred | heatmap, market-sentiment | Enabled after overview loads |

Manual refresh clears all IndexedDB + invalidates TanStack market query roots. Sync coordinator clears market IndexedDB only, then invalidates TanStack.

## DSEX data source

Overview uses local `daily_market_summaries` for 1M returns always. 6M/1Y use local data when ≥126/252 trading days exist; otherwise a cached AmarStock fallback (`dsex:amarstock_metrics:{exchange}`). AmarStock HTTP is **not** called on every dashboard read.


### Current market status and breadth provenance

Overview and sentiment add `market_status`, refreshed from freshness even on a
cache hit, and `breadth`. The latter identifies the active valid-OHLC snapshot
cohort, zero-width neutral band, `daily_prices` source and session date. Counts
separate known and unknown changes; unchanged means a known zero change. The
percentage denominator is `known_count`, while `cohort_count` includes unknowns.
Pulse uses a separately labelled eligible cohort and ±0.05% band, so unlike
populations must not be presented as equivalent counts. Equal inputs/bands use
one shared breadth calculation. Sectors expose `leader_metric` (mean session
price change), `leader_population` and the existing session as-of date.
# Dated breadth inputs

The active valid-OHLC cohort retains stale latest rows in its denominator, but a
price change is known for breadth only when that row's trade date equals the
analysis session. Older-session changes count as unknown. Overview and sentiment
breadth counts use the same dated input; exchange-index breadth keeps its own
separately dated source instead of replacing this cohort's counts.

### Snapshot interpretation (Order 4, increment 2)

Dashboard's one-bar HTTP snapshot cannot establish history-dependent accumulation, recovery or volatility mood; those claims are suppressed without fetching full histories. Dated index movement and observed breadth remain available. Breadth displays its known/cohort and unknown counts, zero neutral band and observation date. Pulse has a different eligible same-session cohort and ±0.05% band, so differing counts can be valid. Missing sector changes do not become zero-valued leaders. The scored-universe Smart Signals feed retains server shortlist order and shares current-entry bounds with the other universe consumers.

### Measured session interpretation

Sentiment adds `interpretation`: a shared backend code (`ALIGNED_UP`, `ALIGNED_DOWN`, `DIVERGENT`, `MIXED`, `INDEX_ONLY`, `BREADTH_ONLY`, `UNAVAILABLE`), session date, nullable recorded index change, the complete breadth facts, nullable volume/prior-average ratio and the actual average sample count (up to 30 prior sessions). Agreement is based only on signs of the stored same-session DSEX move and known advances minus declines. Unknown index change stays null, including when the overview's display DTO would substitute zero. Prior volume comparisons exclude other indices and suspicious summaries; zero current volume differs from an unavailable comparison.

This lightweight section uses the existing persisted summary/snapshot batch; it does not request full stock histories, horizon metrics or a provider fallback. The existing interpretation card renders localized facts and coverage, with no accumulation/recovery claim. An old cached sentiment projection missing interpretation is recomputed within the same generation; only matching old sentiment IndexedDB entries are rejected. Other cached sections retain their existing policy.

For that same session the central Dashboard model also uses the delivered interpretation volume ratio and actual prior-session sample count in the hero, keeping its full volume amount. A delivered unavailable comparison stays unavailable; an older API without typed interpretation retains its legacy hero comparison and no interpretation card. The two visible participation readings therefore share one supplied baseline.

Same-session typed-null index movement suppresses the hero's legacy zero substitution while preserving the known index level. A measured zero remains visible. The central model omits a differently dated typed interpretation before headline/card composition in either date ordering, so another session's direction cannot label the displayed breadth/date. Older APIs retain their existing level/movement behavior.

The sentiment mapper retains its delivered `market_sync_id`; the Dashboard hook compares the delivered overview and sentiment IDs before passing any sentiment-derived fields into the central model. When both IDs exist and disagree, that section is withheld from headline/card and index/volume overlays even on the same calendar date. Either arrival order is safe, and matching delivered IDs restore the reading. A missing legacy section ID retains the existing date compatibility check. This join guard does not change query scheduling, API admission, cache policy or backend calculations.

Partial/intraday wording uses one model Boolean shared by localized turnover descriptions and the Insights view. It requires an OPEN exchange state and the displayed facts date to be today's Dhaka calendar date. Historical facts remain recorded-session context even while Market now is OPEN; current exchange state and polling are unchanged. This presentation check does not establish verified source observation timing or fresh-entry applicability.

The Dashboard hero uses a short headline selected from that backend code and compact coverage/method disclosures. Its original illustrated Market Pulse and Wealth Workspace navigation cards, artwork, supporting text and responsive section layout are retained. Current status, date, index and core metrics remain visible. Shared modal disclosures return focus to their launcher on dismissal. Repeated generic dated-plan requirements are omitted from compact discovery previews; immediate entry status, its controlling reason, stock-specific limitations/support and the full Detail plan remain available.


## Measured sector map contract

`GET /dashboard/heatmap` retains each tile's `trade_date` and exposes nullable
`change_percent`, `latest_price` and `turnover`. Missing price or turnover is
not formatted as zero. Only measured, non-suspicious returns from `session_trade_date`
contribute to `sectors`. Each sector supplies `name`, nullable `change_percent`,
`measured_count`, `total_count` and `weighting` (`TURNOVER`, `EQUAL`, `UNAVAILABLE`).
Turnover weighting requires positive turnover for every measured constituent.
Otherwise the aggregate uses equal weights across all measured constituents.
Stale or unknown returns remain visible as unavailable tiles, with their actual
price dates available in the stock disclosure. Measured zero remains flat.

The client displays these aggregates and coverage directly. An older backend
without sector summaries produces an unavailable sector reading. No client
reconstruction is performed. The section's Redis revision is `measured-v3`, and
its IndexedDB presentation suffix is `heatmap-measured-v3`.

Entry disclosures use “Entry unverified” in English and “এন্ট্রি যাচাই হয়নি” in
Bangla. “Quote time unavailable” is appended only when the assessment has no
source observation time. The dated quote and controlling reason remain in the
existing disclosure. Portfolio's saved count includes held stocks, while its
watchlist-only filter selects unheld saved stocks.


### Published eligible session leaders

`/dashboard/sectors` reads a compact generation-keyed projection of the durable
canonical publication for its named stock leader and equal-weight sector returns. This narrow display
projection reuses Pulse's same-session ELIGIBLE predicate and exact decimal
change measure. No decision calculation runs on the HTTP path. The publication
must match the required finalized generation; withdrawn/missing results are
unavailable. Decision publication identity is exposed separately from the market
quote boundary and rechecked on reads, including cached dashboard responses.
At least three eligible constituents with complete exact change evidence are
required per sector; `excluded_sector_count` discloses partial coverage. Broad
snapshot breadth, sector focus and the weighted heatmap remain separate.

The compact leadership projection is warmed when the validated durable universe
winner is cached. A cold miss hydrates that winner once and caches only leader,
sector and coverage fields. Warm requests check publication/withdrawal metadata
and the current compact market manifest; they do not calculate finalized input
fingerprints or validate every universe row. Changing/withdrawing the published
head makes a cached leader unavailable. No production latency claim is made.
