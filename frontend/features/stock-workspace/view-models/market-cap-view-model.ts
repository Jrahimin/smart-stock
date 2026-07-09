import type { BackendStockDto } from "@/lib/api/backend-api-types";
import type { DisplayMetricsDto, StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { formatMarketCapBdt } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

/**
 * Display-only market cap formatter.
 * Prefer backend `display_metrics.market_cap` (Rule #1). Legacy scaling remains
 * only as a temporary fallback when older payloads omit display_metrics.
 */
export function resolveDisplayedMarketCap(
  stock: BackendStockDto | null,
  intelligence: StockIntelligenceModel | null,
  decisionSupport?: StockDecisionSupportDto | null,
  displayMetrics?: DisplayMetricsDto | null,
): string {
  if (displayMetrics?.market_cap != null) {
    return formatMarketCapBdt(displayMetrics.market_cap);
  }

  const currentPrice = intelligence?.latestPrice ?? displayMetrics?.current_price ?? null;
  const valuation = decisionSupport?.valuation;
  const storedCap = valuation?.market_cap ?? (stock?.market_cap != null ? Number(stock.market_cap) : null);
  const valuationClose = valuation?.close_price ?? null;

  if (currentPrice != null && currentPrice > 0 && storedCap != null && valuationClose != null && valuationClose > 0) {
    return formatMarketCapBdt(storedCap * (currentPrice / valuationClose));
  }

  return formatMarketCapBdt(storedCap);
}
