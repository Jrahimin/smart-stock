import { backendApiGet } from "@/lib/api/backend-api-client";
import type { BackendUniverseRowsDto, ExchangeCode } from "@/lib/api/backend-api-types";

export function listUniverseRows(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendUniverseRowsDto>("/market/universe-rows", { exchange });
}
