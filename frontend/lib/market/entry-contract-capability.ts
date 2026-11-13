/** Enable only alongside the shared presenter, evidence fence and expiry owner. */
export const PRICE_BASIS_CONTRACT = "price-basis-v2";

export function entryContractParams<T>(path: string, params?: Record<string, T>) {
  // Bare decision/support and private list shapes do not carry the quote
  // envelope required by the shared expiry owner. Keep those clients legacy.
  const ownsAssessment = path === "/market/universe-rows" || path.startsWith("/market/pulse") ||
    /^\/stock-details\/[^/]+\/[^/]+\/workspace$/.test(path);
  return ownsAssessment ? { ...params, entry_contract: PRICE_BASIS_CONTRACT } : params;
}
