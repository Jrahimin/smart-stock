import type { BackendMarketPulsePreviousSnapshotDto, ExchangeCode } from "@/lib/api/backend-api-types";

export function normalizeDisplayName(displayName: string | null | undefined): string | null {
  if (displayName == null) {
    return null;
  }

  const trimmed = displayName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Stable TanStack key segment for personalized pulse previous-snapshot inputs. */
export function buildPreviousSnapshotFingerprint(
  snapshot: BackendMarketPulsePreviousSnapshotDto | null | undefined,
): string | null {
  if (!snapshot?.last_synced_at) {
    return null;
  }

  const focusStockIds = [...snapshot.focus_stock_ids].sort();
  const alertIds = [...snapshot.alert_ids].sort();
  const scores = Object.fromEntries(
    Object.entries(snapshot.scores).sort(([left], [right]) => left.localeCompare(right)),
  );
  const recommendations = Object.fromEntries(
    Object.entries(snapshot.recommendations).sort(([left], [right]) => left.localeCompare(right)),
  );

  return JSON.stringify({
    last_synced_at: snapshot.last_synced_at,
    focus_stock_ids: focusStockIds,
    alert_ids: alertIds,
    scores,
    recommendations,
  });
}

export function buildPulseSummaryQueryKey(params: {
  exchange?: ExchangeCode;
  displayName?: string | null;
  previousSnapshot?: BackendMarketPulsePreviousSnapshotDto | null;
}): readonly ["market-pulse-summary", ExchangeCode, string | null, string | null] {
  const exchange = params.exchange ?? "DSE";
  const displayName = normalizeDisplayName(params.displayName);
  const previousSnapshotFingerprint = buildPreviousSnapshotFingerprint(params.previousSnapshot);

  return ["market-pulse-summary", exchange, displayName, previousSnapshotFingerprint];
}

export function buildPulseBriefingQueryKey(params: {
  exchange?: ExchangeCode;
  displayName?: string | null;
}): readonly ["market-pulse-briefing", ExchangeCode, string | null] {
  const exchange = params.exchange ?? "DSE";
  const displayName = normalizeDisplayName(params.displayName);

  return ["market-pulse-briefing", exchange, displayName];
}

export const PULSE_ANONYMOUS_SUMMARY_QUERY_KEY = buildPulseSummaryQueryKey({
  exchange: "DSE",
  displayName: null,
  previousSnapshot: null,
});

export const PULSE_ANONYMOUS_BRIEFING_QUERY_KEY = buildPulseBriefingQueryKey({
  exchange: "DSE",
  displayName: null,
});
