import { backendApiGet } from "@/lib/api/backend-api-client";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";

export function getStockDecisionSupport(exchange: ExchangeCode, symbol: string) {
  return backendApiGet<StockDecisionSupportDto>(
    `/stock-details/${exchange}/${symbol.toUpperCase()}/decision-support`,
  );
}
