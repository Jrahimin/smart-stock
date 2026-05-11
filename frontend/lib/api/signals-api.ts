import { backendApiGet } from "@/lib/api/backend-api-client";
import type { BackendTradingSignalDto } from "@/lib/api/backend-api-types";

export function listLatestSignals(limit = 500, offset = 0) {
  return backendApiGet<BackendTradingSignalDto[]>("/signals/latest", {
    limit,
    offset,
  });
}

export function listStockSignals(stockId: string, limit = 100, offset = 0) {
  return backendApiGet<BackendTradingSignalDto[]>(`/stocks/${stockId}/signals`, {
    limit,
    offset,
  });
}
