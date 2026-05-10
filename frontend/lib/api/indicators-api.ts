import { backendApiGet } from "@/lib/api/backend-api-client";
import type { BackendTechnicalIndicatorDto } from "@/lib/api/backend-api-types";

export function listStockIndicators(stockId: string, limit = 200, offset = 0) {
  return backendApiGet<BackendTechnicalIndicatorDto[]>(`/stocks/${stockId}/indicators`, {
    limit,
    offset,
  });
}
