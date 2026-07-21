import { backendApiGet, backendApiPut } from "@/lib/api/backend-api-client";
import type { BackendPortfolioWorkspaceDto, ExchangeCode } from "@/lib/api/backend-api-types";

const NO_STORE = { cache: "no-store" } as RequestInit;

export type PortfolioEmailPreferenceDto = {
  enabled: boolean;
  locale: "en" | "bn";
};

export function getPortfolioWorkspace(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendPortfolioWorkspaceDto>(
    "/portfolio/workspace",
    { exchange },
    NO_STORE,
  );
}

export function getPortfolioEmailPreference() {
  return backendApiGet<PortfolioEmailPreferenceDto>("/portfolio/email-preference", undefined, NO_STORE);
}

export function savePortfolioEmailPreference(payload: PortfolioEmailPreferenceDto) {
  return backendApiPut<PortfolioEmailPreferenceDto>("/portfolio/email-preference", payload, NO_STORE);
}
