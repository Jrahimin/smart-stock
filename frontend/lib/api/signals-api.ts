import { backendApiGet } from "@/lib/api/backend-api-client";
import type { BackendTradingSignalDto } from "@/lib/api/backend-api-types";

export function listStockSignals(stockId: string, limit = 100, offset = 0) {
  return backendApiGet<BackendTradingSignalDto[]>(`/stocks/${stockId}/signals`, {
    limit,
    offset,
  });
}
