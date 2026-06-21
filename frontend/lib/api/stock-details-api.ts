import { backendApiGetMarket } from "@/lib/api/backend-api-client";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto, StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { encodeStockSymbolSegment } from "@/lib/seo/stock-page-seo";

export function getStockWorkspace(exchange: ExchangeCode, symbol: string) {
  return backendApiGetMarket<StockWorkspaceDto>(`/stock-details/${exchange}/${encodeStockSymbolSegment(symbol)}/workspace`);
}

export function getStockDecisionSupport(exchange: ExchangeCode, symbol: string) {
  return backendApiGetMarket<StockDecisionSupportDto>(
    `/stock-details/${exchange}/${encodeStockSymbolSegment(symbol)}/decision-support`,
  );
}

export type SectorContextDto = {
  sector_name: string;
  stock_count: number;
  median_pe: number | null;
  median_pb: number | null;
  sector_trend_percent: number | null;
  sector_trend_window: string | null;
  top_performer: { symbol: string; change_percent: number } | null;
  worst_performer: { symbol: string; change_percent: number } | null;
  ranks: Array<{ key: string; label: string; rank: number; total: number }>;
  comparative_snapshot: Array<{
    key: string;
    label: string;
    stock_value: number | null;
    sector_median: number | null;
    market_median: number | null;
  }>;
};

export function getSectorContext(exchange: ExchangeCode, symbol: string) {
  return backendApiGetMarket<SectorContextDto>(`/stock-details/${exchange}/${encodeStockSymbolSegment(symbol)}/sector-context`);
}
