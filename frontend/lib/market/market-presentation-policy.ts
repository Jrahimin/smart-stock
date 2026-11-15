/** Customer presentation only. API evidence, logging and eligibility remain authoritative. */
const internalFreshnessReasons = new Set([
  "stale_data", "sparse_data", "stale_sparse_data", "market_evidence_unknown", "missing_latest_session",
  "quote_unusable", "coverage_unknown", "path_incomplete", "session_settling", "quote_unverified",
]);

export function isInternalFreshnessReason(code: string | null | undefined) {
  return internalFreshnessReasons.has((code ?? "").toLowerCase());
}

export function visiblePriceQuality(status: string | null | undefined) {
  return status === "SUSPICIOUS" || status === "SUSPENDED" || status === "NON_TRADED";
}
