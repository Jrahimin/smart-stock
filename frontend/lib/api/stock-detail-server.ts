import type { ExchangeCode, ApiResponse } from "@/lib/api/backend-api-types";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { frontendConfig } from "@/lib/frontend-config";
import { STOCK_DETAIL_REVALIDATE_SECONDS } from "@/lib/seo/stock-detail-cache";
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
    const response = await fetch(`${frontendConfig.apiBaseUrl}${path}`, {
      next: { revalidate: STOCK_DETAIL_REVALIDATE_SECONDS },
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

    return { status: "ok", data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stock workspace request failed";
    return { status: "error", message };
  }
}
