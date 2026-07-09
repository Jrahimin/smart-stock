import type { BackendStockDto } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { formatMarketCapBdt } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

/**
 * Single source for displayed market cap: scale stored valuation cap to the
 * latest OHLCV close when valuation snapshot close is available.
 */
export function resolveDisplayedMarketCap(
  stock: BackendStockDto | null,
  intelligence: StockIntelligenceModel | null,
  decisionSupport?: StockDecisionSupportDto | null,
): string {
  const currentPrice = intelligence?.latestPrice ?? null;
  const valuation = decisionSupport?.valuation;
  const storedCap = valuation?.market_cap ?? (stock?.market_cap != null ? Number(stock.market_cap) : null);
  const valuationClose = valuation?.close_price ?? null;

  if (currentPrice != null && currentPrice > 0 && storedCap != null && valuationClose != null && valuationClose > 0) {
    return formatMarketCapBdt(storedCap * (currentPrice / valuationClose));
  }

  return formatMarketCapBdt(storedCap);
}
