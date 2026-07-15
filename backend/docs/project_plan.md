# Project Plan – Stock Intelligence System

---

# 🧠 Core Principles

* Build for **decision making**, not just data storage
* Follow strict dependency:
  **Stock → Market Data → Indicators → Signals → Insights**
* Keep execution simple, consistent, and incremental
* Avoid jumping to advanced features early

---

# 🚀 FEATURE ROADMAP

| Feature            | Description                     | Progress         | Current |
| ------------------ | ------------------------------- | ---------------- | ------- |
| Stock Module       | Master stock data               | B ✅ / M ⏳ / A ⏳  |         |
| Market Data        | Price ingestion + storage       | B ✅ / M ✅ / A ⏳ |         |
| Indicators         | Technical indicators            | B 🔵 / M ⏳ / A ⏳  | 🔵      |
| Signals Engine     | Buy/sell logic                  | B ⏳ / M ⏳ / A ⏳  |         |
| Market Scanner     | Opportunity detection (core UX) | B ⏳ / M ⏳ / A ⏳  |         |
| Fundamentals       | Financial + dividend data       | B ⏳ / M ⏳ / A ⏳  |         |
| Smart Insights     | Explain stock condition         | B ⏳ / M ⏳ / A ⏳  |         |
| Market Dashboard   | Market overview                 | B ⏳ / M ⏳ / A ⏳  |         |
| Watchlist & Alerts | Personalized tracking           | B ⏳ / M ⏳ / A ⏳  |         |
| Admin Panel        | Operational admin surface       | B ✅ / M ⏳ / A ⏳  |         |
| Backtesting        | Strategy evaluation             | B ⏳ / M ⏳ / A ⏳  |         |
| AI Analysis        | LLM-powered insights            | B ⏳ / M ⏳ / A ⏳  |         |

---

## Progress Rules

* Features evolve: **Basic → Moderate → Advanced**
* Do not start Moderate before Basic is complete
* Only ONE feature can be 🔵 CURRENT
* Prefer completing Basic across core features first

---

# 🧩 TASK BREAKDOWN

---

## 🧱 0. Stock Module (FOUNDATION)

### 🔹 Basic (Completed)

* [x] Stock schema design
* [x] Unique constraint (exchange + symbol)
* [x] Repository + service layer
* [x] Create/list/get APIs
* [x] Pagination
* [x] API documentation

---

### 🔹 Moderate

* [ ] Search (symbol/name)
* [ ] Filtering (exchange, sector)
* [ ] Active/inactive toggle

---

### 🔹 Advanced

* [ ] External sync (auto stock list)
* [ ] Metadata enrichment

---

## 📊 1. Market Data (CURRENT)

### 🔹 Basic (Must Complete)

* [x] Identify sources (AmarStock / StockNow)
* [x] Build scraper (daily prices)
* [x] Normalize OHLCV data
* [x] Store in DB (daily_prices)
* [x] Deduplicate (stock_id + trade_date)
* [x] Implement GET prices API
* [x] Add pagination

---

### 🔹 Moderate

* [x] Data quality handling (flags)
* [x] Handle missing/inconsistent data
* [x] Compute derived fields:

  * price_change
  * percentage change
  * turnover
* [x] Validate data (high >= low)
* [x] Scheduled ingestion job

---

### 🔹 Advanced

* [ ] Bulk insert optimization
* [ ] Retry + logging
* [ ] Data anomaly detection

---

## 📈 2. Indicators

### 🔹 Basic

* [ ] SMA
* [ ] EMA
* [ ] RSI

---

### 🔹 Moderate

* [ ] MACD
* [ ] Bollinger Bands

---

### 🔹 Advanced

* [ ] Composite indicators
* [ ] Volatility metrics
* [ ] Feature engineering layer

---

## 📊 3. Signals Engine

### 🔹 Basic

* [ ] RSI signals
* [ ] MA crossover signals

---

### 🔹 Moderate

* [ ] Multi-factor signals
* [ ] Confidence scoring

---

### 🔹 Advanced

* [ ] Strategy abstraction
* [ ] Signal performance tracking

---

## 🔍 4. Market Scanner (CORE PRODUCT FEATURE)

### 🔹 Basic

* [ ] Top gainers/losers
* [ ] Volume spike detection
* [ ] Breakout detection

---

### 🔹 Moderate

* [ ] RSI oversold stocks
* [ ] Trend continuation detection
* [ ] Momentum ranking

---

### 🔹 Advanced

* [ ] Accumulation detection
* [ ] Smart money flow signals

---

## 💰 5. Fundamentals

### 🔹 Basic

* [ ] Financial reports storage
* [ ] Dividend data storage

---

### 🔹 Moderate

* [ ] P/E, dividend yield
* [ ] EPS growth trends

---

### 🔹 Advanced

* [ ] Fundamental scoring
* [ ] Undervalued stock detection

---

## 🧠 6. Smart Insights

### 🔹 Basic

* [ ] Rule-based summaries

---

### 🔹 Moderate

* [ ] Combine price + fundamentals

---

### 🔹 Advanced

* [ ] AI-generated insights
* [ ] Risk explanations

---

## 📊 7. Market Dashboard

### 🔹 Basic

* [ ] Market summary (index, adv/decl)

---

### 🔹 Moderate

* [ ] Sector performance

---

### 🔹 Advanced

* [ ] Market sentiment index

---

## 🔔 8. Watchlist & Alerts

### 🔹 Basic

* [x] Watchlist CRUD

---

### 🔹 Moderate

* [ ] Signal-based alerts

---

### 🔹 Advanced

* [ ] Smart alerts (multi-condition)

---

## 🧪 9. Backtesting

### 🔹 Basic

* [x] Replay signals on historical data

---

### 🔹 Moderate

* [x] Performance metrics (return, win rate)

---

### 🔹 Advanced

* [ ] Strategy optimization

---

## 🤖 10. AI Analysis

### 🔹 Basic

* [ ] Stock summary

---

### 🔹 Moderate

* [ ] Explain signals
* [ ] Risk insights

---

### 🔹 Advanced

* [ ] Conversational assistant
* [ ] Personalized recommendations

---

## 🧭 Trading Intelligence Refinement

Source: `backend/docs/trading_intelligence_audit_and_refinement_plan.md`.

* [x] Phase 1 — correctness fixes and honest result semantics
* [x] Phase 2 — data correctness and DSE/CSE safeguards
* [x] Phase 3 — decision logic, risk, evidence, and trade-plan coherence
* [x] Phase 4 — authoritative decision ownership and cross-surface consistency
* [x] Phase 5 — Market Pulse and scanner alignment
* [x] Phase 6 — practical point-in-time backtesting and calibration
* [x] Phase 7 — production hardening and deferred advanced validation

Phase 1 keeps existing response fields readable while adding explicit score semantics and trade-plan feasibility status. No Phase 2 eligibility, adjusted-series, session-staleness, or liquidity-policy work is included.

Phase 2 adds atomic OHLC construction, close-derived volatility, Wilder ATR14,
official-session staleness, robust traded-session liquidity/provenance, and one
shared eligibility context for detail/universe/Pulse. A verified adjustment
factor feed is unavailable, so known/unresolved corporate-action breaks fail
closed as REVIEW_ONLY rather than using invented factors.

Phase 3 adds separate directional evidence, data reliability, liquidity, and
trading-risk meanings; one authoritative constraint set and contextual
holder/non-holder action matrix; explicit primary-reason ownership; and
target-less watch-only handling when a defensible resistance objective is
missing. Existing API fields and UI composition remain compatible.

Phase 4 adds a versioned `CanonicalDecisionResult` and one shared strategy-input
factory for universe and stock detail. Universe rows are the reusable compact
source for list surfaces and watchlists; watchlists no longer recompute technicals
or actions. Redis identity includes exchange session and strategy version,
persisted signals are comparable only when version/date/taxonomy match, and
frontend chart calculations cannot override backend action badges. Existing
recommendation fields remain compatibility projections.

Phase 5 applies canonical eligibility to Pulse focus/ranking and moves Scanner
predicates to a versioned backend domain result. Phase 6 adds a read-only,
prefix-only canonical replay with next-session execution, explicit costs and
non-fills, 5/10/20-session outcomes, simple baselines, purged walk-forward
splits, Pulse rank metrics, a small sensitivity grid, and held-out calibration
diagnostics. Missing effective-dated status/category/circuit and corporate-action
history is disclosed and never silently treated as complete point-in-time data.

Phase 7 adds content-derived data/event/input revisions, lineage-aware cache
validation, append-only canonical decision snapshots, reproducible backtest
manifests, selected golden regression coverage, stale/drift/cross-surface
monitoring, an operational runbook/check command, and final deprecation cleanup.
Raw source-revision archives and institutional independent validation remain
explicitly outside the available data boundary.

## Decision Model Evolution

Source: `backend/docs/decision_model_evolution_three_phase_plan.md`.

* [x] Phase 1 — canonical session integrity and observability
* [x] Phase 2 — conditional opportunity and entry-plan model
* [x] Phase 3 — public taxonomy rollout, compatibility, and validation

---

# 🧠 EXECUTION STRATEGY

### Phase 1 (Minimum usable system)

* Stock ✅
* Market Data (Basic)
* Indicators (Basic)
* Signals (Basic)
* Scanner (Basic)

---

### Phase 2 (Trader-useful system)

* Fundamentals
* Multi-factor signals
* Watchlist & alerts
* Dashboard

---

### Phase 3 (Advanced system)

* Backtesting
* AI insights
* Smart analytics

---

# 🔥 FINAL RULE

This is not a data project.

This is a **trading decision system**.

Every feature must answer:
👉 "What should the trader do next?"

---

# 📝 STATUS UPDATE RULE

After completing tasks:

* update checkboxes
* update feature progress (B/M/A)
* move 🔵 CURRENT to next feature
