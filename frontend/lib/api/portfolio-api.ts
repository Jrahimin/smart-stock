import { backendApiGet } from "@/lib/api/backend-api-client";
import type { BackendPortfolioWorkspaceDto, ExchangeCode } from "@/lib/api/backend-api-types";

const NO_STORE = { cache: "no-store" } as RequestInit;

export function getPortfolioWorkspace(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendPortfolioWorkspaceDto>(
    "/portfolio/workspace",
    { exchange },
    NO_STORE,
  );
}
