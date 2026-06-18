import { backendApiGetMarket } from "@/lib/api/backend-api-client";
import type { BackendUniverseRowsDto, ExchangeCode } from "@/lib/api/backend-api-types";

export function listUniverseRows(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendUniverseRowsDto>("/market/universe-rows", { exchange });
}
