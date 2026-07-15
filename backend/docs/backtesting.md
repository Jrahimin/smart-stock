# Practical Point-in-Time Backtesting

## Scope

The Phase 6 backtest is a read-only research path over the same versioned
canonical engine used by live stock decisions. It is deliberately smaller than
an institutional research platform. It produces aggregate JSON and does not
change live signals, caches, API responses, or frontend layout.

Run from `backend/`:

```powershell
python -m app.scripts.run_trading_backtest `
  --exchange DSE `
  --start 2026-01-01 `
  --end 2026-07-14 `
  --one-way-cost-bps 50 `
  --order-value-bdt 100000 `
  --maximum-turnover-fraction 0.01 `
  --output .artifacts/backtest-dse.json `
  --manifest-output .artifacts/backtest-dse.manifest.json
```

`--end` is the research data cutoff. The replay automatically reserves the
last maximum-horizon sessions as an outcome tail, so they are never treated as
signal dates.

The cost, order-size, capacity, execution-price, and walk-forward assumptions
are explicit inputs. The 50 bps default is a conservative research assumption,
not a claim about any broker's current fee schedule; use an effective-dated
verified value for a formal study.

## Chronology and execution

- Each decision receives only OHLCV rows, market summaries, exchange sessions,
  and stored corporate-action dates available on or before `as_of_date`.
- Current category is excluded from engine inputs by default because the table
  is not effective-dated. `--use-current-category-proxy` is an explicit,
  disclosed non-point-in-time sensitivity only.
- A signal calculated from a session close can fill only on the next exchange
  session open (or close when configured). It is never filled at the same close.
- A missing stock bar, zero volume, known suspension, known circuit lock,
  invalid price, or order above the configured turnover capacity records a
  non-fill. The order is not carried forward automatically.
- Forward outcomes use 5, 10, and 20 exchange sessions. Missing/zero-volume
  horizon bars remain unavailable rather than becoming flat returns.
- A stored corporate action inside an unadjusted outcome window fails closed.
  Same-day stop/target ordering is not inferred from daily bars.

## Report

The aggregate JSON contains:

- a `trading-replay-manifest-v1` manifest with hashes of the explicit config,
  complete loaded dataset, canonical observations, and forward outcomes;

- action/eligibility coverage and exclusion counts;
- machine-readable eligibility-reason counts, including empty-candidate failure
  states rather than suppressed or relaxed safeguards;
- 10-session canonical BUY results beside price>SMA20,
  price>SMA20>SMA50, RSI<30, and no-trade baselines;
- modeled fill rate, net/excess return, hit rate, MFE, and MAE;
- Pulse top-five precision/lift and Spearman rank information coefficient;
- principal canonical BUY results stratified by market regime, sector,
  liquidity/capacity, traded-session coverage, and clearly labeled current
  category snapshot, always with sample counts;
- expanding or rolling chronological folds with max-horizon purging and a
  final frozen test period;
- a predeclared small sensitivity grid for costs and Pulse threshold;
- a held-out Brier/reliability diagnostic for exactly: “positive DSEX-relative
  return after modeled round-trip costs at 10 exchange sessions.”

Evidence strength remains a heuristic score. The report never changes it to a
production probability; `probability_exposed` remains false even when the
diagnostic is favorable, pending stronger sample and stability review.

## Reproducing a run

Run the same command with the same explicit arguments and add:

```powershell
--verify-manifest .artifacts/backtest-dse.manifest.json
```

The command exits with code `2` and names every mismatched manifest component
when the configuration, source dataset, strategy/threshold/input schema, replay
observations, or outcomes changed. A successful check means the current stored
inputs reproduce the prior run; it does not archive the raw database snapshot
or prove future performance. Keep the full report and compact manifest together
with any formal research result.

## Known data limitations

The report repeats runtime coverage limitations. In the current schema:

- historical membership is reconstructed from observed price rows, so deleted
  securities cannot be recovered;
- category and sector are current snapshots, not effective-dated history;
- suspension and circuit-lock history are absent;
- corporate actions are only as complete as stored event rows;
- adjusted closes may be absent, so known event windows fail closed;
- benchmark summaries may cover fewer sessions than stock OHLCV.

These gaps reduce coverage and defensibility. They are not silently imputed.
The manifest includes the same limitations, so a matching hash never upgrades
an incomplete point-in-time dataset into complete historical truth.
