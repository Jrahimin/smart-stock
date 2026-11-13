import { fenceCurrentEntryPayload } from "@/lib/market/current-entry-contract";
import { PRICE_BASIS_CONTRACT } from "@/lib/market/entry-contract-capability";
import type { ExchangeCode, ApiResponse, BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { frontendConfig } from "@/lib/frontend-config";
import { encodeStockSymbolSegment } from "@/lib/seo/stock-page-seo";

export type StockWorkspaceLoadResult =
  | { status: "ok"; data: StockWorkspaceDto }
  | { status: "not_found" }
  | { status: "error"; message: string; httpStatus?: number };

/**
 * Load stock workspace for SSR/metadata.
 * Distinguishes real missing stocks (404) from backend/network failures so the
 * page only calls notFound() for genuine absences — not for 5xx/timeouts.
 */
export async function loadStockWorkspace(
  exchange: ExchangeCode,
  symbol: string,
): Promise<StockWorkspaceLoadResult> {
  const normalizedSymbol = symbol.toUpperCase();
  const path = `/stock-details/${exchange}/${encodeStockSymbolSegment(normalizedSymbol)}/workspace`;

  try {
    const response = await fetch(`${frontendConfig.apiBaseUrl}${path}?entry_contract=${PRICE_BASIS_CONTRACT}`, {
      cache: "no-store",
    });

    if (response.status === 404) {
      return { status: "not_found" };
    }

    if (!response.ok) {
      return {
        status: "error",
        message: `Stock workspace request failed (${response.status})`,
        httpStatus: response.status,
      };
    }

    const payload = (await response.json()) as ApiResponse<StockWorkspaceDto>;
    const data = payload.data ?? null;

    if (!data?.stock) {
      return { status: "not_found" };
    }

    let freshness: BackendMarketFreshnessDto | null = null;
    try {
      const response = await fetch(`${frontendConfig.apiBaseUrl}/market/freshness?exchange=${exchange}`, { cache: "no-store" });
      if (response.ok) freshness = ((await response.json()) as ApiResponse<BackendMarketFreshnessDto>).data ?? null;
    } catch { /* Dated facts can render while the current price check is withheld. */ }
    return { status: "ok", data: fenceCurrentEntryPayload(data, freshness, Date.now(), { symbol: normalizedSymbol, exchange }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stock workspace request failed";
    return { status: "error", message };
  }
}
