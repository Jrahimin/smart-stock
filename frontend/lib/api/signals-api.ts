import { backendApiGetMarket } from "@/lib/api/backend-api-client";
import type { BackendTradingSignalDto } from "@/lib/api/backend-api-types";

export function listLatestSignals(limit = 500, offset = 0) {
  return backendApiGetMarket<BackendTradingSignalDto[]>("/signals/latest", {
    limit,
    offset,
  });
}

export function listStockSignals(stockId: string, limit = 100, offset = 0) {
  return backendApiGetMarket<BackendTradingSignalDto[]>(`/stocks/${stockId}/signals`, {
    limit,
    offset,
  });
}
