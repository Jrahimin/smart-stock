import { backendApiGetMarket } from "@/lib/api/backend-api-client";
import type { BackendUniverseRowsDto, ExchangeCode } from "@/lib/api/backend-api-types";

export function listUniverseRows(exchange: ExchangeCode = "DSE", generation?: string | null, fresh = false) {
  return backendApiGetMarket<BackendUniverseRowsDto>("/market/universe-rows", { exchange }, fresh ? { cache: "no-store" } : undefined, generation ?? undefined);
}
