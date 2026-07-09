/**
 * Legacy fallback only — mirrors backend `display_metrics.py` for older workspace payloads.
 * Prefer `workspace.display_metrics` from `StockWorkspaceRead` (Rule #1).
 * Do not add new call sites; remove this module once all clients send display_metrics.
 */

export function resolveLivePeRatio(
  currentPrice: number | null | undefined,
  eps: number | null | undefined,
  valuationPe: number | null | undefined,
  valuationClose: number | null | undefined,
): number | null {
  if (currentPrice != null && currentPrice > 0 && eps != null && eps > 0) {
    return currentPrice / eps;
  }

  if (
    currentPrice != null &&
    currentPrice > 0 &&
    valuationPe != null &&
    valuationPe > 0 &&
    valuationClose != null &&
    valuationClose > 0
  ) {
    return valuationPe * (currentPrice / valuationClose);
  }

  return valuationPe ?? null;
}

export function resolveLivePbRatio(
  currentPrice: number | null | undefined,
  nav: number | null | undefined,
  valuationPb: number | null | undefined,
  valuationClose: number | null | undefined,
): number | null {
  if (currentPrice != null && currentPrice > 0 && nav != null && nav > 0) {
    return currentPrice / nav;
  }

  if (
    currentPrice != null &&
    currentPrice > 0 &&
    valuationPb != null &&
    valuationPb > 0 &&
    valuationClose != null &&
    valuationClose > 0
  ) {
    return valuationPb * (currentPrice / valuationClose);
  }

  return valuationPb ?? null;
}

export function resolveLiveEarningsYield(
  currentPrice: number | null | undefined,
  eps: number | null | undefined,
  valuationEarningsYield: number | null | undefined,
  valuationClose: number | null | undefined,
): number | null {
  if (currentPrice != null && currentPrice > 0 && eps != null && eps > 0) {
    return (eps / currentPrice) * 100;
  }

  if (
    currentPrice != null &&
    currentPrice > 0 &&
    valuationEarningsYield != null &&
    valuationClose != null &&
    valuationClose > 0
  ) {
    return valuationEarningsYield * (valuationClose / currentPrice);
  }

  return valuationEarningsYield ?? null;
}
