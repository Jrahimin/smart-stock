# Fundamentals And Market Insight Schema

## Purpose

The trader-oriented schema extends the stock foundation with time-based facts for fundamental analysis, dividend quality, ownership risk, valuation history, corporate actions, and future AI/event workflows.

The design keeps `stocks` as static identity and stores changing facts in stock-linked tables. This allows price, signal, and backtesting logic to join fundamentals by date without bloating stock master data.

## Financial Reports

`financial_reports` stores one reporting-period container per stock.

Key fields:

* `stock_id`: links the report to stock master data.
* `fiscal_year`: the financial year the report belongs to.
* `period_type`: controlled enum, one of `QUARTERLY`, `HALF_YEARLY`, `ANNUAL`.
* `period_start_date` and `period_end_date`: exact coverage for the report.
* `published_date`: when the report became visible to the market.
* `report_status`: `UNAUDITED`, `AUDITED`, or `RESTATED`.
* `currency`, `source`, `data_quality_flag`, `metadata`.

Uniqueness is enforced by stock, fiscal year, period type, period end date, and report status. This keeps normal and restated versions distinct while preserving deterministic ingestion.

## Financial Metric Catalog

`financial_metric_definitions` stores metric definitions instead of hardcoding every financial field as a column.

Examples:

* `EPS`
* `NAVPS`
* `NOCFPS`
* `REVENUE`
* `GROSS_PROFIT`
* `NET_PROFIT`
* `TOTAL_ASSETS`
* `TOTAL_LIABILITIES`

Each metric has a `value_type` such as `AMOUNT`, `PERCENT`, `RATIO`, `PER_SHARE`, or `COUNT`. This allows future metrics to be added through data rather than schema changes.

## Financial Metric Values

`financial_metric_values` stores metric values for each financial report.

The `as_of_date` field is required. It records when a value became valid or was observed, which supports:

* audit corrections
* restatements
* source fixes
* historical reconstruction for backtesting

The unique key is financial report, metric definition, and `as_of_date`.

## Dividend Events

`dividend_events` stores dividend declarations and important dates.

Key fields:

* `dividend_type`: `CASH`, `STOCK`, or `MIXED`.
* `cash_dividend_percent`
* `stock_dividend_percent`
* `cash_amount_per_share`
* `declaration_date`
* `record_date`
* `ex_dividend_date`
* `payment_date`
* `status`

The explicit dividend type removes ambiguity and makes dividend history, stability, and yield queries straightforward. Yield should be calculated by joining dividend data to the relevant price from `daily_prices`.

## Shareholding Snapshots

`shareholding_snapshots` stores ownership structure as time-series data.

Tracked groups:

* sponsor/director
* government
* institution
* foreign
* public

The table also stores `total_shares`, `circulating_shares`, and `free_float_percent`. `circulating_shares` is important for liquidity and float analysis because paid-up capital alone is not enough to understand tradable supply.

Percentage fields are constrained between 0 and 100 when provided. The schema does not force ownership percentages to total exactly 100 because exchange data may be rounded, partial, or corrected later.

## Valuation Snapshots

`valuation_snapshots` stores derived valuation metrics by date:

* close price
* market cap
* P/E
* P/B
* dividend yield
* earnings yield
* price-to-sales

Although valuation can be recomputed, storing daily or periodic snapshots is useful for backtesting. It preserves what the system believed at the time, even when later financial reports are restated.

## Corporate Actions

`corporate_actions` stores material actions that affect price interpretation, share counts, or trading behavior.

The schema separates:

* `action_type`: broad group such as `DIVIDEND`, `CAPITAL_CHANGE`, `TRADING_STATUS`, `MEETING`, or `RESTRUCTURING`.
* `action_subtype`: concrete event such as `BONUS`, `SPLIT`, `RIGHTS`, `AGM`, `TRADING_SUSPENSION`, or `TRADING_RESUME`.

This supports future adjusted-price logic, event-aware backtests, and clearer filtering.

## Market Events

`market_events` is a lightweight table for disclosures, news, board meetings, earnings releases, regulatory events, and other market context.

Events can be linked to a stock or stored at exchange level. The table intentionally keeps content light with title, summary, source, URL, sentiment score, and metadata. Full article bodies, embeddings, or RAG documents should live in a future news or AI module.

## Query And Analysis Patterns

Common trader workflows supported by this schema:

* EPS or NAV trend: `stocks -> financial_reports -> financial_metric_values`
* Dividend stability: `stocks -> dividend_events`
* Dividend yield: `dividend_events -> daily_prices`
* Ownership risk: `stocks -> shareholding_snapshots`
* Historical valuation: `stocks -> valuation_snapshots`
* Event-aware price analysis: `stocks -> corporate_actions -> daily_prices`
* AI context retrieval: `stocks -> market_events`

## Design Rules

* Keep `stocks` lean and identity-focused.
* Store time-varying facts in dedicated time-series tables.
* Use enum fields where values must be controlled.
* Use JSON metadata only for source-specific extras, not primary query fields.
* Include source and quality fields where external data may be partial or suspicious.
* Keep uniqueness rules deterministic so ingestion jobs can be safely retried.
