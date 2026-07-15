# Backtesting Module

Read-only, point-in-time research replay for the versioned canonical decision
engine. The module owns historical loading, prefix-only replay, next-session
execution, costs/non-fills, forward outcomes, baselines, walk-forward splits,
Pulse rank metrics, sensitivity, and held-out calibration diagnostics.

It does not publish a production recommendation API or mutate signal history.
See `backend/docs/backtesting.md` for the command and limitations.

