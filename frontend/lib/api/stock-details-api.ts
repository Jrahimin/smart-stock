import { backendApiGet } from "@/lib/api/backend-api-client";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto, StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";

export function getStockWorkspace(exchange: ExchangeCode, symbol: string) {
  return backendApiGet<StockWorkspaceDto>(`/stock-details/${exchange}/${symbol.toUpperCase()}/workspace`);
}

export function getStockDecisionSupport(exchange: ExchangeCode, symbol: string) {
  return backendApiGet<StockDecisionSupportDto>(
    `/stock-details/${exchange}/${symbol.toUpperCase()}/decision-support`,
  );
}
